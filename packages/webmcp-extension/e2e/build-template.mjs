import { spawnSync } from 'node:child_process';
import { accessSync, cpSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = resolve(packageDirectory, 'e2e/dist/template-build');
const extensionDirectory = resolve(packageDirectory, 'e2e/dist/extension');

rmSync(buildDirectory, { recursive: true, force: true });
rmSync(extensionDirectory, { recursive: true, force: true });
cpSync(resolve(packageDirectory, 'template'), buildDirectory, { recursive: true });
rmSync(resolve(buildDirectory, 'dist'), { recursive: true, force: true });
rmSync(resolve(buildDirectory, 'node_modules'), { recursive: true, force: true });

const scopeDirectory = resolve(buildDirectory, 'node_modules/@mcp-b');
mkdirSync(scopeDirectory, { recursive: true });
symlinkSync(resolve(packageDirectory, '../global'), resolve(scopeDirectory, 'global'), 'dir');
symlinkSync(packageDirectory, resolve(scopeDirectory, 'webmcp-extension'), 'dir');
symlinkSync(
  resolve(packageDirectory, 'node_modules/vite-plus'),
  resolve(buildDirectory, 'node_modules/vite-plus'),
  'dir'
);

const build = spawnSync(resolve(packageDirectory, 'node_modules/.bin/vp'), ['pack'], {
  cwd: buildDirectory,
  env: process.env,
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`Template build exited with status ${build.status}`);

const templateDist = resolve(buildDirectory, 'dist');
for (const file of ['manifest.json', 'main-world.iife.js', 'content-script.iife.js']) {
  accessSync(resolve(templateDist, file));
}
cpSync(templateDist, extensionDirectory, { recursive: true });
