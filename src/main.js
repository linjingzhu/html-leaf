const { app, BrowserWindow, dialog, ipcMain, clipboard, shell, net, session, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const dns = require('node:dns/promises');

let mainWindow;
let sessionTempDir = null;
const initialHtmlSnapshots = new Map();

function appTitle() {
  return `Leaf v${app.getVersion()}`;
}

function syncAppTitle() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setTitle(appTitle());
}

app.setName('Leaf');
if (process.platform === 'win32') app.setAppUserModelId('com.leaf.editor');
if (process.env.LEAF_DISABLE_GPU === '1') app.disableHardwareAcceleration();

async function ensureSessionTempDir() {
  if (!sessionTempDir) {
    sessionTempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'leaf-editor-'));
  }
  return sessionTempDir;
}

async function snapshotInitialHtml(filePath, source) {
  const key = path.resolve(filePath);
  if (initialHtmlSnapshots.has(key)) return initialHtmlSnapshots.get(key);
  const dir = await ensureSessionTempDir();
  const snapshotPath = path.join(dir, `initial-${initialHtmlSnapshots.size + 1}.html`);
  await atomicWriteFile(snapshotPath, source, 'utf8');
  initialHtmlSnapshots.set(key, snapshotPath);
  return snapshotPath;
}

function cleanupSessionTempDir() {
  if (!sessionTempDir) return;
  try { fsSync.rmSync(sessionTempDir, { recursive: true, force: true }); } catch {}
  initialHtmlSnapshots.clear();
  sessionTempDir = null;
}

async function atomicWriteFile(filePath, content, encoding = 'utf8') {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `.${base}.hbe-tmp-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(tempPath, content, encoding);
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      if (process.platform === 'win32') {
        try { await fs.unlink(filePath); } catch {}
        await fs.rename(tempPath, filePath);
      } else {
        throw error;
      }
    }
  } finally {
    try { await fs.unlink(tempPath); } catch {}
  }
  return filePath;
}


function baseUrlForFile(filePath) {
  if (!filePath) return null;
  return pathToFileURL(path.dirname(filePath) + path.sep).href;
}

async function readHtmlPath(filePath) {
  if (!filePath || !/\.html?$/i.test(filePath)) throw new Error('Only .html and .htm files are supported.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 50_000_000) throw new Error('HTML pages must be files smaller than 50 MB.');
  const source = await fs.readFile(filePath, 'utf8');
  const initialSnapshotPath = await snapshotInitialHtml(filePath, source);
  return {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath)),
    source,
    baseUrl: baseUrlForFile(filePath),
    initialSnapshotPath
  };
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const DOCUMENT_EXTENSIONS = new Set(['.html', '.htm', '.md', '.markdown', '.json', '.xml', '.pdf', ...IMAGE_EXTENSIONS]);

// Resolving a link target belongs here, not in the renderer: turning
// "../shared/report.html" plus a file:// base into a real path is Windows
// separator and drive-letter work that string munging in the renderer gets
// wrong. Returns null for anything that is not a local page we could open.
async function resolveLinkTarget(payload) {
  const href = String(payload?.href || '').trim();
  const baseUrl = String(payload?.baseUrl || '').trim();
  if (!href || !baseUrl) return null;
  let resolved;
  try {
    resolved = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'file:') return null;
  let filePath;
  try {
    filePath = fileURLToPath(resolved);
  } catch {
    return null;
  }
  const documentType = documentTypeForPath(filePath);
  if (!documentType) return { filePath, documentType: null, exists: false };
  let exists = false;
  try {
    exists = (await fs.stat(filePath)).isFile();
  } catch {
    exists = false;
  }
  return { filePath, documentType, exists, fragment: resolved.hash.replace(/^#/, '') };
}

// Only the schemes a document legitimately links out with. Anything else -
// file:, javascript:, data: - must never reach the OS handler.
const EXTERNAL_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
async function openExternalLink(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('That link is not a valid URL.');
  }
  if (!EXTERNAL_LINK_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Refusing to open a ${url.protocol} link externally.`);
  }
  await shell.openExternal(url.href);
  return { opened: true, url: url.href };
}

// ----- Fetching a Page over the network -------------------------------------
// The app was entirely local-file before this. Everything below exists because
// a URL box in a desktop app is an SSRF hole by default: main runs with full
// privileges, so an unguarded fetch reaches the user's own localhost services,
// their LAN, and the cloud metadata endpoint.
const FETCH_PROTOCOLS = new Set(['http:', 'https:']);
const FETCH_MAX_BYTES = 25_000_000;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_MAX_REDIRECTS = 5;
// Its own partition, so the app's cookies and credentials never ride along on a
// fetch the user asked for.
const FETCH_PARTITION = 'leaf-url-fetch';

function ipv4Octets(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(n => n >= 0 && n <= 255) ? parts : null;
}

// Always refused, on any hop: the cloud metadata endpoint lives here and no
// "open this page" request has a legitimate reason to reach it.
function isLinkLocalAddress(host) {
  const v4 = ipv4Octets(host);
  if (v4) return v4[0] === 169 && v4[1] === 254;
  const v6 = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return /^fe[89ab][0-9a-f]:/.test(v6);
}

// Allowed on the address the user typed - a local dev server is a normal thing
// to open - and refused when a redirect picked it.
function isInternalAddress(host) {
  const v6 = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (v6 === '::1' || v6 === '::' || /^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  const v4 = ipv4Octets(host);
  if (!v4) return false;
  const [a, b] = v4;
  return a === 127 || a === 0 || a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

async function addressesForHost(hostname) {
  const bare = String(hostname || '').replace(/^\[|\]$/g, '');
  if (ipv4Octets(bare) || bare.includes(':')) return [bare];
  try {
    const records = await dns.lookup(bare, { all: true, verbatim: true });
    return records.map(record => record.address);
  } catch {
    throw new Error(`Could not resolve ${hostname}.`);
  }
}

// Every redirect hop is re-checked. An internal address is allowed only on the
// host the user actually typed: a dev server redirecting / to /index.html stays
// on its own host and is fine, while a public site answering 302 into loopback
// or the LAN is the attack this closes.
async function assertFetchableUrl(url, { originHost = null } = {}) {
  if (!FETCH_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Only http and https URLs can be opened as a Page - not ${url.protocol}`);
  }
  const sameHostAsTyped = originHost !== null && url.hostname.toLowerCase() === originHost.toLowerCase();
  const addresses = await addressesForHost(url.hostname);
  for (const address of addresses) {
    if (isLinkLocalAddress(address)) {
      throw new Error(`Refusing to fetch a link-local address (${address}).`);
    }
    if (isInternalAddress(address) && !sameHostAsTyped) {
      throw new Error(`Refusing to reach a private address (${address}) that was not the one entered.`);
    }
  }
  return url;
}

// Order matters: image/svg+xml and application/xhtml+xml both end in +xml, so
// the specific types have to be tried before the generic XML rule.
const FETCH_TYPE_BY_MIME = [
  [/^text\/html\b|^application\/xhtml\+xml\b/, 'html'],
  [/^text\/markdown\b|^text\/x-markdown\b/, 'markdown'],
  [/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)\b/, 'image'],
  [/^application\/pdf\b/, 'pdf'],
  [/^application\/json\b|\+json\b/, 'json'],
  [/^application\/xml\b|^text\/xml\b|\+xml\b/, 'xml']
];

function fetchedDocumentType(contentType, url) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  for (const [pattern, type] of FETCH_TYPE_BY_MIME) if (pattern.test(mime)) return type;
  // Servers that answer octet-stream or nothing at all still tell the truth in
  // the path, and a URL with no extension at all is almost always a page.
  const byPath = documentTypeForPath(new URL(url).pathname);
  if (byPath) return byPath;
  if (!mime || mime === 'application/octet-stream') return null;
  return null;
}

function fetchedPageName(url, documentType) {
  const parsed = new URL(url);
  const base = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
  if (base) return base;
  const extension = documentType === 'markdown' ? 'md' : documentType === 'html' ? 'html' : documentType;
  return `${parsed.hostname}.${extension}`;
}

function requestOnce(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET',
      redirect: 'manual',
      session: session.fromPartition(FETCH_PARTITION, { cache: false }),
      useSessionCookies: false
    });
    const timer = setTimeout(() => { request.abort(); reject(new Error('The request timed out.')); }, FETCH_TIMEOUT_MS);
    request.on('redirect', (status, method, redirectUrl) => {
      clearTimeout(timer);
      request.abort();
      resolve({ redirectUrl, status });
    });
    request.on('response', response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > FETCH_MAX_BYTES) {
          request.abort();
          clearTimeout(timer);
          reject(new Error(`That page is larger than ${Math.round(FETCH_MAX_BYTES / 1_000_000)} MB.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(timer);
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
      response.on('error', error => { clearTimeout(timer); reject(error); });
    });
    request.on('error', error => { clearTimeout(timer); reject(new Error(error.message || 'The request failed.')); });
    request.end();
  });
}

// Every network read in the app goes through here, so the guards cannot be
// bypassed by adding a second caller that forgets one.
async function fetchGuardedBytes(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('That is not a valid URL.');
  }
  const originHost = url.hostname;
  await assertFetchableUrl(url, { originHost });

  let current = url.href;
  let result = null;
  for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
    const answer = await requestOnce(current);
    if (!answer.redirectUrl) { result = answer; break; }
    const next = new URL(answer.redirectUrl, current);
    await assertFetchableUrl(next, { originHost });
    current = next.href;
  }
  if (!result) throw new Error('Too many redirects.');
  if (result.status >= 400) throw new Error(`The server answered ${result.status}.`);
  return {
    body: result.body,
    finalUrl: current,
    contentType: [].concat(result.headers?.['content-type'] || []).join('; ')
  };
}

// A stylesheet the renderer could not read through cssRules - a cross-origin
// sheet - is fetched as text instead, so @font-face stays discoverable either
// way rather than depending on one of them working.
async function fetchStylesheetText(rawUrl) {
  const { body, finalUrl, contentType } = await fetchGuardedBytes(rawUrl);
  if (body.length > 5_000_000) throw new Error('That stylesheet is too large.');
  return { text: body.toString('utf8'), finalUrl, contentType };
}

async function fetchPageAtUrl(rawUrl) {
  const fetched = await fetchGuardedBytes(rawUrl);
  const result = { body: fetched.body };
  const current = fetched.finalUrl;
  const contentType = fetched.contentType;
  const documentType = fetchedDocumentType(contentType, current);
  if (!documentType) throw new Error(`Leaf opens HTML, Markdown, JSON, XML, PDF and images - not ${contentType || 'that content type'}.`);

  const fileName = fetchedPageName(current, documentType);
  const common = {
    // No local file backs a fetched Page, so Save has nothing to write to and
    // stays disabled with its reason; Save As is the way to keep one.
    filePath: null,
    sourceUrl: current,
    fileName,
    title: fileName.replace(/\.[^.]+$/, '') || new URL(current).hostname,
    documentType,
    baseUrl: current,
    previewUrl: null,
    initialSnapshotPath: null
  };

  if (documentType === 'pdf' || documentType === 'image') {
    // Binary Pages render from a URL, not from source, and the preview CSP
    // admits file: but not http: - so the bytes are staged locally.
    const dir = await ensureSessionTempDir();
    const staged = path.join(dir, `fetched-${Date.now()}-${fileName.replace(/[^\w.-]+/g, '_')}`);
    await atomicWriteFile(staged, result.body);
    return { ...common, previewUrl: pathToFileURL(staged).href, source: '', loadedSource: '' };
  }
  const source = result.body.toString('utf8');
  return { ...common, source, loadedSource: source };
}

// ----- Downloading the fonts a page uses ------------------------------------
const FONT_MAX_BYTES = 20_000_000;
const FONT_TOTAL_MAX_BYTES = 200_000_000;
const FONT_EXTENSION_BY_FORMAT = {
  woff2: '.woff2', woff: '.woff', truetype: '.ttf', opentype: '.otf',
  embedded_opentype: '.eot', svg: '.svg', 'collection': '.ttc'
};
const FONT_EXTENSION_BY_MIME = {
  'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf',
  'application/font-woff2': '.woff2', 'application/font-woff': '.woff',
  'application/x-font-ttf': '.ttf', 'application/x-font-opentype': '.otf',
  'application/vnd.ms-fontobject': '.eot'
};

function fontExtension({ format, contentType, url }) {
  const byFormat = FONT_EXTENSION_BY_FORMAT[String(format || '').toLowerCase()];
  if (byFormat) return byFormat;
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (FONT_EXTENSION_BY_MIME[mime]) return FONT_EXTENSION_BY_MIME[mime];
  const fromPath = path.extname(String(url || '').split('?')[0]).toLowerCase();
  if (['.woff2', '.woff', '.ttf', '.otf', '.eot', '.ttc'].includes(fromPath)) return fromPath;
  return '.font';
}

function safeFontBase(font, index) {
  const family = String(font?.family || 'font').replace(/["']/g, '').trim() || 'font';
  const weight = String(font?.weight || '').replace(/[^\w]+/g, '') || '400';
  const style = String(font?.style || '').toLowerCase() === 'italic' ? '-italic' : '';
  const base = `${family}-${weight}${style}`.replace(/[<>:"/\\|?*\x00-\x1f\s]+/g, '-');
  return base.replace(/^-+|-+$/g, '') || `font-${index + 1}`;
}

// The renderer sends what it read out of @font-face; every URL is fetched
// through the same guards the URL bar uses, so a page cannot point the
// downloader at somewhere the user could not have opened themselves.
async function downloadPageFonts({ fonts }) {
  if (!Array.isArray(fonts) || !fonts.length || fonts.length > 200) {
    throw new Error('Supply between 1 and 200 fonts to download.');
  }
  const chosen = await dialog.showOpenDialog(mainWindow, {
    title: 'Save fonts to folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (chosen.canceled || !chosen.filePaths[0]) return { canceled: true };
  const directory = chosen.filePaths[0];

  const used = new Set();
  const staged = [];
  const written = [];
  const saved = [];
  const failed = [];
  let total = 0;

  try {
    for (let index = 0; index < fonts.length; index += 1) {
      const font = fonts[index] || {};
      const source = String(font.url || '');
      let body = null;
      let contentType = '';
      try {
        if (source.startsWith('data:')) {
          const comma = source.indexOf(',');
          const meta = source.slice(5, comma);
          if (!/;base64$/i.test(meta)) throw new Error('Only base64 data URIs are supported.');
          contentType = meta.replace(/;base64$/i, '');
          body = Buffer.from(source.slice(comma + 1), 'base64');
        } else {
          const fetched = await fetchGuardedBytes(source);
          body = fetched.body;
          contentType = fetched.contentType;
        }
        if (body.length > FONT_MAX_BYTES) throw new Error('That font file is too large.');
        total += body.length;
        if (total > FONT_TOTAL_MAX_BYTES) throw new Error('The fonts add up to more than 200 MB.');
      } catch (error) {
        failed.push({ family: font.family || '(unnamed)', url: source, reason: error.message });
        continue;
      }

      const base = safeFontBase(font, index);
      const extension = fontExtension({ format: font.format, contentType, url: source });
      let candidate = `${base}${extension}`;
      let suffix = 2;
      while (used.has(candidate.toLowerCase()) || fsSync.existsSync(path.join(directory, candidate))) {
        candidate = `${base}-${suffix++}${extension}`;
      }
      used.add(candidate.toLowerCase());
      const filePath = path.join(directory, candidate);
      const stagePath = path.join(directory, `.${candidate}.leaf-stage-${process.pid}-${Date.now()}-${index}`);
      await atomicWriteFile(stagePath, body);
      staged.push({ stagePath, filePath });
      saved.push({ ...font, fileName: candidate, bytes: body.length });
    }

    // A stylesheet that points at the saved files, so the download is usable
    // rather than a folder of loose binaries.
    if (saved.length) {
      const css = [
        '/* Generated by Leaf. Check each family\'s licence before redistributing. */',
        ...saved.map(font => [
          '@font-face{',
          `  font-family:'${String(font.family || 'Font').replace(/["'\\]/g, '')}';`,
          `  src:url('${font.fileName}')${font.format ? ` format('${String(font.format).replace(/[^\w-]/g, '')}')` : ''};`,
          font.weight ? `  font-weight:${String(font.weight).replace(/[^\w\s.-]/g, '')};` : '',
          font.style ? `  font-style:${String(font.style).replace(/[^\w-]/g, '')};` : '',
          '}'
        ].filter(Boolean).join('\n'))
      ].join('\n\n') + '\n';
      const cssPath = path.join(directory, 'fonts.css');
      const cssStage = path.join(directory, `.fonts.css.leaf-stage-${process.pid}-${Date.now()}`);
      await atomicWriteFile(cssStage, css, 'utf8');
      staged.push({ stagePath: cssStage, filePath: cssPath });
    }

    for (const item of staged) { await fs.rename(item.stagePath, item.filePath); written.push(item.filePath); }
    return { canceled: false, directory, saved, failed, files: written };
  } catch (error) {
    await Promise.allSettled(staged.map(item => fs.unlink(item.stagePath)));
    await Promise.allSettled(written.map(filePath => fs.unlink(filePath)));
    throw error;
  }
}

function documentTypeForPath(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension === '.json') return 'json';
  if (extension === '.xml') return 'xml';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (extension === '.pdf') return 'pdf';
  return null;
}

async function readDocumentPath(filePath) {
  const documentType = documentTypeForPath(filePath);
  if (!filePath || !documentType) throw new Error('Only HTML, Markdown, JSON, XML, PDF, and image pages are supported.');
  if (documentType === 'html') return { ...(await readHtmlPath(filePath)), documentType };

  const common = {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath)),
    documentType,
    baseUrl: baseUrlForFile(filePath),
    previewUrl: documentType === 'pdf' || documentType === 'image' ? pathToFileURL(filePath).href : null,
    initialSnapshotPath: null
  };
  if (documentType === 'pdf') {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 500_000_000) throw new Error('PDF pages must be files smaller than 500 MB.');
    return { ...common, source: '', loadedSource: '' };
  }
  if (documentType === 'image') {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 100_000_000) throw new Error('Image pages must be files smaller than 100 MB.');
    return { ...common, source: '', loadedSource: '' };
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 50_000_000) throw new Error('Text pages must be files smaller than 50 MB.');
  const source = await fs.readFile(filePath, 'utf8');
  return { ...common, source, loadedSource: source };
}

async function openDocumentFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Pages',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Leaf Pages', extensions: ['html', 'htm', 'md', 'markdown', 'json', 'xml', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(readDocumentPath));
}

async function openHtmlFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import HTML',
    properties: ['openFile'],
    filters: [{ name: 'HTML Pages', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return readHtmlPath(filePath);
}

async function exportHtml({ suggestedName, source }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export HTML',
    defaultPath: suggestedName || 'page.html',
    filters: [{ name: 'HTML Page', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!/\.html?$/i.test(filePath)) filePath += '.html';
  await atomicWriteFile(filePath, source, 'utf8');
  return filePath;
}

async function saveHtmlPath({ filePath, source }) {
  if (!filePath || !/\.html?$/i.test(filePath)) throw new Error('A valid HTML file path is required.');
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}


async function exportTextFile({ title, suggestedName, extension, source }) {
  const safeExtension = String(extension || 'txt').replace(/^\./, '');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: title || 'Export',
    defaultPath: suggestedName || `page.${safeExtension}`,
    filters: [{ name: `${safeExtension.toUpperCase()} File`, extensions: [safeExtension] }]
  });
  if (result.canceled || !result.filePath) return null;

  let filePath = result.filePath;
  const suffix = `.${safeExtension}`.toLowerCase();
  if (!filePath.toLowerCase().endsWith(suffix)) filePath += suffix;
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}

async function saveTextPath({ filePath, source }) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (!filePath || !['.md', '.markdown', '.txt', '.json'].includes(extension)) throw new Error('A valid text page path is required.');
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}

async function copyDocumentAs({ sourcePath, suggestedName }) {
  if (!sourcePath || !DOCUMENT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) throw new Error('A valid page source path is required.');
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Page As',
    defaultPath: suggestedName || path.basename(sourcePath),
    filters: [{ name: `${extension.toUpperCase()} Page`, extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  let destination = result.filePath;
  if (!destination.toLowerCase().endsWith(`.${extension}`)) destination += `.${extension}`;
  await atomicWriteFile(destination, await fs.readFile(sourcePath));
  return destination;
}

const PAGE_EXPORT_FORMATS = {
  html: { extension: 'html', name: 'HTML Page' },
  markdown: { extension: 'md', name: 'Markdown Page' },
  json: { extension: 'json', name: 'JSON Page' },
  xml: { extension: 'xml', name: 'XML Page' },
  image: { extension: 'png', name: 'Image Page' },
  pdf: { extension: 'pdf', name: 'PDF Document' }
};

function printableHtml(source, baseUrl) {
  const safeBase = (() => {
    try {
      const url = new URL(String(baseUrl || ''));
      return ['file:', 'http:', 'https:'].includes(url.protocol) ? url.href.replace(/["<>]/g, '') : '';
    } catch { return ''; }
  })();
  const guards = `${safeBase ? `<base href="${safeBase}">` : ''}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; connect-src 'none'; object-src 'none'; frame-src 'none';">`;
  const html = String(source || '');
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${guards}`);
  if (/<html[\s>]/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${guards}</head>`);
  return `<!doctype html><html><head>${guards}</head><body>${html}</body></html>`;
}

async function renderPageToPdf(source, baseUrl) {
  if (String(source || '').length > 50_000_000) throw new Error('Printable pages must be smaller than 50 MB.');
  const dir = await ensureSessionTempDir();
  const tempPath = path.join(dir, `print-${process.pid}-${Date.now()}.html`);
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: false
    }
  });
  try {
    await atomicWriteFile(tempPath, printableHtml(source, baseUrl), 'utf8');
    await printWindow.loadFile(tempPath);
    await new Promise(resolve => setTimeout(resolve, 180));
    return await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
    try { await fs.unlink(tempPath); } catch {}
  }
}

async function exportPageAs({ format, suggestedName, source, sourcePath, sourceType, baseUrl }) {
  const normalized = String(format || '').toLowerCase();
  const type = PAGE_EXPORT_FORMATS[normalized];
  if (!type) throw new Error('Unsupported Page export format.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Page As',
    defaultPath: suggestedName || `page.${type.extension}`,
    filters: [{ name: type.name, extensions: [type.extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!filePath.toLowerCase().endsWith(`.${type.extension}`)) filePath += `.${type.extension}`;

  if (normalized === 'pdf') {
    if (sourceType === 'pdf') {
      if (!sourcePath || path.extname(sourcePath).toLowerCase() !== '.pdf') throw new Error('A valid PDF source is required.');
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile() || stat.size > 500_000_000) throw new Error('PDF pages must be files smaller than 500 MB.');
      await atomicWriteFile(filePath, await fs.readFile(sourcePath));
    } else {
      await atomicWriteFile(filePath, await renderPageToPdf(source, baseUrl));
    }
  } else {
    const text = String(source ?? '');
    if (text.length > 50_000_000) throw new Error('Text Page exports must be smaller than 50 MB.');
    await atomicWriteFile(filePath, text, 'utf8');
  }
  return filePath;
}

async function exportObjectAsset({ format, suggestedName, source }) {
  const normalized=String(format||'').toLowerCase();
  const types={
    png:{extension:'png',name:'PNG Image',mime:'image/png'},
    jpg:{extension:'jpg',name:'JPEG Image',mime:'image/jpeg'},
    svg:{extension:'svg',name:'SVG Image',mime:'image/svg+xml'}
  };
  const type=types[normalized];
  if(!type) throw new Error('Unsupported object export format.');
  const safeName=path.basename(String(suggestedName||`leaf-object.${type.extension}`)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-');
  const result=await dialog.showSaveDialog(mainWindow,{
    title:'Export selected object',
    defaultPath:safeName,
    filters:[{name:type.name,extensions:[type.extension]}]
  });
  if(result.canceled||!result.filePath)return null;
  let filePath=result.filePath;
  if(!filePath.toLowerCase().endsWith(`.${type.extension}`))filePath+=`.${type.extension}`;

  if(normalized==='svg'){
    const svg=String(source||'');
    if(svg.length>20_000_000||!/^\s*<svg\b/i.test(svg))throw new Error('Invalid SVG export payload.');
    await atomicWriteFile(filePath,svg,'utf8');
  }else{
    const payload=String(source||'');
    const match=payload.match(new RegExp(`^data:${type.mime.replace('/','\\/')};base64,([A-Za-z0-9+/=]+)$`));
    if(!match||match[1].length>120_000_000)throw new Error('Invalid raster export payload.');
    await atomicWriteFile(filePath,Buffer.from(match[1],'base64'));
  }
  return filePath;
}

async function writeObjectAssetAtPath(filePath, format, source) {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'svg') {
    const svg = String(source || '');
    if (svg.length > 20_000_000 || !/^\s*<svg\b/i.test(svg)) throw new Error('Invalid SVG export payload.');
    await atomicWriteFile(filePath, svg, 'utf8');
    return;
  }
  const mime = normalized === 'jpg' ? 'image/jpeg' : normalized === 'png' ? 'image/png' : null;
  const payload = String(source || '');
  const match = mime && payload.match(new RegExp(`^data:${mime.replace('/', '\\/')};base64,([A-Za-z0-9+/=]+)$`));
  if (!match || !match[1] || match[1].length > 120_000_000) throw new Error('Invalid raster export payload.');
  await atomicWriteFile(filePath, Buffer.from(match[1], 'base64'));
}

async function exportObjectAssets({ format, items }) {
  const normalized = String(format || '').toLowerCase();
  if (!['png', 'jpg', 'svg'].includes(normalized) || !Array.isArray(items) || !items.length || items.length > 200) throw new Error('Supply between 1 and 200 valid object export items.');
  let payloadSize = 0;
  for (const item of items) {
    const source = String(item?.source || '');payloadSize += source.length;
    if (normalized === 'svg' ? !/^\s*<svg\b/i.test(source) : !new RegExp(`^data:image/${normalized === 'jpg' ? 'jpeg' : 'png'};base64,`).test(source)) throw new Error('An object export payload is invalid.');
  }
  if (payloadSize > 200_000_000) throw new Error('The combined object export payload is too large.');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Export selected objects',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return [];
  const directory = result.filePaths[0];
  const used = new Set();
  const output = [];
  const staged = [];
  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};
      const base = path.basename(String(item.suggestedName || `leaf-object-${index + 1}.${normalized}`), path.extname(String(item.suggestedName || '')))
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || `leaf-object-${index + 1}`;
      let candidate = `${base}.${normalized}`;
      let suffix = 2;
      while (used.has(candidate.toLowerCase()) || fsSync.existsSync(path.join(directory, candidate))) candidate = `${base}-${suffix++}.${normalized}`;
      used.add(candidate.toLowerCase());
      const filePath = path.join(directory, candidate);
      const stagePath = path.join(directory, `.${candidate}.leaf-stage-${process.pid}-${Date.now()}-${index}`);
      await writeObjectAssetAtPath(stagePath, normalized, item.source);
      staged.push({ stagePath, filePath });
    }
    for (const item of staged) { await fs.rename(item.stagePath, item.filePath);output.push(item.filePath); }
    return output;
  } catch (error) {
    await Promise.allSettled(staged.map(item => fs.unlink(item.stagePath)));
    await Promise.allSettled(output.map(filePath => fs.unlink(filePath)));
    throw error;
  }
}

async function readLocalAssetDataUrl(rawUrl) {
  const url = new URL(String(rawUrl || ''));
  if (url.protocol !== 'file:') throw new Error('Only local file assets may be embedded.');
  const filePath = fileURLToPath(url);
  const extension = path.extname(filePath).toLowerCase();
  const mime = ({ '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml' })[extension];
  if (!mime) throw new Error('Unsupported local image type.');
  const data = await fs.readFile(filePath);
  if (data.length > 30_000_000) throw new Error('Local image is too large to embed.');
  return `data:${mime};base64,${data.toString('base64')}`;
}

async function captureRendererRegion({ rect, scale = 1, format = 'png' }) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The Leaf window is unavailable.');
  if (!['png', 'jpg'].includes(format) || ![rect?.x, rect?.y, rect?.width, rect?.height].every(value => Number.isFinite(Number(value)))) throw new Error('Invalid renderer capture request.');
  const bounds = mainWindow.getContentBounds();
  const x = Math.max(0, Math.floor(Number(rect?.x) || 0));
  const y = Math.max(0, Math.floor(Number(rect?.y) || 0));
  const width = Math.max(1, Math.min(bounds.width - x, Math.ceil(Number(rect?.width) || 0)));
  const height = Math.max(1, Math.min(bounds.height - y, Math.ceil(Number(rect?.height) || 0)));
  if (width <= 0 || height <= 0 || width * height > 80_000_000) throw new Error('The selected object is outside the visible document area.');
  let image = await mainWindow.webContents.capturePage({ x, y, width, height });
  const normalizedScale = Math.max(0.25, Math.min(16, Number(scale) || 1));
  if ((width * normalizedScale) * (height * normalizedScale) > 80_000_000) throw new Error('Export dimensions are too large. Choose a smaller scale.');
  if (normalizedScale !== 1) image = image.resize({ width: Math.max(1, Math.round(width * normalizedScale)), height: Math.max(1, Math.round(height * normalizedScale)), quality: 'best' });
  return format === 'jpg'
    ? `data:image/jpeg;base64,${image.toJPEG(92).toString('base64')}`
    : `data:image/png;base64,${image.toPNG().toString('base64')}`;
}

function setDocumentFullscreen(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(enabled));
  return mainWindow.isFullScreen();
}

function writeRichClipboard({ text, html }) {
  clipboard.write({
    text: String(text ?? ''),
    html: String(html ?? '')
  });
  return true;
}

function writeTextClipboard(text) {
  clipboard.writeText(String(text ?? ''));
  return true;
}

async function openProjectFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Leaf Project',
    properties: ['openFile'],
    filters: [{ name: 'Leaf Project', extensions: ['prj', 'leaf', 'hbeproj', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 100_000_000) throw new Error('Leaf projects must be files smaller than 100 MB.');
  const raw = await fs.readFile(filePath, 'utf8');
  return { filePath, project: JSON.parse(raw) };
}

async function saveProjectFile({ filePath, project }) {
  if (!filePath) throw new Error('No project file path.');
  await atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
}

async function saveProjectFileAs({ suggestedName, project }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project As',
    defaultPath: suggestedName || 'project.prj',
    filters: [{ name: 'Leaf Project', extensions: ['prj'] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!/\.prj$/i.test(filePath)) filePath += '.prj';
  await atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
}

async function readProjectAtPath(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 100_000_000) throw new Error('Leaf projects must be files smaller than 100 MB.');
  const raw = await fs.readFile(filePath, 'utf8');
  return { filePath, project: JSON.parse(raw) };
}

// The Chromium PDF viewer can already highlight, draw and annotate; what it
// cannot do is put the result back into the Page. Its Save button issues a
// normal browser download, which without this would drop a detached copy in the
// downloads folder and leave the Page still pointing at the untouched original.
// Intercepting it turns that button into "save this Page".
const pendingPdfSaves = new Map();

function annotatedPdfTargetFor(downloadUrl) {
  for (const [sourcePath, entry] of pendingPdfSaves) {
    if (entry.url && downloadUrl && downloadUrl.includes(entry.url)) return sourcePath;
  }
  return pendingPdfSaves.size === 1 ? [...pendingPdfSaves.keys()][0] : null;
}

function registerPdfAnnotationCapture(session) {
  session.on('will-download', (event, item, webContents) => {
    if (item.getMimeType() !== 'application/pdf' && !/\.pdf$/i.test(item.getFilename())) return;
    const target = annotatedPdfTargetFor(item.getURL());
    if (!target) return;
    // Save to a temp path first, then replace the Page's file atomically, so a
    // cancelled or failed download cannot truncate the original.
    const staging = path.join(app.getPath('temp'), `leaf-pdf-${process.pid}-${Date.now()}.pdf`);
    item.setSavePath(staging);
    item.once('done', async (_e, state) => {
      pendingPdfSaves.delete(target);
      if (state !== 'completed') {
        webContents?.send('pdf:annotationSaved', { sourcePath: target, ok: false, error: `Download ${state}` });
        return;
      }
      try {
        await atomicWriteFile(target, await fs.readFile(staging), null);
        await fs.rm(staging, { force: true });
        webContents?.send('pdf:annotationSaved', { sourcePath: target, ok: true });
      } catch (error) {
        webContents?.send('pdf:annotationSaved', { sourcePath: target, ok: false, error: error.message });
      }
    });
  });
}

// The renderer arms this immediately before telling the viewer to save, so a
// download the user started for some other reason is never redirected onto a Page.
function armPdfAnnotationSave({ sourcePath, url } = {}) {
  if (!sourcePath || !DOCUMENT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) {
    throw new Error('A valid PDF page source path is required.');
  }
  pendingPdfSaves.set(sourcePath, { url: url || null, armedAt: Date.now() });
  setTimeout(() => pendingPdfSaves.delete(sourcePath), 60_000);
  return { armed: true };
}

// ----- Navigation guards ----------------------------------------------------
// The app is one window showing one local page; nothing in it should ever
// navigate anywhere. That was true by construction while Leaf only opened local
// files, but previews now render fetched pages and their own scripts, so the
// guarantee is made explicit rather than left to hold by accident.
//
// Bound through web-contents-created so it covers the main window, the hidden
// print window, and any webContents added later - wiring one window would leave
// the next one unguarded.
// Resolved on first use rather than at load: nothing here should run as a side
// effect of requiring the module.
let appEntryUrl = null;
function appEntryHref() {
  if (!appEntryUrl) {
    appEntryUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href.replace(/[?#].*$/, '');
  }
  return appEntryUrl;
}

function isAppEntry(rawUrl) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'file:') return false;
    // Compare the path only: a reload or an in-page hash must not be refused.
    return `${url.origin}${url.pathname}` === appEntryHref();
  } catch { return false; }
}

// A print window renders one temp file, so that file is its legitimate entry.
function isPrintableTemp(rawUrl) {
  if (!sessionTempDir || !rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'file:') return false;
    return path.resolve(fileURLToPath(url)).startsWith(path.resolve(sessionTempDir) + path.sep);
  } catch { return false; }
}

function installNavigationGuards(contents) {
  // Nothing in Leaf opens a second window. Every request is denied, and an
  // http(s) target is handed to the system browser instead of being dropped.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(String(url || ''))) openExternalLink(url).catch(() => {});
    return { action: 'deny' };
  });

  // A preview frame that follows a link really does navigate - it is a live page
  // in a sandbox, and that is the point. The renderer cannot see where it went,
  // because the frame is opaque-origin, so main reports the destination and the
  // renderer brings its own model along. Reported, never blocked.
  contents.on('will-frame-navigate', event => {
    if (event.isMainFrame) return;
    const slot = /^leaf-view-(.+)$/.exec(event.frame?.name || '')?.[1];
    if (!slot) return;
    let protocol = '';
    try { protocol = new URL(event.url).protocol; } catch { return; }
    if (protocol !== 'http:' && protocol !== 'https:') return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('preview:frameNavigated', { slot, url: event.url });
    }
  });

  // Top-level only. Subframe navigation is deliberately left alone: pointing a
  // preview frame at a PDF or an image IS a frame navigation, so guarding those
  // here would block the app's own rendering. Preview content is already held by
  // the sandbox, frame-src 'none', and the renderer preventDefaulting every
  // link - this guard exists for the one window that must never leave its page.
  contents.on('will-navigate', (event, url) => {
    if (isAppEntry(url) || isPrintableTemp(url)) return;
    event.preventDefault();
    let protocol = '';
    try { protocol = new URL(url).protocol; } catch {}
    if (protocol === 'http:' || protocol === 'https:') openExternalLink(url).catch(() => {});
    console.warn(`Blocked top-level navigation to ${String(url).slice(0, 120)}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1660,
    height: 1020,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#17191d',
    title: appTitle(),
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('page-title-updated', event => {
    event.preventDefault();
    syncAppTitle();
  });
  mainWindow.webContents.on('did-finish-load', syncAppTitle);
  mainWindow.on('enter-full-screen', () => mainWindow?.webContents.send('window:documentFullscreenChanged', true));
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('window:documentFullscreenChanged', false));
  registerPdfAnnotationCapture(mainWindow.webContents.session);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.on('web-contents-created', (_event, contents) => installNavigationGuards(contents));

app.whenReady().then(() => {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('file:importHtml', openHtmlFile);
  ipcMain.handle('file:readHtmlPath', (_e, filePath) => readHtmlPath(filePath));
  ipcMain.handle('file:importPages', openDocumentFiles);
  ipcMain.handle('file:importDocuments', openDocumentFiles); // v0.5.14 compatibility
  ipcMain.handle('file:readPagePath', (_e, filePath) => readDocumentPath(filePath));
  ipcMain.handle('file:resolveLinkTarget', (_e, payload) => resolveLinkTarget(payload));
  ipcMain.handle('shell:openExternal', (_e, url) => openExternalLink(url));
  ipcMain.handle('net:fetchPage', (_e, url) => fetchPageAtUrl(url));
  ipcMain.handle('net:fetchStylesheet', (_e, url) => fetchStylesheetText(url));
  ipcMain.handle('fonts:download', (_e, payload) => downloadPageFonts(payload || {}));
  ipcMain.handle('pdf:armAnnotationSave', (_e, payload) => armPdfAnnotationSave(payload));
  ipcMain.handle('file:readDocumentPath', (_e, filePath) => readDocumentPath(filePath)); // v0.5.14 compatibility
  ipcMain.handle('file:exportHtml', (_e, payload) => exportHtml(payload));
  ipcMain.handle('file:saveHtmlPath', (_e, payload) => saveHtmlPath(payload));
  ipcMain.handle('file:exportText', (_e, payload) => exportTextFile(payload));
  ipcMain.handle('file:saveTextPath', (_e, payload) => saveTextPath(payload));
  ipcMain.handle('file:copyDocumentAs', (_e, payload) => copyDocumentAs(payload));
  ipcMain.handle('file:exportPageAs', (_e, payload) => exportPageAs(payload));
  ipcMain.handle('file:exportObjectAsset', (_e, payload) => exportObjectAsset(payload));
  ipcMain.handle('file:exportObjectAssets', (_e, payload) => exportObjectAssets(payload));
  ipcMain.handle('file:readLocalAssetDataUrl', (_e, url) => readLocalAssetDataUrl(url));
  ipcMain.handle('window:captureRegion', (_e, payload) => captureRendererRegion(payload));
  ipcMain.handle('window:setDocumentFullscreen', (_e, enabled) => setDocumentFullscreen(enabled));
  ipcMain.handle('clipboard:writeRich', (_e, payload) => writeRichClipboard(payload));
  ipcMain.handle('clipboard:writeText', (_e, text) => writeTextClipboard(text));
  ipcMain.handle('project:open', openProjectFile);
  ipcMain.handle('project:readPath', (_e, filePath) => readProjectAtPath(filePath));
  ipcMain.handle('project:save', (_e, payload) => saveProjectFile(payload));
  ipcMain.handle('project:saveAs', (_e, payload) => saveProjectFileAs(payload));

  // Envelopes rather than throws: an Error crossing contextBridge keeps only its
  // message, and it arrives wrapped in "Error invoking remote method ...". The
  // kind is what decides whether the UI offers a re-sign-in, a wait, or a
  // narrower folder, so it has to survive as data.
  const githubReply = run => async (...args) => {
    try {
      return { ok: true, value: await run(...args) };
    } catch (error) {
      const kind = error?.kind || githubTransportKind(error);
      return {
        ok: false,
        kind,
        message: kind === 'network'
          ? githubTransportMessage(error)
          : String(error?.message || 'GitHub could not be reached.')
      };
    }
  };

  ipcMain.handle('github:status', githubReply(() => githubStatus()));
  ipcMain.handle('github:connect', githubReply((_e, payload) => githubConnect(payload)));
  ipcMain.handle('github:disconnect', githubReply(() => githubDisconnect()));
  ipcMain.handle('github:repos', githubReply(() => githubRepositories()));
  ipcMain.handle('github:repo', githubReply((_e, payload) => githubRepository(payload)));
  ipcMain.handle('github:branches', githubReply((_e, payload) => githubBranches(payload)));
  ipcMain.handle('github:tree', githubReply((_e, payload) => githubTree(payload)));
  ipcMain.handle('github:read', githubReply((_e, payload) => githubRead(payload)));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ---------------------------------------------------------------------------
// GitHub
//
// The token lives here and only here. Nothing on this surface returns it, and
// the renderer never receives it: it names an action, the main process attaches
// the credential. That is the whole reason these are verbs rather than a
// getToken().

// Required lazily. main.js is evaluated in a bare vm context by the legacy QA
// suites, whose require shim resolves from scripts/ and cannot see this path; a
// module-scope require would break them the moment the file is loaded. Nothing
// touches GitHub until a handler runs, so deferring costs nothing.
let githubModule = null;
function githubApi() {
  if (!githubModule) githubModule = require('./github-client.js');
  return githubModule;
}

function githubTokenPath() {
  return path.join(app.getPath('userData'), 'github-token.bin');
}

// safeStorage on Linux falls back to a "basic text" backend when no keyring is
// present. It still reports as available, so the backend name is passed to the
// UI rather than hidden - a user storing a token deserves to know whether the
// OS is really protecting it.
function githubStorageBackend() {
  if (!safeStorage.isEncryptionAvailable()) return 'unavailable';
  try {
    if (process.platform !== 'linux') return 'os';
    const backend = safeStorage.getSelectedStorageBackend?.();
    return backend === 'basic_text' ? 'weak' : 'os';
  } catch {
    return 'os';
  }
}

async function readStoredToken() {
  try {
    const encrypted = await fs.readFile(githubTokenPath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    const token = safeStorage.decryptString(encrypted);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

async function writeStoredToken(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This system has no secure storage, so Leaf will not keep a GitHub token here.');
  }
  const encrypted = safeStorage.encryptString(String(token));
  await fs.writeFile(githubTokenPath(), encrypted, { mode: 0o600 });
  // writeFile only applies the mode when it creates the file, so an existing
  // one keeps whatever permissions it had.
  try { await fs.chmod(githubTokenPath(), 0o600); } catch {}
}

let githubClientInstance = null;
function githubClient() {
  if (githubClientInstance) return githubClientInstance;
  githubClientInstance = githubApi().createGitHubClient({
  request: (url, { headers } = {}) => new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url, redirect: 'manual' });
    for (const [name, value] of Object.entries(headers || {})) request.setHeader(name, value);
    request.on('response', response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error', reject);
    });
    // redirect:'manual' still emits this; answering it keeps the stream alive
    // long enough for the response handler to see the 3xx.
    request.on('redirect', () => { try { request.abort(); } catch {} });
    request.on('error', reject);
    request.end();
  })
  });
  return githubClientInstance;
}

// Every handler funnels through here so a GitHubError keeps its kind on the way
// to the renderer, where the kind decides what the UI offers.
async function withGitHubToken(run) {
  const token = await readStoredToken();
  if (!token) {
    const error = new Error('Connect a GitHub account first.');
    error.name = 'GitHubError';
    error.kind = 'no-token';
    throw error;
  }
  try {
    return await run(token);
  } catch (error) {
    if (error instanceof githubApi().GitHubError) {
      const relayed = new Error(error.message);
      relayed.name = 'GitHubError';
      relayed.kind = error.kind;
      throw relayed;
    }
    throw error;
  }
}

// A transport failure never reaches the HTTP classifier, so it would otherwise
// surface to the user as a raw Chromium code like net::ERR_CERT_AUTHORITY_INVALID.
// Offline, blocked DNS and an untrusted proxy certificate are all states the UI
// has to be able to describe.
const TRANSPORT_PATTERN = /^(?:net::ERR_|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|UNABLE_TO_VERIFY)/;

function githubTransportKind(error) {
  return TRANSPORT_PATTERN.test(String(error?.message || '')) ? 'network' : 'unknown';
}

function githubTransportMessage(error) {
  const code = String(error?.message || '');
  if (/CERT|UNABLE_TO_VERIFY/i.test(code)) {
    return `Leaf could not verify GitHub's certificate. A proxy or security tool may be intercepting the connection. (${code})`;
  }
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/i.test(code)) {
    return 'GitHub could not be found. Check the network connection.';
  }
  if (/TIMED?_?OUT/i.test(code)) {
    return 'GitHub did not answer in time. Try again in a moment.';
  }
  return `Leaf could not reach GitHub. (${code})`;
}

async function githubStatus() {
  const token = await readStoredToken();
  return {
    connected: !!token,
    storage: githubStorageBackend(),
    login: token ? (githubLogin || null) : null
  };
}

let githubLogin = null;

async function githubConnect({ token } = {}) {
  const candidate = String(token || '').trim();
  if (!candidate) throw new Error('Paste a personal access token to connect.');
  // Verified before it is stored, so a typo never becomes a saved credential.
  const identity = await githubClient().identity(candidate);
  await writeStoredToken(candidate);
  githubLogin = identity.login;
  return { login: identity.login, name: identity.name, storage: githubStorageBackend() };
}

async function githubDisconnect() {
  githubLogin = null;
  try { await fs.unlink(githubTokenPath()); } catch {}
  return { connected: false };
}

function githubRepositories() {
  return withGitHubToken(token => githubClient().listRepositories(token));
}

function githubRepository({ owner, repo } = {}) {
  return withGitHubToken(token => githubClient().repository(token, { owner, repo }));
}

function githubBranches({ owner, repo } = {}) {
  return withGitHubToken(token => githubClient().listBranches(token, { owner, repo }));
}

function githubTree({ owner, repo, ref } = {}) {
  return withGitHubToken(token => githubClient().readTree(token, { owner, repo, ref }));
}

async function githubRead({ owner, repo, ref, path: filePath } = {}) {
  return withGitHubToken(async token => {
    const file = await githubClient().readFile(token, { owner, repo, ref, path: filePath });
    const directory = String(filePath).split('/').slice(0, -1).join('/');
    return {
      text: file.text,
      sha: file.sha,
      size: file.size,
      path: file.path,
      // The preview resolves relative images and links against this, so a
      // repository document behaves the way it does on GitHub.
      baseUrl: githubClient().rawUrlFor({ owner, repo, ref, path: directory ? `${directory}/` : '' })
    };
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', cleanupSessionTempDir);
