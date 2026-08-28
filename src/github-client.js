'use strict';

// The GitHub API client. Everything that decides what leaves the machine lives
// here - which hosts may see the token, what a redirect is allowed to do, how a
// failure is named - so it can be exercised without a network by handing in a
// different `request`.

const API_ORIGIN = 'https://api.github.com';
const RAW_ORIGIN = 'https://raw.githubusercontent.com';

// The Authorization header goes to the hosts this client was configured for and
// nowhere else. A redirect that leaves them drops the header rather than
// following with it: that is the classic way a token ends up in a stranger's
// logs. Deriving the set from the configured origins rather than naming
// github.com keeps the rule true for a GitHub Enterprise origin too - a
// hard-coded list would have meant never sending the token there at all.
// Origins, not hostnames: two services on one host but different ports are
// different origins, and a token must not cross between them.
function originOf(value) {
  try { return new URL(value).origin; } catch { return null; }
}
function tokenOriginsFor(apiOrigin, rawOrigin) {
  return new Set([originOf(apiOrigin), originOf(rawOrigin)].filter(Boolean));
}
const TOKEN_ORIGINS = tokenOriginsFor(API_ORIGIN, RAW_ORIGIN);

const MAX_REDIRECTS = 5;
// The contents endpoint refuses to inline anything larger and answers with an
// empty content field, so those go through the blob endpoint instead.
const CONTENTS_INLINE_LIMIT = 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

class GitHubError extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    Object.assign(this, detail);
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

// Number(null) is 0, so reading a missing header straight into a number made
// every 403 look like a spent rate limit. An absent header has to stay absent.
function numericHeader(headers, name) {
  const raw = headerValue(headers, name);
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rateLimitFrom(headers) {
  const remaining = numericHeader(headers, 'x-ratelimit-remaining');
  const reset = numericHeader(headers, 'x-ratelimit-reset');
  return { remaining, resetAt: reset === null ? null : reset * 1000 };
}

function describeReset(resetAt) {
  if (!resetAt) return 'shortly';
  const minutes = Math.max(1, Math.round((resetAt - Date.now()) / 60000));
  return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// A failure the user can act on: which of these it is decides what the UI
// offers, so the classification lives with the request rather than the caller.
function classify(status, headers, body, url) {
  const rate = rateLimitFrom(headers);
  let apiMessage = '';
  try { apiMessage = String(JSON.parse(body || '{}').message || ''); } catch {}

  if (status === 401) {
    return new GitHubError('auth', 'That token is not valid any more. Sign in again to continue.');
  }
  if (status === 403 && rate.remaining === 0) {
    return new GitHubError('rate-limit',
      `GitHub's rate limit is spent. It resets ${describeReset(rate.resetAt)}.`,
      { resetAt: rate.resetAt });
  }
  if (status === 403) {
    return new GitHubError('forbidden',
      apiMessage || 'That token does not carry the permission this needs.');
  }
  if (status === 404) {
    return new GitHubError('not-found',
      'GitHub has nothing at that address, or the token cannot see it.');
  }
  if (status === 409) {
    return new GitHubError('empty-repo', 'That repository has no commits yet.');
  }
  if (status >= 500) {
    return new GitHubError('server', `GitHub answered ${status}. This is usually temporary.`);
  }
  return new GitHubError('http', apiMessage || `GitHub answered ${status} for ${url}.`);
}

function createGitHubClient({ apiOrigin = API_ORIGIN, rawOrigin = RAW_ORIGIN, request } = {}) {
  if (typeof request !== 'function') throw new Error('A request implementation is required.');
  const tokenOrigins = tokenOriginsFor(apiOrigin, rawOrigin);

  async function send(url, { token, accept = 'application/vnd.github+json' } = {}) {
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = {
        Accept: accept,
        'User-Agent': 'Leaf',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      // Decided fresh from the URL about to be requested, every hop. That makes
      // it the only rule: a redirect chain that wanders off GitHub simply finds
      // its origin is not allowed, with no carried-over flag to get wrong.
      if (token && tokenOrigins.has(new URL(current).origin)) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await request(current, { headers });
      const status = Number(response.status);

      if (status >= 300 && status < 400) {
        const location = headerValue(response.headers, 'location');
        if (!location) throw classify(status, response.headers, response.body, current);
        current = new URL(location, current).href;
        continue;
      }
      if (status >= 400) throw classify(status, response.headers, response.body, current);
      return { body: response.body, headers: response.headers, url: current };
    }
    throw new GitHubError('redirect', 'GitHub redirected too many times.');
  }

  async function json(path, { token, query } = {}) {
    const url = new URL(path, apiOrigin);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await send(url.href, { token });
    try {
      return JSON.parse(response.body || 'null');
    } catch {
      throw new GitHubError('parse', 'GitHub sent something that was not JSON.');
    }
  }

  return {
    GitHubError,
    // Exposed so a test can assert what a production-configured client would
    // actually put a token on, rather than trusting the comment above.
    tokenOrigins: Object.freeze([...tokenOrigins]),

    // Doubles as the token check: a bad token fails here with kind 'auth'
    // rather than somewhere deeper where the message would be less useful.
    async identity(token) {
      const user = await json('/user', { token });
      return { login: String(user?.login || ''), name: String(user?.name || '') };
    },

    async listRepositories(token, { perPage = 50 } = {}) {
      const repos = await json('/user/repos', {
        token,
        query: { sort: 'updated', per_page: perPage, affiliation: 'owner,collaborator,organization_member' }
      });
      return (Array.isArray(repos) ? repos : []).map(repo => ({
        fullName: String(repo.full_name || ''),
        owner: String(repo.owner?.login || ''),
        name: String(repo.name || ''),
        private: !!repo.private,
        defaultBranch: String(repo.default_branch || 'main'),
        pushedAt: repo.pushed_at || null
      }));
    },

    async repository(token, { owner, repo }) {
      const found = await json(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });
      return {
        fullName: String(found?.full_name || `${owner}/${repo}`),
        owner: String(found?.owner?.login || owner),
        name: String(found?.name || repo),
        private: !!found?.private,
        defaultBranch: String(found?.default_branch || 'main')
      };
    },

    async listBranches(token, { owner, repo, perPage = 100 }) {
      const branches = await json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
        { token, query: { per_page: perPage } }
      );
      return (Array.isArray(branches) ? branches : []).map(branch => String(branch.name || ''));
    },

    // One recursive call rather than a walk: the whole shape of the repository
    // arrives at once, and only the files the user opens are ever downloaded.
    async readTree(token, { owner, repo, ref }) {
      const tree = await json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}`,
        { token, query: { recursive: '1' } }
      );
      const entries = (Array.isArray(tree?.tree) ? tree.tree : [])
        .filter(entry => entry && (entry.type === 'blob' || entry.type === 'tree'))
        .map(entry => ({
          path: String(entry.path || ''),
          type: entry.type === 'tree' ? 'dir' : 'file',
          sha: String(entry.sha || ''),
          size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null
        }));
      // truncated is GitHub telling us the listing is incomplete. Passing it on
      // is the difference between a short tree and a silently wrong one.
      return { entries, truncated: !!tree?.truncated, sha: String(tree?.sha || '') };
    },

    async readFile(token, { owner, repo, ref, path: filePath }) {
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const encodedPath = String(filePath).split('/').map(encodeURIComponent).join('/');
      const meta = await json(`${base}/contents/${encodedPath}`, { token, query: { ref } });

      if (Array.isArray(meta)) {
        throw new GitHubError('is-directory', `${filePath} is a folder, not a file.`);
      }
      const size = Number(meta?.size) || 0;
      if (size > MAX_FILE_BYTES) {
        throw new GitHubError('too-large',
          `${filePath} is ${Math.round(size / 1048576)} MB. Leaf does not open files that large.`);
      }

      let base64 = typeof meta?.content === 'string' ? meta.content : '';
      // Above the inline limit the contents endpoint answers with an empty
      // content field rather than an error, so a missing body is a fallback
      // rather than a failure.
      if (!base64.trim() && size > CONTENTS_INLINE_LIMIT && meta?.sha) {
        const blob = await json(`${base}/git/blobs/${encodeURIComponent(meta.sha)}`, { token });
        base64 = typeof blob?.content === 'string' ? blob.content : '';
      }

      const bytes = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
      return {
        text: bytes.toString('utf8'),
        bytes,
        sha: String(meta?.sha || ''),
        size,
        path: String(meta?.path || filePath)
      };
    },

    rawUrlFor({ owner, repo, ref, path: filePath }) {
      const encodedPath = String(filePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
      return `${rawOrigin}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`;
    }
  };
}

module.exports = {
  createGitHubClient,
  GitHubError,
  API_ORIGIN,
  RAW_ORIGIN,
  TOKEN_ORIGINS,
  CONTENTS_INLINE_LIMIT,
  MAX_FILE_BYTES
};
