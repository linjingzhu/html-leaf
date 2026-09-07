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

async function rejection(promise) {
  try { await promise; return null; } catch (error) { return error; }
}

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
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    if (body !== undefined && body !== null) request.write(body);
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

  // --- the published site ------------------------------------------------

  {
    const pagesServer = await makeServer((request, response) => {
      if (request.url === '/repos/octocat/docs/pages') {
        respond(response, 200, {
          url: 'https://api.github.com/repos/octocat/docs/pages',
          status: 'built',
          cname: null,
          html_url: 'https://octocat.github.io/docs/'
        });
        return;
      }
      if (request.url === '/repos/octocat/branded/pages') {
        // The case that makes asking the API worth it: this repository does
        // not publish at octocat.github.io/branded.
        respond(response, 200, { status: 'built', cname: 'docs.example.com', html_url: 'https://docs.example.com/' });
        return;
      }
      if (request.url === '/repos/octocat/private-site/pages') {
        respond(response, 403, { message: 'Resource not accessible by personal access token' });
        return;
      }
      respond(response, 404, { message: 'Not Found' });
    });
    const pagesOrigin = `http://127.0.0.1:${pagesServer.address().port}`;
    const client = createGitHubClient({ apiOrigin: pagesOrigin, request: nodeRequest });

    const site = await client.pages('t', { owner: 'octocat', repo: 'docs' });
    check('a published repository reports its site',
      site.enabled === true && site.url === 'https://octocat.github.io/docs/', JSON.stringify(site.url));
    check('the site URL comes from GitHub, not from a guessed pattern',
      site.url.startsWith('https://octocat.github.io/'), site.url);

    const branded = await client.pages('t', { owner: 'octocat', repo: 'branded' });
    check('a custom domain is reported as the real address',
      branded.url === 'https://docs.example.com/' && branded.cname === 'docs.example.com',
      `${branded.url} / ${branded.cname}`);
    check('guessing owner.github.io/repo would have been wrong here',
      !branded.url.includes('github.io'), branded.url);

    const off = await client.pages('t', { owner: 'octocat', repo: 'nothing' });
    check('a repository with Pages switched off answers, rather than failing',
      off.enabled === false && off.url === '', JSON.stringify(off));

    // A token that cannot read Pages settings still opens the repository, so
    // this has to stay distinguishable from "no site".
    const forbidden = await rejection(client.pages('t', { owner: 'octocat', repo: 'private-site' }));
    check('a token without Pages permission is an error, not a missing site',
      forbidden && forbidden.kind === 'forbidden', forbidden && forbidden.kind);

    pagesServer.close();
  }

  // --- writing back --------------------------------------------------------

  {
    const writes = [];
    // Enforces the same rules GitHub does, so the client is tested against the
    // constraints it actually has to satisfy rather than a permissive stub.
    const HEAD = 'basecommitsha';
    const CURRENT = { 'docs/guide.md': 'blob-v1' };
    const branches = new Set(['main']);

    const writeServer = await makeServer((request, response) => {
      const chunks = [];
      request.on('data', c => chunks.push(c));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        writes.push({ method: request.method, url: request.url, body });
        const url = request.url;

        if (url === '/repos/o/r/git/ref/heads/main') {
          respond(response, 200, { object: { sha: HEAD } }); return;
        }
        if (url === '/repos/o/r/git/ref/heads/gone') { respond(response, 404, { message: 'Not Found' }); return; }
        if (url === '/repos/o/r/git/refs' && request.method === 'POST') {
          const name = String(JSON.parse(body).ref || '').replace('refs/heads/', '');
          if (branches.has(name)) { respond(response, 422, { message: 'Reference already exists' }); return; }
          branches.add(name);
          respond(response, 201, { ref: `refs/heads/${name}` }); return;
        }
        if (url.startsWith('/repos/o/r/contents/') && request.method === 'PUT') {
          const path = decodeURIComponent(url.replace('/repos/o/r/contents/', ''));
          const sent = JSON.parse(body);
          if (sent.sha !== CURRENT[path]) {
            respond(response, 409, { message: 'is at ' + CURRENT[path] + ' but expected ' + sent.sha }); return;
          }
          CURRENT[path] = 'blob-v2';
          respond(response, 200, {
            content: { sha: 'blob-v2' },
            commit: { sha: 'newcommit', html_url: 'https://github.com/o/r/commit/newcommit' }
          });
          return;
        }
        if (url === '/repos/o/r/pulls' && request.method === 'POST') {
          respond(response, 201, { number: 7, html_url: 'https://github.com/o/r/pull/7', state: 'open' }); return;
        }
        if (url === '/repos/o/r/pulls/7/merge' && request.method === 'PUT') {
          respond(response, 200, { merged: true, sha: 'mergedsha', message: 'Pull Request successfully merged' }); return;
        }
        respond(response, 404, { message: 'Not Found' });
      });
    });
    const origin = `http://127.0.0.1:${writeServer.address().port}`;
    const client = createGitHubClient({ apiOrigin: origin, request: nodeRequest });

    const head = await client.refHead('t', { owner: 'o', repo: 'r', ref: 'main' });
    check('the base commit of a branch is read before cutting from it', head === HEAD, head);

    const missing = await rejection(client.refHead('t', { owner: 'o', repo: 'r', ref: 'gone' }));
    check('a branch that does not exist fails as not-found',
      missing && missing.kind === 'not-found', missing && missing.kind);

    const made = await client.createBranch('t', { owner: 'o', repo: 'r', ref: 'main', branch: 'leaf/guide' });
    check('a new branch is cut from the branch that was opened',
      made.created === true && made.from === HEAD, JSON.stringify(made));

    // Saving twice in one session must add to the branch it already made.
    const again = await client.createBranch('t', { owner: 'o', repo: 'r', ref: 'main', branch: 'leaf/guide' });
    check('saving again reuses the branch instead of failing',
      again.created === false && again.branch === 'leaf/guide', JSON.stringify(again));

    // The sha is the whole safety property.
    const noSha = await rejection(client.commitFile('t', {
      owner: 'o', repo: 'r', branch: 'leaf/guide', path: 'docs/guide.md', text: 'x', message: 'm', sha: ''
    }));
    check('a commit without the blob it replaces is refused outright',
      noSha && noSha.kind === 'conflict', noSha && noSha.kind);
    check('that refusal never reached the network',
      !writes.some(w => w.method === 'PUT' && w.url.includes('contents')));

    const stale = await rejection(client.commitFile('t', {
      owner: 'o', repo: 'r', branch: 'leaf/guide', path: 'docs/guide.md',
      text: 'x', message: 'm', sha: 'blob-someone-else-changed-it'
    }));
    check('a stale sha is refused rather than overwriting someone else',
      stale && stale.kind === 'conflict', stale && stale.kind);
    check('the conflict tells the user to reload, not to retry',
      stale && /reload/i.test(stale.message), stale && stale.message);

    const saved = await client.commitFile('t', {
      owner: 'o', repo: 'r', branch: 'leaf/guide', path: 'docs/guide.md',
      text: '# new', message: 'Update guide', sha: 'blob-v1'
    });
    check('a commit returns the new blob so the next save is safe',
      saved.sha === 'blob-v2' && saved.commit === 'newcommit', JSON.stringify(saved));
    const put = writes.filter(w => w.method === 'PUT' && w.url.includes('contents')).pop();
    check('the commit carries the branch, never the opened one',
      JSON.parse(put.body).branch === 'leaf/guide', JSON.parse(put.body).branch);
    check('the body is sent base64, as the contents API requires',
      Buffer.from(JSON.parse(put.body).content, 'base64').toString('utf8') === '# new');

    const pr = await client.openPullRequest('t', {
      owner: 'o', repo: 'r', head: 'leaf/guide', base: 'main', title: 'Update guide'
    });
    check('the change arrives as a pull request', pr.number === 7 && pr.url.endsWith('/pull/7'), pr.url);
    const opened = JSON.parse(writes.filter(w => w.url === '/repos/o/r/pulls').pop().body);
    check('the pull request targets the branch that was opened',
      opened.base === 'main' && opened.head === 'leaf/guide', `${opened.head} -> ${opened.base}`);

    const merged = await client.mergePullRequest('t', { owner: 'o', repo: 'r', number: 7 });
    check('merging reports what GitHub did', merged.merged === true && merged.sha === 'mergedsha');

    writeServer.close();
  }

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
