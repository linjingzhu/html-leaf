'use strict';

// Google sign-in for a desktop application.
//
// Google issues no equivalent of a GitHub personal access token, so there is no
// "paste a credential" path here: the only way in is an OAuth authorization
// code flow. Everything that decides what leaves the machine lives in this file
// - which endpoint may see the client credentials, what the loopback listener
// will accept, how a refused sign-in is named - so it can be exercised without
// touching Google by handing in a different `request`.

const crypto = require('node:crypto');
const http = require('node:http');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// One scope, deliberately. drive.file sees only the files the user hands to
// this app and the ones it creates itself; the wider drive and drive.readonly
// scopes are "restricted" in Google's classification and drag the whole project
// into a paid third-party security assessment. Widening this array is not a
// code change, it is a compliance decision - so it is a constant here rather
// than a caller-supplied option.
const SCOPES = Object.freeze(['https://www.googleapis.com/auth/drive.file']);

// The one path the loopback listener answers. A browser asks a local port for
// /favicon.ico unprompted; treating any request as the callback would resolve
// the wait with no code at all.
const CALLBACK_PATH = '/oauth2callback';

// A sign-in nobody finishes must not leave a socket listening forever.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

class GoogleAuthError extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = 'GoogleAuthError';
    this.kind = kind;
    Object.assign(this, detail);
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 7636: 43-128 characters from the unreserved set. 32 random bytes in
// base64url is exactly 43, which is the shortest the spec allows and the most
// entropy that length can carry.
function createVerifier() {
  return base64url(crypto.randomBytes(32));
}

function challengeFor(verifier) {
  return base64url(crypto.createHash('sha256').update(String(verifier), 'ascii').digest());
}

function createState() {
  return base64url(crypto.randomBytes(16));
}

// Compared without an early exit. The state is the only thing standing between
// this listener and a code planted by any other page the user has open, so the
// comparison should not leak how much of a guess was right.
function sameState(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function buildAuthUrl({ clientId, redirectUri, state, challenge, scopes = SCOPES, prompt = 'consent' }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', String(clientId));
  url.searchParams.set('redirect_uri', String(redirectUri));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('code_challenge', String(challenge));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', String(state));
  // Without offline access Google returns an access token only, and the user
  // has to sign in again the moment it expires an hour later.
  url.searchParams.set('access_type', 'offline');
  // Google withholds the refresh token on a repeat consent unless it is asked
  // for explicitly, which turns "sign in again" into a session that cannot be
  // renewed.
  url.searchParams.set('prompt', prompt);
  return url.href;
}

// Reads the query off a callback request. Kept separate from the server so the
// accept/reject rules can be tested as a function.
function parseCallback(requestUrl, { state } = {}) {
  const url = new URL(String(requestUrl), 'http://127.0.0.1');
  if (url.pathname !== CALLBACK_PATH) return { kind: 'ignore' };

  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const returned = url.searchParams.get('state');

  // Checked before the code is even looked at: a request carrying the wrong
  // state is not a slightly wrong sign-in, it is someone else's.
  if (!sameState(returned, state)) return { kind: 'state' };
  if (error) return { kind: 'denied', error: String(error) };
  if (!code) return { kind: 'invalid' };
  return { kind: 'code', code: String(code) };
}

// Fixed bytes, no interpolation. The authorization code arrives in this
// request's own URL, and a page that echoed any part of it back would be both
// an injection point and a way for the code to escape into a referrer header.
const CALLBACK_PAGE = Buffer.from(
  '<!doctype html><meta charset="utf-8"><title>Leaf</title>' +
  '<style>body{font:15px system-ui;margin:0;display:grid;place-items:center;' +
  'height:100vh;color:#1f2328}</style>' +
  '<p>Signed in. You can close this tab and return to Leaf.</p>',
  'utf8'
);

function respond(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    // The code is in this page's URL. Nothing here loads a subresource, but a
    // no-referrer policy means it cannot leak even if that ever changes.
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
  });
  response.end(body);
}

// Listens on an ephemeral loopback port. RFC 8252 section 7.3: a native app
// receives its redirect on 127.0.0.1 with a port the system assigns, never a
// fixed one and never a wildcard address.
//
// Two promises rather than one, because the caller needs the redirect URI
// before the browser can open and the code only arrives long afterwards.
// `ready` settles at listen time, `code` when the callback lands.
function listenForCallback({ state, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const server = http.createServer();
  let settled = false;
  let timer = null;
  let resolveCode;
  let rejectCode;
  const code = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });

  const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    // The socket goes away before the caller is told anything, so a second
    // callback cannot arrive against a flow that is already over.
    server.closeAllConnections?.();
    server.close(() => fn(value));
  };

  server.on('request', (request, response) => {
    const result = parseCallback(request.url, { state });
    if (result.kind === 'ignore') {
      respond(response, 404, Buffer.from('Not found', 'utf8'));
      return;
    }
    if (result.kind === 'state') {
      // Answered, but not acted on. The flow stays open so the real callback
      // can still arrive.
      respond(response, 400, Buffer.from('Bad request', 'utf8'));
      return;
    }
    respond(response, 200, CALLBACK_PAGE);
    if (result.kind === 'code') {
      finish(resolveCode, result.code);
    } else if (result.kind === 'denied') {
      finish(rejectCode, new GoogleAuthError(
        result.error === 'access_denied' ? 'denied' : 'auth',
        result.error === 'access_denied'
          ? 'Sign-in was cancelled, so Leaf has no access to Drive.'
          : `Google refused the sign-in (${result.error}).`
      ));
    } else {
      finish(rejectCode, new GoogleAuthError('auth', 'Google sent a reply Leaf could not read.'));
    }
  });

  if (signal) {
    const abort = () => finish(rejectCode, new GoogleAuthError('cancelled', 'Sign-in was cancelled.'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }

  const ready = new Promise((resolve, reject) => {
    server.on('error', error => { finish(rejectCode, error); reject(error); });
    // Port 0 asks the OS for a free port; 127.0.0.1 rather than 0.0.0.0 keeps
    // the listener off every other interface, so nothing on the network can
    // reach it.
    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(
        () => finish(rejectCode, new GoogleAuthError('timeout', 'Sign-in was not completed in time.')),
        timeoutMs
      );
      timer.unref?.();
      resolve(`http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`);
    });
  });

  return {
    ready,
    code,
    // Valid once `ready` has settled. Exposed so a test can assert what the
    // socket is actually bound to: connecting to 0.0.0.0 reaches loopback on
    // Linux, so a reachability probe alone proves nothing.
    address: () => server.address(),
    // Closes the listener and settles `code`, so abandoning a sign-in never
    // leaves a socket bound or a promise nobody will ever resolve.
    cancel() {
      finish(rejectCode, new GoogleAuthError('cancelled', 'Sign-in was cancelled.'));
    }
  };
}

function formBody(fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  }
  return body.toString();
}

// Google answers a failed token exchange with {error, error_description}. The
// kind is what decides whether the UI offers a retry or a fresh sign-in, so the
// classification lives with the request.
function classifyToken(status, body) {
  let payload = {};
  try { payload = JSON.parse(body || '{}'); } catch {}
  const code = String(payload.error || '');
  const detail = String(payload.error_description || '');

  if (code === 'invalid_grant') {
    return new GoogleAuthError('expired',
      'Google no longer accepts this sign-in. Connect the account again.');
  }
  if (code === 'invalid_client' || status === 401) {
    return new GoogleAuthError('client',
      'This build’s Google client credentials were refused. Check the OAuth client in Google Cloud.');
  }
  if (code === 'access_denied') {
    return new GoogleAuthError('denied', 'Google declined the request for access.');
  }
  if (status >= 500) {
    return new GoogleAuthError('server', `Google answered ${status}. This is usually temporary.`);
  }
  return new GoogleAuthError('auth',
    detail || code || `Google answered ${status} when exchanging the sign-in.`);
}

function createGoogleAuth({
  clientId,
  clientSecret = '',
  request,
  tokenEndpoint = TOKEN_ENDPOINT,
  revokeEndpoint = REVOKE_ENDPOINT,
  openExternal,
  listen = listenForCallback
} = {}) {
  if (typeof request !== 'function') throw new Error('A request implementation is required.');
  if (!String(clientId || '').trim()) {
    throw new GoogleAuthError('no-client',
      'This build has no Google client ID, so it cannot sign in to Drive.');
  }

  // The same rule the GitHub client uses, for the same reason: the client
  // credentials go to the endpoint this was configured for and nowhere else.
  // Derived from the configured endpoints rather than named, so pointing the
  // tests at a local server does not quietly disable the check.
  const credentialOrigins = new Set(
    [tokenEndpoint, revokeEndpoint]
      .map(value => { try { return new URL(value).origin; } catch { return null; } })
      .filter(Boolean)
  );

  async function postForm(endpoint, fields) {
    if (!credentialOrigins.has(new URL(endpoint).origin)) {
      throw new GoogleAuthError('auth', 'Refusing to send credentials to an unexpected host.');
    }
    const response = await request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: formBody(fields)
    });
    const status = Number(response.status);
    if (status >= 400) throw classifyToken(status, response.body);
    try {
      return JSON.parse(response.body || 'null');
    } catch {
      throw new GoogleAuthError('auth', 'Google sent something that was not JSON.');
    }
  }

  function sessionFrom(payload, { refreshToken } = {}) {
    const expiresIn = Number(payload?.expires_in);
    return {
      accessToken: String(payload?.access_token || ''),
      // A refresh response omits the refresh token; dropping it there would
      // silently turn a renewable session into a one-hour one.
      refreshToken: String(payload?.refresh_token || refreshToken || ''),
      scope: String(payload?.scope || ''),
      expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : 0
    };
  }

  return {
    GoogleAuthError,
    scopes: SCOPES,
    credentialOrigins: Object.freeze([...credentialOrigins]),

    // Opens the system browser and waits for the loopback callback. Never an
    // in-app BrowserWindow: Google refuses to sign in from an embedded
    // webview, and the user could not check the address bar if it did.
    async authorize({ timeoutMs = DEFAULT_TIMEOUT_MS, signal, prompt } = {}) {
      const verifier = createVerifier();
      const state = createState();
      const session = listen({ state, timeoutMs, signal });

      let code = '';
      let redirectUri = '';
      try {
        redirectUri = await session.ready;
        const authUrl = buildAuthUrl({
          clientId, redirectUri, state, challenge: challengeFor(verifier), prompt
        });
        if (typeof openExternal === 'function') await openExternal(authUrl);
        code = await session.code;
      } catch (error) {
        // A failure anywhere above - the port, the browser, the timeout - has
        // to take the listener down with it, and `code` may still be pending.
        session.cancel();
        session.code.catch(() => {});
        throw error;
      }

      const payload = await postForm(tokenEndpoint, {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      });
      return sessionFrom(payload);
    },

    async refresh(refreshToken) {
      const token = String(refreshToken || '').trim();
      if (!token) {
        throw new GoogleAuthError('expired', 'There is no saved sign-in to renew.');
      }
      const payload = await postForm(tokenEndpoint, {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token,
        grant_type: 'refresh_token'
      });
      return sessionFrom(payload, { refreshToken: token });
    },

    // Best effort by design. A revoke that fails must not stop Leaf forgetting
    // the account locally, or a user who wants out stays signed in.
    async revoke(token) {
      if (!String(token || '').trim()) return { revoked: false };
      try {
        await postForm(revokeEndpoint, { token });
        return { revoked: true };
      } catch {
        return { revoked: false };
      }
    }
  };
}

module.exports = {
  createGoogleAuth,
  GoogleAuthError,
  buildAuthUrl,
  parseCallback,
  listenForCallback,
  createVerifier,
  challengeFor,
  createState,
  sameState,
  SCOPES,
  AUTH_ENDPOINT,
  TOKEN_ENDPOINT,
  REVOKE_ENDPOINT,
  CALLBACK_PATH,
  DEFAULT_TIMEOUT_MS
};
