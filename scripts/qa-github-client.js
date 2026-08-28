'use strict';

// The GitHub client is exercised against a real local HTTP server rather than a
// stub object: redirects, headers and status codes are the whole subject here,
// and a hand-written fake would be agreeing with itself.

const http = require('node:http');
const { createGitHubClient, GitHubError, TOKEN_ORIGINS } = require('../src/github-client.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}

// Records every request so a test can assert on what was actually sent -
// specifically whether the Authorization header travelled.
const seen = [];

function nodeRequest(url, { headers } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

const TREE = {
  sha: 'treesha',
  truncated: false,
  tree: [
    { path: 'docs', type: 'tree', sha: 'd1' },
    { path: 'docs/guide.md', type: 'blob', sha: 'b1', size: 120 },
    { path: 'src/app.js', type: 'blob', sha: 'b2', size: 4000 },
    { path: 'big.md', type: 'blob', sha: 'b3', size: 2 * 1024 * 1024 },
    { path: 'huge.bin', type: 'blob', sha: 'b4', size: 200 * 1024 * 1024 },
    { path: 'submodule', type: 'commit', sha: 'c1' }
  ]
};

function respond(response, status, payload, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function makeServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  // The API host, and a second host standing in for somewhere a redirect could
  // wander to.
  const api = await makeServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    seen.push({ host: 'api', path: url.pathname, auth: request.headers.authorization || null });

    if (url.pathname === '/user') return respond(response, 200, { login: 'octocat', name: 'Mona' });
    if (url.pathname === '/user/repos') {
      return respond(response, 200, [
        { full_name: 'octocat/docs', name: 'docs', owner: { login: 'octocat' }, private: false, default_branch: 'main', pushed_at: '2026-01-01T00:00:00Z' }
      ]);
    }
    if (url.pathname === '/repos/octocat/docs') {
      return respond(response, 200, { full_name: 'octocat/docs', name: 'docs', owner: { login: 'octocat' }, private: true, default_branch: 'trunk' });
    }
    if (url.pathname === '/repos/octocat/docs/branches') {
      return respond(response, 200, [{ name: 'main' }, { name: 'trunk' }]);
    }
    if (url.pathname === '/repos/octocat/docs/git/trees/main') {
      return respond(response, 200, url.searchParams.get('recursive') === '1' ? TREE : { tree: [], truncated: false });
    }
    if (url.pathname === '/repos/octocat/docs/git/trees/wide') {
      return respond(response, 200, { sha: 'w', truncated: true, tree: [{ path: 'a.md', type: 'blob', sha: 'x', size: 1 }] });
    }
    if (url.pathname === '/repos/octocat/docs/contents/docs/guide.md') {
      return respond(response, 200, {
        path: 'docs/guide.md', sha: 'b1', size: 12,
        content: Buffer.from('# Guide\n\nBody.\n', 'utf8').toString('base64')
      });
    }
    if (url.pathname === '/repos/octocat/docs/contents/big.md') {
      // What GitHub really does above the inline limit: no content, just a sha.
      return respond(response, 200, { path: 'big.md', sha: 'b3', size: 2 * 1024 * 1024, content: '' });
    }
    if (url.pathname === '/repos/octocat/docs/git/blobs/b3') {
      return respond(response, 200, { sha: 'b3', content: Buffer.from('LARGE', 'utf8').toString('base64') });
    }
    if (url.pathname === '/repos/octocat/docs/contents/huge.bin') {
      return respond(response, 200, { path: 'huge.bin', sha: 'b4', size: 200 * 1024 * 1024, content: '' });
    }
    if (url.pathname === '/repos/octocat/docs/contents/docs') {
      return respond(response, 200, [{ path: 'docs/guide.md', type: 'file' }]);
    }
    if (url.pathname === '/expired') return respond(response, 401, { message: 'Bad credentials' });
    if (url.pathname === '/scoped') return respond(response, 403, { message: 'Resource not accessible by personal access token' });
    if (url.pathname === '/spent') {
      return respond(response, 403, { message: 'API rate limit exceeded' },
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800) });
    }
    if (url.pathname === '/missing') return respond(response, 404, { message: 'Not Found' });
    if (url.pathname === '/empty') return respond(response, 409, { message: 'Git Repository is empty.' });
    if (url.pathname === '/broken') return respond(response, 502, { message: 'Bad gateway' });
    if (url.pathname === '/garbage') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end('<html>not json</html>');
    }
    if (url.pathname === '/hop-elsewhere') {
      return respond(response, 302, '', { location: `http://127.0.0.1:${elsewhere.address().port}/landing` });
    }
    if (url.pathname === '/hop-here') {
      return respond(response, 302, '', { location: '/user' });
    }
    if (url.pathname === '/loop') {
      return respond(response, 302, '', { location: '/loop' });
    }
    return respond(response, 404, { message: 'Not Found' });
  });

  const elsewhere = await makeServer((request, response) => {
    seen.push({ host: 'elsewhere', path: request.url, auth: request.headers.authorization || null });
    respond(response, 200, { landed: true });
  });

  const origin = `http://127.0.0.1:${api.address().port}`;
  const client = createGitHubClient({ apiOrigin: origin, request: nodeRequest });
  const TOKEN = 'ghp_secret_token';

  const fails = async (run, kind) => {
    try { await run(); return { pass: false, detail: 'no error thrown' }; }
    catch (error) {
      return { pass: error instanceof GitHubError && error.kind === kind, detail: `${error.kind}: ${error.message}` };
    }
  };

  // --- identity and listings ---------------------------------------------
  const me = await client.identity(TOKEN);
  check('identity returns the login', me.login === 'octocat', JSON.stringify(me));
  check('the token reaches the API host',
    seen.some(entry => entry.host === 'api' && entry.path === '/user' && entry.auth === `Bearer ${TOKEN}`));

  const repos = await client.listRepositories(TOKEN);
  check('repositories are normalised',
    repos.length === 1 && repos[0].fullName === 'octocat/docs' && repos[0].defaultBranch === 'main',
    JSON.stringify(repos));

  const repo = await client.repository(TOKEN, { owner: 'octocat', repo: 'docs' });
  check('a repository reports its own default branch and privacy',
    repo.defaultBranch === 'trunk' && repo.private === true, JSON.stringify(repo));

  const branches = await client.listBranches(TOKEN, { owner: 'octocat', repo: 'docs' });
  check('branches come back as names', branches.join(',') === 'main,trunk', branches.join(','));

  // --- the tree -----------------------------------------------------------
  const tree = await client.readTree(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'main' });
  check('the tree is fetched recursively in one call',
    tree.entries.length === 5, `${tree.entries.length} entries`);
  check('a submodule entry is dropped, blobs and trees are kept',
    !tree.entries.some(entry => entry.path === 'submodule')
    && tree.entries.find(entry => entry.path === 'docs')?.type === 'dir'
    && tree.entries.find(entry => entry.path === 'docs/guide.md')?.type === 'file');
  const wide = await client.readTree(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'wide' });
  check('a truncated listing says so rather than looking complete', wide.truncated === true);

  // --- reading files ------------------------------------------------------
  const file = await client.readFile(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'main', path: 'docs/guide.md' });
  check('a file decodes from base64 to text',
    file.text === '# Guide\n\nBody.\n' && file.sha === 'b1', JSON.stringify(file.text));

  const large = await client.readFile(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'main', path: 'big.md' });
  check('a file over the inline limit falls back to the blob endpoint',
    large.text === 'LARGE'
    && seen.some(entry => entry.path === '/repos/octocat/docs/git/blobs/b3'), large.text);

  check('a file too large to open is refused by name and size',
    (await fails(() => client.readFile(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'main', path: 'huge.bin' }), 'too-large')).pass);
  check('a directory asked for as a file is refused',
    (await fails(() => client.readFile(TOKEN, { owner: 'octocat', repo: 'docs', ref: 'main', path: 'docs' }), 'is-directory')).pass);

  // --- failures the UI has to tell apart ----------------------------------
  // Each case gets a server that answers the same way whatever the path,
  // because identity() asks for a root-relative /user and a path prefix on the
  // origin would simply be dropped.
  async function failingClient(status, payload, headers = {}) {
    const server = await makeServer((request, response) => respond(response, status, payload, headers));
    const failing = createGitHubClient({
      apiOrigin: `http://127.0.0.1:${server.address().port}`,
      request: nodeRequest
    });
    return { failing, close: () => server.close() };
  }

  const soon = String(Math.floor(Date.now() / 1000) + 1800);
  const cases = [
    [401, { message: 'Bad credentials' }, {}, 'auth', 'an expired token'],
    [403, { message: 'Resource not accessible by personal access token' }, {}, 'forbidden', 'a token missing a scope'],
    [403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': soon }, 'rate-limit', 'a spent rate limit'],
    [404, { message: 'Not Found' }, {}, 'not-found', 'something that is not there'],
    [409, { message: 'Git Repository is empty.' }, {}, 'empty-repo', 'a repository with no commits'],
    [502, { message: 'Bad gateway' }, {}, 'server', 'a GitHub outage'],
    [200, '<html>not json</html>', {}, 'parse', 'a non-JSON answer']
  ];
  for (const [status, payload, headers, kind, label] of cases) {
    const { failing, close } = await failingClient(status, payload, headers);
    const outcome = await fails(() => failing.identity(TOKEN), kind);
    check(`${label} is reported as ${kind}`, outcome.pass, outcome.detail);
    if (kind === 'rate-limit') {
      check('the rate-limit message says when it resets',
        /resets in about \d+ minute/.test(outcome.detail), outcome.detail);
    }
    close();
  }

  // --- redirects: the part that could leak the token ----------------------
  // The token only travels to the configured origin's host, so these run
  // against a client configured for the fixture host.
  const local = createGitHubClient({
    apiOrigin: origin,
    rawOrigin: origin,
    request: nodeRequest
  });

  seen.length = 0;
  await local.identity(TOKEN);
  check('the token reaches the configured API host',
    seen.some(entry => entry.host === 'api' && entry.path === '/user' && entry.auth === `Bearer ${TOKEN}`),
    JSON.stringify(seen));

  seen.length = 0;
  await createGitHubClient({ apiOrigin: `${origin}/hop-here`, rawOrigin: origin, request: nodeRequest })
    .identity(TOKEN);
  check('a redirect that stays on the API host keeps the token',
    seen.length >= 1 && seen.every(entry => entry.auth === `Bearer ${TOKEN}`),
    JSON.stringify(seen));

  seen.length = 0;
  const away = await makeServer((request, response) => {
    seen.push({ host: 'elsewhere', path: request.url, auth: request.headers.authorization || null });
    respond(response, 200, { landed: true });
  });
  const hopAway = await makeServer((request, response) => {
    seen.push({ host: 'api', path: request.url, auth: request.headers.authorization || null });
    respond(response, 302, '', { location: `http://127.0.0.1:${away.address().port}/landing` });
  });
  await createGitHubClient({
    apiOrigin: `http://127.0.0.1:${hopAway.address().port}`,
    rawOrigin: `http://127.0.0.1:${hopAway.address().port}`,
    request: nodeRequest
  }).identity(TOKEN);
  const offHost = seen.filter(entry => entry.host === 'elsewhere');
  check('a redirect off the API host drops the Authorization header',
    seen.some(entry => entry.host === 'api' && entry.auth === `Bearer ${TOKEN}`)
    && offHost.length === 1 && offHost[0].auth === null,
    JSON.stringify(seen));
  away.close();
  hopAway.close();

  const looping = await makeServer((request, response) =>
    respond(response, 302, '', { location: '/loop' }));
  check('a redirect loop stops instead of spinning',
    (await fails(() => createGitHubClient({
      apiOrigin: `http://127.0.0.1:${looping.address().port}`,
      request: nodeRequest
    }).identity(TOKEN), 'redirect')).pass);
  looping.close();

  // --- the host allowlist is the rule, not a comment ----------------------
  const production = createGitHubClient({ request: nodeRequest });
  check('a production client puts the token only on GitHub origins',
    production.tokenOrigins.length === 2
    && production.tokenOrigins.includes('https://api.github.com')
    && production.tokenOrigins.includes('https://raw.githubusercontent.com'),
    production.tokenOrigins.join(', '));
  check('the exported default origin set matches',
    TOKEN_ORIGINS.has('https://api.github.com') && TOKEN_ORIGINS.size === 2,
    [...TOKEN_ORIGINS].join(', '));
  // Same host, different port: still a different origin, so still no token.
  check('a different port on the same host is a different origin',
    !createGitHubClient({ apiOrigin: 'http://127.0.0.1:1', request: nodeRequest })
      .tokenOrigins.includes('http://127.0.0.1:2'));

  // --- raw URLs used as the preview base ----------------------------------
  const raw = client.rawUrlFor({ owner: 'octocat', repo: 'docs', ref: 'main', path: 'docs/guide.md' });
  check('a raw URL is built for the preview base',
    raw === 'https://raw.githubusercontent.com/octocat/docs/main/docs/guide.md', raw);
  const spaced = client.rawUrlFor({ owner: 'octocat', repo: 'docs', ref: 'main', path: 'a folder/b c.md' });
  check('a raw URL encodes path segments but keeps the separators',
    spaced.endsWith('/a%20folder/b%20c.md'), spaced);

  api.close();
  elsewhere.close();

  console.log('\nLeaf GitHub client QA');
  console.log('=====================');
  for (const item of checks) {
    console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
  }
  const passed = checks.filter(item => item.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed.`);
  if (process.exitCode) process.exit(process.exitCode);
})().catch(error => {
  console.error('GitHub client QA crashed:', error);
  process.exit(1);
});
