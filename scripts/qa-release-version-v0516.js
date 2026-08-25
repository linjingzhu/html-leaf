const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const bump = read('scripts/bump-build-version.js');
const compute = read('scripts/compute-release-version.js');
const windows = read('.github/workflows/build-windows.yml');
const macos = read('.github/workflows/build-macos.yml');
const release = read('.github/workflows/build-release.yml');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function includesAll(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}
function before(text, left, right) {
  const l = text.indexOf(left);
  const r = text.indexOf(right);
  return l >= 0 && r >= 0 && l < r;
}

check('Package exposes release version QA', pkg.scripts?.['qa:release-version'] === 'node scripts/qa-release-version-v0516.js');

includesAll('Build version script honors one explicit shared version', bump, [
  'const explicitVersion = process.env.LEAF_BUILD_VERSION || versionFromTag();',
  'const nextVersion = explicitVersion ||',
  'pkg.version = nextVersion',
  'pkg.build.directories.output = `release-v${nextVersion}`'
]);

includesAll('Shared version computation is non-mutating and deterministic per workflow invocation', compute, [
  'const explicitVersion = String(process.env.LEAF_BUILD_VERSION || versionFromTag() ||',
  'const buildNumber = positiveInteger(process.env.LEAF_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER) || 1',
  'console.log(`version=${version}`)'
]);

includesAll('Unified release workflow computes version once before platform jobs', release, [
  'name: Build Release',
  'prepare-version:',
  'outputs:',
  'version: ${{ steps.version.outputs.version }}',
  'node scripts/compute-release-version.js >> "$GITHUB_OUTPUT"',
  'build-windows:',
  'build-macos:',
  'needs: prepare-version'
]);
check('Release workflow computes the version before Windows packages', before(release, 'prepare-version:', 'build-windows:'));
check('Release workflow computes the version before macOS packages', before(release, 'prepare-version:', 'build-macos:'));

includesAll('Windows and macOS release jobs use the exact same prepared version', release, [
  'LEAF_BUILD_VERSION: ${{ needs.prepare-version.outputs.version }}',
  'Leaf-Windows-${{ needs.prepare-version.outputs.version }}',
  'Leaf-macOS-${{ needs.prepare-version.outputs.version }}',
  'tag="release-v${version}"'
]);

includesAll('Platform-only workflows accept an explicit build_version override', windows, [
  'build_version:',
  'LEAF_BUILD_VERSION: ${{ inputs.build_version }}',
  'LEAF_BUILD_NUMBER: ${{ github.run_number }}'
]);
includesAll('macOS workflow accepts the same explicit build_version override', macos, [
  'build_version:',
  'LEAF_BUILD_VERSION: ${{ inputs.build_version }}',
  'LEAF_BUILD_NUMBER: ${{ github.run_number }}'
]);

includesAll('Pull-request verification still uploads non-publishing build artifacts', windows, [
  'pull_request:',
  'npm run dist:win',
  'Upload build artifacts'
]);
check('Windows dist build disables electron-builder auto-publish', pkg.scripts?.['dist:win']?.includes('--publish=never'));

console.log('\nLeaf release version QA');
console.log('=======================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
