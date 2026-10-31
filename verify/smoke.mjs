import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const required = ['index.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'assets/icon.svg'];
for (const file of required) {
  if (!existsSync(join(root, file))) throw new Error(`missing required file: ${file}`);
}
if (pkg.name !== 'dsh-plugin-dev-workflow') throw new Error(`unexpected package name: ${pkg.name}`);
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('invalid dsh.bundle.patch');
if (pkg.icon !== 'assets/icon.svg') throw new Error('icon must be declared');
if (!pkg.files?.includes('assets/icon.svg')) throw new Error('icon must be included in files');
const check = spawnSync(process.execPath, ['--check', join(root, 'index.js')], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);
console.log(`smoke passed: ${pkg.name}@${pkg.version}`);
