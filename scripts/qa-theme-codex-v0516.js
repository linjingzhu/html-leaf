const path = require('node:path');
const { spawnSync } = require('node:child_process');

console.log('Legacy Codex theme QA entry is mapped to the current Light theme policy.');
const result = spawnSync(process.execPath, [path.join(__dirname, 'qa-theme-light-v0516.js')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
