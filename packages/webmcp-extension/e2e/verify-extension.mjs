import { accessSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDirectory = resolve(packageDirectory, 'e2e/dist/extension');

for (const file of ['manifest.json', 'main-world.iife.js', 'content-script.iife.js']) {
  accessSync(resolve(extensionDirectory, file));
}
