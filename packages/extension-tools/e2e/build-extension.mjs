import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = resolve(PACKAGE_DIR, 'e2e/extension');
const OUT_DIR = resolve(PACKAGE_DIR, 'dist/e2e-extension');

mkdirSync(OUT_DIR, { recursive: true });
cpSync(resolve(SOURCE_DIR, 'manifest.json'), resolve(OUT_DIR, 'manifest.json'));
cpSync(resolve(SOURCE_DIR, 'client.html'), resolve(OUT_DIR, 'client.html'));
