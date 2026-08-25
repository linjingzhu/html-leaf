const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function copyMatchingArtifacts(sourceDir, targetDir, prefix) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Expected build output directory to exist: ${sourceDir}`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = [];
  for (const entry of fs.readdirSync(sourceDir)) {
    if (!entry.startsWith(prefix)) continue;
    const source = path.join(sourceDir, entry);
    if (!fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(targetDir, entry));
    copied.push(entry);
  }
  if (!copied.length) {
    throw new Error(`No artifacts matched ${prefix} in ${sourceDir}`);
  }
  return copied;
}

run(npmCmd, ['run', 'version:build']);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const outputDir = path.join(root, `release-v${version}`);
const cacheDir = path.join(root, '.leaf-macos-x64-artifacts');
const x64Prefix = `Leaf-${version}-mac-x64.`;

fs.rmSync(cacheDir, { recursive: true, force: true });

run(npxCmd, ['electron-builder', '--mac', 'dmg', 'zip', '--x64', '--publish', 'never']);
copyMatchingArtifacts(outputDir, cacheDir, x64Prefix);

run(npxCmd, ['electron-builder', '--mac', 'dmg', 'zip', '--arm64', '--publish', 'never']);
copyMatchingArtifacts(cacheDir, outputDir, x64Prefix);

fs.rmSync(cacheDir, { recursive: true, force: true });
console.log(`Leaf macOS build artifacts collected in release-v${version}`);
