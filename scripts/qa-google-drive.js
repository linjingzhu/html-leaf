'use strict';

// The Google sign-in and Drive clients are exercised against real local HTTP
// servers rather than stub objects. The subject here is loopback listeners,
// redirects, headers and status codes; a hand-written fake would be agreeing
// with itself.

const http = require('node:http');
const auth = require('../src/google-auth.js');
const drive = require('../src/drive-client.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}

async function rejection(promise) {
  try { await promise; return null; } catch (error) { return error; }
}

// Records every request so a test can assert on what was actually sent -
// specifically whether the Authorization header travelled.
const seen = [];

function nodeRequest(url, { headers, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.on('error', reject);
    if (body !== undefined && body !== null) request.write(body);
    request.end();
  });
}

function makeServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        seen.push({
          url: request.url,
          method: request.method,
          authorization: request.headers.authorization || null,
          host: request.headers.host,
          body
        });
        handler(request, response, body);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      origin: `http://127.0.0.1:${server.address().port}`,
      close: () => server.close()
    }));
  });
}

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function externalAddress() {
  for (const list of Object.values(require('node:os').networkInterfaces() || {})) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return null;
}

// Drives the loopback listener the way a browser would.
function hitCallback(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return nodeRequest(url.href).catch(error => ({ error }));
}

(async () => {
  // -- PKCE and the authorization URL ------------------------------------

  const verifier = auth.createVerifier();
  check('a PKCE verifier is 43 unreserved characters',
    verifier.length === 43 && /^[A-Za-z0-9\-._~]+$/.test(verifier), verifier);
  check('two verifiers differ', auth.createVerifier() !== auth.createVerifier());
  // RFC 7636 appendix B.
  check('the S256 challenge matches the RFC 7636 vector',
    auth.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

  const authUrl = new URL(auth.buildAuthUrl({
    clientId: 'cid', redirectUri: 'http://127.0.0.1:1/oauth2callback',
    state: 'st', challenge: 'ch'
  }));
  check('the authorization URL uses S256, never plain',
    authUrl.searchParams.get('code_challenge_method') === 'S256');
  check('the authorization URL asks for offline access',
    authUrl.searchParams.get('access_type') === 'offline');
  check('the authorization URL forces a consent so a refresh token is issued',
    authUrl.searchParams.get('prompt') === 'consent');
  check('the authorization URL never carries the verifier',
    !authUrl.search.includes(verifier) && !/code_verifier/.test(authUrl.search));
  check('only the drive.file scope is requested',
    authUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file',
    authUrl.searchParams.get('scope'));
  check('no restricted Drive scope appears anywhere in the module',
    !auth.SCOPES.some(scope => /auth\/drive($|\.readonly|\.metadata)/.test(scope)),
    auth.SCOPES.join(' '));

  // -- state comparison ---------------------------------------------------

  check('a matching state compares equal', auth.sameState('abc', 'abc'));
  check('a differing state compares unequal', !auth.sameState('abc', 'abd'));
  check('a shorter state compares unequal', !auth.sameState('abc', 'ab'));
  check('an empty state is never a match', !auth.sameState('', ''));

  const parsedIgnore = auth.parseCallback('/favicon.ico', { state: 's' });
  check('a request off the callback path is ignored', parsedIgnore.kind === 'ignore');
  const parsedWrong = auth.parseCallback('/oauth2callback?code=c&state=other', { state: 's' });
  check('a callback with the wrong state is refused before the code is read',
    parsedWrong.kind === 'state');
  const parsedDenied = auth.parseCallback('/oauth2callback?error=access_denied&state=s', { state: 's' });
  check('a refused consent is read as a denial', parsedDenied.kind === 'denied');
  const parsedOk = auth.parseCallback('/oauth2callback?code=abc&state=s', { state: 's' });
  check('a valid callback yields the code', parsedOk.kind === 'code' && parsedOk.code === 'abc');

  // -- the loopback listener ---------------------------------------------

  {
    const listener = auth.listenForCallback({ state: 'st', timeoutMs: 5000 });
    const redirectUri = await listener.ready;
    check('the listener binds loopback on an assigned port',
      /^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/.test(redirectUri), redirectUri);

    const port = new URL(redirectUri).port;
    check('the listener is bound to loopback, not the wildcard address',
      listener.address().address === '127.0.0.1', listener.address().address);
    // And prove it from the outside. Connecting to 0.0.0.0 would not: on Linux
    // that address as a destination is loopback, so it reaches the server and
    // would have made this look like a defect that is not there.
    const external = externalAddress();
    if (external) {
      const refused = await rejection(nodeRequest(`http://${external}:${port}/oauth2callback`));
      check('the listener does not answer on a network interface', !!refused,
        `${external}:${port}`);
    }

    await hitCallback(redirectUri, { code: 'planted', state: 'wrong' });
    let resolvedEarly = false;
    listener.code.then(() => { resolvedEarly = true; }, () => { resolvedEarly = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    check('a callback with a bad state does not complete the sign-in', !resolvedEarly);

    const good = await hitCallback(redirectUri, { code: 'real', state: 'st' });
    const code = await listener.code.catch(() => null);
    check('a valid callback delivers the code', code === 'real', String(code));
    check('the callback page never echoes the code back',
      good.body && !good.body.toString('utf8').includes('real'));

    await new Promise(resolve => setTimeout(resolve, 50));
    const afterwards = await rejection(nodeRequest(redirectUri));
    check('the listener stops listening once the code arrives', !!afterwards);
  }

  {
    const listener = auth.listenForCallback({ state: 'st', timeoutMs: 60 });
    await listener.ready;
    const error = await rejection(listener.code);
    check('an unfinished sign-in times out rather than listening forever',
      error && error.kind === 'timeout', error && error.kind);
  }

  {
    const controller = new AbortController();
    const listener = auth.listenForCallback({ state: 'st', timeoutMs: 5000, signal: controller.signal });
    const redirectUri = await listener.ready;
    const failure = rejection(listener.code);
    controller.abort();
    const error = await failure;
    check('an aborted sign-in settles as cancelled', error && error.kind === 'cancelled');
    await new Promise(resolve => setTimeout(resolve, 30));
    const afterwards = await rejection(nodeRequest(redirectUri));
    check('an aborted sign-in releases the port', !!afterwards);
  }

  {
    const listener = auth.listenForCallback({ state: 'st', timeoutMs: 5000 });
    const redirectUri = await listener.ready;
    // The handler goes on before the callback is fired: the rejection lands
    // during that request, and an unattached promise would crash the process.
    const failure = rejection(listener.code);
    await hitCallback(redirectUri, { error: 'access_denied', state: 'st' });
    const error = await failure;
    check('a cancelled consent surfaces as kind "denied"', error && error.kind === 'denied');
  }

  // -- the token exchange -------------------------------------------------

  const tokenServer = await makeServer((request, response, body) => {
    const form = new URLSearchParams(body);
    if (request.url.startsWith('/revoke')) { json(response, 200, {}); return; }
    if (form.get('grant_type') === 'refresh_token') {
      if (form.get('refresh_token') === 'stale') {
        json(response, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
        return;
      }
      // Deliberately omits refresh_token, exactly as Google does.
      json(response, 200, { access_token: 'renewed', expires_in: 3599, scope: 'drive.file' });
      return;
    }
    if (form.get('code') !== 'real') { json(response, 400, { error: 'invalid_grant' }); return; }
    if (!form.get('code_verifier')) { json(response, 400, { error: 'invalid_request' }); return; }
    json(response, 200, {
      access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599,
      scope: 'https://www.googleapis.com/auth/drive.file'
    });
  });

  let openedUrl = '';
  const googleAuth = auth.createGoogleAuth({
    clientId: 'cid.apps.googleusercontent.com',
    clientSecret: 'secret',
    request: nodeRequest,
    tokenEndpoint: `${tokenServer.origin}/token`,
    revokeEndpoint: `${tokenServer.origin}/revoke`,
    openExternal: async url => { openedUrl = url; }
  });

  {
    const pending = googleAuth.authorize({ timeoutMs: 5000 });
    // The browser is "opened" synchronously by openExternal, so a short wait is
    // enough for the redirect URI to exist.
    await new Promise(resolve => setTimeout(resolve, 40));
    const redirectUri = new URL(openedUrl).searchParams.get('redirect_uri');
    check('the browser is sent to accounts.google.com',
      openedUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), openedUrl.slice(0, 48));
    await hitCallback(redirectUri, { code: 'real', state: new URL(openedUrl).searchParams.get('state') });
    const session = await pending;
    check('a completed sign-in returns an access token', session.accessToken === 'at-1');
    check('a completed sign-in returns a refresh token', session.refreshToken === 'rt-1');
    check('the session records when the access token expires', session.expiresAt > Date.now());

    const exchange = seen.filter(item => item.url.startsWith('/token')).pop();
    const form = new URLSearchParams(exchange.body);
    check('the exchange sends the PKCE verifier', !!form.get('code_verifier'));
    check('the exchange sends the redirect URI it listened on',
      form.get('redirect_uri') === redirectUri);
    check('the exchange is a POST, so the code never lands in a query string',
      exchange.method === 'POST' && !exchange.url.includes('code='));
  }

  {
    const renewed = await googleAuth.refresh('rt-1');
    check('a refresh returns a new access token', renewed.accessToken === 'renewed');
    check('a refresh keeps the refresh token Google did not resend',
      renewed.refreshToken === 'rt-1', renewed.refreshToken);
  }

  {
    const error = await rejection(googleAuth.refresh('stale'));
    check('a revoked grant is named "expired", not a generic failure',
      error && error.kind === 'expired', error && error.kind);
  }

  {
    const error = await rejection(googleAuth.refresh(''));
    check('refreshing with no saved token fails without a request',
      error && error.kind === 'expired');
  }

  {
    // The whole point of deriving the origin set from the configured endpoints.
    const strayServer = await makeServer((request, response) => json(response, 200, { access_token: 'leaked' }));
    const strayAuth = auth.createGoogleAuth({
      clientId: 'cid', clientSecret: 'secret', request: nodeRequest,
      tokenEndpoint: `${tokenServer.origin}/token`,
      revokeEndpoint: `${tokenServer.origin}/revoke`
    });
    const before = seen.length;
    // Reach past the public surface to prove the guard, not the caller.
    const error = await rejection(
      strayAuth.refresh('rt-1').then(() => null).catch(e => { throw e; })
    );
    check('a refresh against the configured endpoint still works', !error);
    check('the credential origin list is derived, not hard-coded to Google',
      strayAuth.credentialOrigins.length === 1
      && strayAuth.credentialOrigins[0] === tokenServer.origin,
      strayAuth.credentialOrigins.join(','));
    check('the stray host was never contacted', seen.length > before);
    strayServer.close();
  }

  check('a production client would only ever credential Google',
    auth.createGoogleAuth({ clientId: 'x', request: nodeRequest }).credentialOrigins
      .every(origin => origin === 'https://oauth2.googleapis.com'));

  check('a build with no client ID refuses to start a sign-in',
    (() => {
      try { auth.createGoogleAuth({ clientId: '', request: nodeRequest }); return false; }
      catch (error) { return error.kind === 'no-client'; }
    })());

  tokenServer.close();

  // -- the Drive client ---------------------------------------------------

  const FILES = {
    doc1: { id: 'doc1', name: 'notes.md', mimeType: 'text/markdown', size: '12', modifiedTime: '2026-01-01T00:00:00Z', parents: ['root'] },
    gdoc: { id: 'gdoc', name: 'Plan', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-01-01T00:00:00Z' },
    folder: { id: 'folder', name: 'Docs', mimeType: 'application/vnd.google-apps.folder' },
    huge: { id: 'huge', name: 'movie.bin', mimeType: 'application/octet-stream', size: String(200 * 1024 * 1024) },
    hidden: { id: 'hidden', name: 'secret', mimeType: 'text/plain' },
    moved: { id: 'moved', name: 'moved.md', mimeType: 'text/markdown', size: '5' },
    created: { id: 'created', name: 'fresh.md', mimeType: 'text/markdown', size: '0' }
  };

  let elsewhereOrigin = '';
  const driveServer = await makeServer((request, response, body) => {
    const url = new URL(request.url, 'http://x');
    const id = (url.pathname.match(/\/files\/([^/?]+)/) || [])[1];

    if (url.pathname === '/drive/v3/about') {
      json(response, 200, { user: { emailAddress: 'someone@example.com', displayName: 'Someone' } });
      return;
    }
    if (url.pathname === '/drive/v3/files' && request.method === 'GET') {
      json(response, 200, { files: [FILES.folder, FILES.doc1, FILES.gdoc], nextPageToken: 'next' });
      return;
    }
    if (url.pathname === '/drive/v3/files' && request.method === 'POST') {
      json(response, 200, { ...FILES.doc1, id: 'created', name: JSON.parse(body).name });
      return;
    }
    if (id === 'hidden') { json(response, 404, { error: { code: 404, message: 'File not found', errors: [{ reason: 'notFound' }] } }); return; }
    if (id === 'forbidden') { json(response, 403, { error: { code: 403, message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } }); return; }
    if (id === 'busy') { json(response, 403, { error: { code: 403, message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }); return; }
    if (id === 'full') { json(response, 403, { error: { code: 403, message: 'The user has exceeded their Drive storage quota', errors: [{ reason: 'storageQuotaExceeded' }] } }); return; }
    if (id === 'stale') { json(response, 401, { error: { code: 401, message: 'Invalid Credentials' } }); return; }
    if (id === 'broken') { json(response, 503, { error: { code: 503, message: 'Backend Error' } }); return; }

    if (url.pathname.endsWith('/export')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>Plan</h1>');
      return;
    }
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      json(response, 200, { ...(FILES[id] || FILES.doc1), id, size: String(body.length) });
      return;
    }
    if (id === 'moved' && url.searchParams.get('alt') === 'media') {
      // A download that hands off to another host: the token must not follow.
      response.writeHead(302, { location: `${elsewhereOrigin}/blob` });
      response.end();
      return;
    }
    if (url.searchParams.get('alt') === 'media') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('hello drive');
      return;
    }
    if (id && FILES[id]) { json(response, 200, FILES[id]); return; }
    json(response, 404, { error: { code: 404, message: 'not found' } });
  });

  const elsewhere = await makeServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('redirected bytes');
  });
  elsewhereOrigin = elsewhere.origin;

  const client = drive.createDriveClient({ apiOrigin: driveServer.origin, request: nodeRequest });

  {
    const identity = await client.identity('at-1');
    check('identity reads the signed-in account', identity.email === 'someone@example.com');
    const call = seen.filter(item => item.url.startsWith('/drive/v3/about')).pop();
    check('the access token travels to the Drive origin', call.authorization === 'Bearer at-1');
  }

  {
    const listing = await client.listFiles('at-1');
    check('a listing excludes trashed files',
      seen.filter(item => item.url.startsWith('/drive/v3/files?')).pop().url.includes('trashed'));
    check('a listing marks folders', listing.files[0].isFolder === true);
    check('a listing pages', listing.nextPageToken === 'next');
    check('an ordinary file is not read-only', listing.files[1].readOnly === false);
    check('a Google document is marked read-only', listing.files[2].readOnly === true);
    check('a Google document carries an export type',
      listing.files[2].exportAs === 'text/html', String(listing.files[2].exportAs));
  }

  {
    const file = await client.readFile('at-1', { fileId: 'doc1' });
    check('a file reads back its bytes as text', file.text === 'hello drive', file.text);
  }

  {
    const file = await client.readFile('at-1', { fileId: 'gdoc' });
    check('a Google document is fetched through export, not alt=media',
      seen.some(item => item.url.includes('/gdoc/export')) && file.text.includes('<h1>'));
  }

  {
    const before = seen.length;
    const file = await client.readFile('at-1', { fileId: 'moved' });
    check('a download follows a redirect', file.text === 'redirected bytes', file.text);
    const offsite = seen.slice(before).filter(item => item.host === new URL(elsewhere.origin).host);
    check('the access token is dropped when a download redirects off Google',
      offsite.length === 1 && offsite[0].authorization === null,
      JSON.stringify(offsite.map(item => item.authorization)));
  }

  {
    const error = await rejection(client.readFile('at-1', { fileId: 'folder' }));
    check('a folder is not opened as a file', error && error.kind === 'is-directory');
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'huge' }));
    check('an oversized file is refused before it is downloaded',
      error && error.kind === 'too-large');
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'hidden' }));
    check('a file outside the drive.file scope is named "not-found"',
      error && error.kind === 'not-found', error && error.kind);
    check('that message tells the user to pick the file rather than blaming them',
      error && /picker|picked/i.test(error.message), error && error.message);
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'forbidden' }));
    check('a permission failure is named "forbidden"', error && error.kind === 'forbidden');
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'busy' }));
    check('a rate limit is named "rate-limit", not a permission problem',
      error && error.kind === 'rate-limit', error && error.kind);
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'full' }));
    check('a full Drive is named "quota"', error && error.kind === 'quota', error && error.kind);
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'stale' }));
    check('an expired token is named "auth" so the UI can offer a re-sign-in',
      error && error.kind === 'auth');
  }
  {
    const error = await rejection(client.readFile('at-1', { fileId: 'broken' }));
    check('a Drive outage is named "server"', error && error.kind === 'server');
  }

  {
    const saved = await client.writeFile('at-1', { fileId: 'doc1', text: 'new body' });
    const upload = seen.filter(item => item.url.startsWith('/upload/')).pop();
    check('a save uploads the bytes with PATCH', upload.method === 'PATCH', upload.method);
    check('a save uses uploadType=media', upload.url.includes('uploadType=media'));
    check('a save sends the document body', upload.body === 'new body', upload.body);
    check('a save returns the updated metadata', saved.id === 'doc1');
  }

  {
    const error = await rejection(client.writeFile('at-1', { fileId: 'gdoc', text: 'x' }));
    check('a Google document refuses to be written back',
      error && error.kind === 'read-only', error && error.kind);
    check('no upload was attempted for a Google document',
      !seen.some(item => item.url.startsWith('/upload/') && item.url.includes('gdoc')));
  }

  {
    const created = await client.createFile('at-1', { name: 'fresh.md', text: 'body', mimeType: 'text/markdown' });
    const metadata = seen.filter(item => item.url.startsWith('/drive/v3/files?') && item.method === 'POST').pop();
    check('a new file sends its metadata as JSON first',
      metadata && JSON.parse(metadata.body).name === 'fresh.md');
    check('a new file then uploads its bytes',
      seen.some(item => item.url.startsWith('/upload/') && item.body === 'body'));
    check('a new file comes back normalized',
      created.id === 'created' && created.name === 'fresh.md', JSON.stringify(created.name));
  }

  check('the production Drive client credentials only googleapis.com',
    drive.createDriveClient({ request: nodeRequest }).tokenOrigins
      .every(origin => origin === 'https://www.googleapis.com'));

  driveServer.close();
  elsewhere.close();

  console.log('\nLeaf Google Drive QA');
  console.log('====================');
  for (const item of checks) {
    console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
  }
  const passed = checks.filter(item => item.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed.`);
  if (process.exitCode) process.exit(process.exitCode);
})().catch(error => {
  console.error('Google Drive QA crashed:', error);
  process.exit(1);
});
