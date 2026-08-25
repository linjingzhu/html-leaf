const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || '').trim());
  if (!match) throw new Error(`Unsupported version format: ${version}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
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

const current = parseVersion(pkg.version);
const explicitVersion = String(process.env.LEAF_BUILD_VERSION || versionFromTag() || '').trim();
const buildNumber = positiveInteger(process.env.LEAF_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER) || 1;
const version = explicitVersion || `${current.major}.${current.minor}.${current.patch + buildNumber}`;
parseVersion(version);

console.log(`version=${version}`);
