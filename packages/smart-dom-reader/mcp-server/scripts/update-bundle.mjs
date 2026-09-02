#!/usr/bin/env node
// Copies the built Smart DOM Reader library into the MCP server location.
// Source: ../../dist/index.mjs (ESM, single file, no chunks)
// Dest:   ../lib/smart-dom-reader.bundle.js

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const src = resolve(__dirname, '../../dist/index.mjs');
const destDir = resolve(__dirname, '../lib');
const dest = join(destDir, 'smart-dom-reader.bundle.js');

try {
  if (!existsSync(src)) {
    console.error('Source dist file not found:', src);
    console.error('Run "pnpm --filter @mcp-b/smart-dom-reader build" first.');
    process.exit(1);
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log('✅ Copied bundle to', dest);
} catch (err) {
  console.error('❌ Failed to update bundle:', err.message);
  process.exit(1);
}
