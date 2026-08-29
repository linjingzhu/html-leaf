'use strict';

// The Google Drive API client, built the same way as the GitHub one: everything
// that decides what leaves the machine - which hosts may see the access token,
// what a redirect is allowed to do, how a failure is named - lives here, so it
// can be exercised without a network by handing in a different `request`.

const API_ORIGIN = 'https://www.googleapis.com';

const FILES_PATH = '/drive/v3/files';
const UPLOAD_PATH = '/upload/drive/v3/files';

const MAX_REDIRECTS = 5;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

// A Google Doc is not a file. It has no bytes to download - only renderings the
// API will generate on request - and nothing can be written back into one
// through this API. So each of these is opened as an export and marked
// read-only; offering Save on one would be offering a lie.
const EXPORTS = Object.freeze({
  'application/vnd.google-apps.document': { mimeType: 'text/html', extension: 'html' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', extension: 'csv' }
});

// The fields Drive returns are opt-in; asking for exactly these keeps the
// responses small and makes it obvious what this client ever sees.
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,parents,trashed,webViewLink';

class DriveError extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = 'DriveError';
    this.kind = kind;
    Object.assign(this, detail);
  }
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return null; }
}

// Derived from the configured origins rather than naming googleapis.com, so
// pointing this at a local server for a test does not quietly disable the rule
// that the check exists to enforce.
function tokenOriginsFor(...origins) {
  return new Set(origins.map(originOf).filter(Boolean));
}

const TOKEN_ORIGINS = tokenOriginsFor(API_ORIGIN);

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

// Drive nests its failures: {error: {code, message, errors: [{reason}]}}. The
// reason is the part that separates "you are going too fast" from "this scope
// will never show you that file", and those need different words.
function reasonOf(body) {
  try {
    const parsed = JSON.parse(body || '{}');
    const first = Array.isArray(parsed?.error?.errors) ? parsed.error.errors[0] : null;
    return {
      reason: String(first?.reason || ''),
      message: String(parsed?.error?.message || '')
    };
  } catch {
    return { reason: '', message: '' };
  }
}

function classify(status, body, url) {
  const { reason, message } = reasonOf(body);

  if (status === 401) {
    return new DriveError('auth', 'Google no longer accepts this sign-in. Connect the account again.');
  }
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return new DriveError('rate-limit', 'Google is rate limiting Leaf. Try again in a moment.');
  }
  if (status === 403 && (reason === 'storageQuotaExceeded' || /quota/i.test(message))) {
    return new DriveError('quota', 'This Google account is out of storage, so the file was not saved.');
  }
  if (status === 403 || status === 404) {
    // These are the same answer in practice. Leaf holds the drive.file scope,
    // which shows it only the files the user handed over and the ones Leaf
    // made; anything else is indistinguishable from not existing, and saying
    // "not found" for a file the user can plainly see in Drive would be
    // baffling.
    return new DriveError(status === 403 ? 'forbidden' : 'not-found',
      'Leaf can only open Drive files you have picked in Leaf, or that Leaf created. Choose this file with the Drive picker to give Leaf access to it.');
  }
  if (status >= 500) {
    return new DriveError('server', `Google Drive answered ${status}. This is usually temporary.`);
  }
  return new DriveError('http', message || `Google Drive answered ${status} for ${url}.`);
}

function createDriveClient({ apiOrigin = API_ORIGIN, request } = {}) {
  if (typeof request !== 'function') throw new Error('A request implementation is required.');
  const tokenOrigins = tokenOriginsFor(apiOrigin);

  async function send(url, { token, accept = 'application/json', method = 'GET', body, contentType, binary = false } = {}) {
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = { Accept: accept };
      // Decided fresh from the URL about to be requested, every hop. A download
      // redirect that wanders off Google simply finds its origin is not
      // allowed, with no carried-over flag to get wrong.
      if (token && tokenOrigins.has(new URL(current).origin)) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (contentType) headers['Content-Type'] = contentType;

      const response = await request(current, { method, headers, body, binary });
      const status = Number(response.status);

      if (status >= 300 && status < 400) {
        const location = headerValue(response.headers, 'location');
        if (!location) throw classify(status, response.body, current);
        current = new URL(location, current).href;
        // A redirect is the server telling us where the bytes are; re-posting a
        // body to it would repeat the write.
        method = 'GET';
        body = undefined;
        contentType = undefined;
        continue;
      }
      if (status >= 400) {
        throw classify(status, Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.body, current);
      }
      return { body: response.body, headers: response.headers, url: current };
    }
    throw new DriveError('redirect', 'Google Drive redirected too many times.');
  }

  async function json(pathname, { token, query, method = 'GET', body, contentType, origin = apiOrigin } = {}) {
    const url = new URL(pathname, origin);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await send(url.href, { token, method, body, contentType });
    const text = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body ?? '');
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new DriveError('parse', 'Google Drive sent something that was not JSON.');
    }
  }

  function normalize(file) {
    const mimeType = String(file?.mimeType || '');
    const exported = EXPORTS[mimeType] || null;
    return {
      id: String(file?.id || ''),
      name: String(file?.name || ''),
      mimeType,
      // Two flags rather than one mime string, because every caller asks these
      // two questions and none of them should have to know the vnd.google-apps
      // prefix.
      isFolder: mimeType === FOLDER_MIME,
      isShortcut: mimeType === SHORTCUT_MIME,
      // A Google-native document can be read but never written back, so this
      // travels with the file rather than being re-derived at save time.
      readOnly: !!exported,
      exportAs: exported ? exported.mimeType : null,
      extension: exported ? exported.extension : null,
      size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
      modifiedAt: file?.modifiedTime || null,
      parents: Array.isArray(file?.parents) ? file.parents.map(String) : [],
      trashed: !!file?.trashed,
      webViewLink: file?.webViewLink || null
    };
  }

  return {
    DriveError,
    // Exposed so a test can assert what a production-configured client would
    // actually put a token on, rather than trusting the comment above.
    tokenOrigins: Object.freeze([...tokenOrigins]),
    EXPORTS,

    // Doubles as the token check: a spent or revoked token fails here with kind
    // 'auth' rather than somewhere deeper where the message would be less
    // useful.
    async identity(token) {
      const about = await json('/drive/v3/about', { token, query: { fields: 'user' } });
      return {
        email: String(about?.user?.emailAddress || ''),
        name: String(about?.user?.displayName || '')
      };
    },

    // Under the drive.file scope this returns the files the user has handed to
    // Leaf and the ones Leaf created - never the whole Drive. That is the scope
    // working as intended, not a truncated listing, so nothing here pretends
    // otherwise.
    async listFiles(token, { pageSize = 100, pageToken, query, parent } = {}) {
      const clauses = ['trashed = false'];
      if (parent) clauses.push(`'${String(parent).replace(/'/g, "\\'")}' in parents`);
      if (query) clauses.push(String(query));
      const listing = await json(FILES_PATH, {
        token,
        query: {
          q: clauses.join(' and '),
          pageSize,
          pageToken,
          orderBy: 'folder,modifiedTime desc',
          fields: `nextPageToken,files(${FILE_FIELDS})`
        }
      });
      return {
        files: (Array.isArray(listing?.files) ? listing.files : []).map(normalize),
        nextPageToken: listing?.nextPageToken || null
      };
    },

    async metadata(token, { fileId }) {
      const file = await json(`${FILES_PATH}/${encodeURIComponent(fileId)}`, {
        token, query: { fields: FILE_FIELDS }
      });
      return normalize(file);
    },

    async readFile(token, { fileId }) {
      const file = await this.metadata(token, { fileId });
      if (file.isFolder) {
        throw new DriveError('is-directory', `${file.name} is a folder, not a file.`);
      }
      if (file.size !== null && file.size > MAX_FILE_BYTES) {
        throw new DriveError('too-large',
          `${file.name} is ${Math.round(file.size / 1048576)} MB. Leaf does not open files that large.`);
      }

      const base = `${FILES_PATH}/${encodeURIComponent(fileId)}`;
      // Google-native documents have no bytes of their own; asking for
      // alt=media returns an error rather than content, so those go through
      // export instead.
      const url = file.exportAs
        ? new URL(`${base}/export?mimeType=${encodeURIComponent(file.exportAs)}`, apiOrigin).href
        : new URL(`${base}?alt=media`, apiOrigin).href;

      const response = await send(url, { token, accept: '*/*', binary: true });
      const bytes = Buffer.isBuffer(response.body)
        ? response.body
        : Buffer.from(String(response.body ?? ''), 'utf8');

      if (bytes.length > MAX_FILE_BYTES) {
        throw new DriveError('too-large',
          `${file.name} is larger than Leaf will open.`);
      }
      return { ...file, text: bytes.toString('utf8'), bytes };
    },

    // Media upload rather than a metadata patch: this replaces the bytes of a
    // file that already exists, and does it in one request.
    async writeFile(token, { fileId, text }) {
      const file = await this.metadata(token, { fileId });
      if (file.readOnly) {
        throw new DriveError('read-only',
          `${file.name} is a Google document. Leaf can read it, but Google does not let anything write it back.`);
      }
      const saved = await json(`${UPLOAD_PATH}/${encodeURIComponent(fileId)}`, {
        token,
        method: 'PATCH',
        query: { uploadType: 'media', fields: FILE_FIELDS },
        body: Buffer.from(String(text ?? ''), 'utf8'),
        contentType: file.mimeType || 'text/plain'
      });
      return normalize(saved);
    },

    // Two requests rather than a multipart body: the metadata goes up first as
    // ordinary JSON, then the bytes. Multipart here means hand-assembling a
    // boundary, and a boundary that ever appeared in a user's document would
    // corrupt the upload silently.
    async createFile(token, { name, text, mimeType = 'text/plain', parents } = {}) {
      const created = await json(FILES_PATH, {
        token,
        method: 'POST',
        query: { fields: FILE_FIELDS },
        body: JSON.stringify({
          name: String(name || 'Untitled'),
          mimeType,
          ...(Array.isArray(parents) && parents.length ? { parents: parents.map(String) } : {})
        }),
        contentType: 'application/json'
      });
      const file = normalize(created);
      if (text === undefined || text === null) return file;
      return this.writeFile(token, { fileId: file.id, text });
    }
  };
}

module.exports = {
  createDriveClient,
  DriveError,
  API_ORIGIN,
  TOKEN_ORIGINS,
  MAX_FILE_BYTES,
  EXPORTS,
  FOLDER_MIME,
  FILE_FIELDS
};
