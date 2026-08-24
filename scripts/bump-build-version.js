const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`Unsupported version format: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function versionFromTag() {
  const ref = process.env.GITHUB_REF || '';
  const refName = process.env.GITHUB_REF_NAME || '';
  const fromRef = /^refs\/tags\/v(.+)$/.exec(ref);
  if (fromRef) return fromRef[1];
  const fromName = /^v(.+)$/.exec(refName);
  if ((process.env.GITHUB_REF_TYPE || '').toLowerCase() === 'tag' && fromName) return fromName[1];
  return null;
}

const pkg = readJson(packagePath);
const current = parseVersion(pkg.version);
const explicitVersion = process.env.LEAF_BUILD_VERSION || versionFromTag();
const buildNumber = positiveInteger(process.env.LEAF_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER) || 1;
const nextVersion = explicitVersion || `${current.major}.${current.minor}.${current.patch + buildNumber}`;

parseVersion(nextVersion);
pkg.version = nextVersion;
if (pkg.build?.directories) {
  pkg.build.directories.output = `release-v${nextVersion}`;
}
writeJson(packagePath, pkg);

if (fs.existsSync(lockPath)) {
  const lock = readJson(lockPath);
  lock.version = nextVersion;
  if (lock.packages?.['']) {
    lock.packages[''].version = nextVersion;
  }
  writeJson(lockPath, lock);
}

console.log(`Leaf build version: ${nextVersion}`);
