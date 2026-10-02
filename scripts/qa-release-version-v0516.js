const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const bump = read('scripts/bump-build-version.js');
const desktop = read('.github/workflows/build-desktop.yml');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function includesAll(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}

check('Package exposes release version QA', pkg.scripts?.['qa:release-version'] === 'node scripts/qa-release-version-v0516.js');

// Local manual builds (npm run dist:win/dist:mac*) still derive a bumped
// version per invocation via bump-build-version.js -- unchanged by the CI
// rework below, still worth a direct check since nothing else exercises it.
includesAll('Build version script honors one explicit shared version', bump, [
  'const explicitVersion = process.env.LEAF_BUILD_VERSION || versionFromTag();',
  'const nextVersion = explicitVersion ||',
  'pkg.version = nextVersion',
  'pkg.build.directories.output = `release-v${nextVersion}`'
]);

// CI itself (build-desktop.yml) deliberately does NOT call bump-build-version
// or compute-release-version -- it tags straight from the committed
// package.json version, exactly like pdf-convertor's approved pattern this
// mirrors (see .ai/reports/OWNER_ACTIONS.md). That is what prevents the
// drift that caused package.json to read 0.5.16 while CI had already auto-
// bumped its way to windows-v0.5.239: there is no auto-bump left to drift.
includesAll('CI tags a release straight from the committed package.json version, with no auto-bump', desktop, [
  "version=$(node -p \"require('./package.json').version\")",
  'tag="v${version}-build.${GITHUB_RUN_NUMBER}"'
]);
check('CI does not invoke the version-bumping scripts', !desktop.includes('version:build') && !desktop.includes('compute-release-version'));
check('Windows dist build disables electron-builder auto-publish', pkg.scripts?.['dist:win']?.includes('--publish=never'));

console.log('\nLeaf release version QA');
console.log('=======================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
