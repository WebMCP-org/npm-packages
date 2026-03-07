#!/usr/bin/env node
/**
 * Post-build: renames IIFE outputs and wraps widget into HTML.
 * Run after tsdown produces dist/browser/{embed.iife.js, widget.iife.js}.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const browserDir = resolve(__dirname, '../dist/browser');

// Rename .iife.js → .js for cleaner paths
renameSync(resolve(browserDir, 'embed.iife.js'), resolve(browserDir, 'embed.js'));
renameSync(resolve(browserDir, 'widget.iife.js'), resolve(browserDir, 'widget.js'));

// Wrap widget.js into widget.html
const widgetJs = readFileSync(resolve(browserDir, 'widget.js'), 'utf-8');
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebMCP Relay Widget</title>
  </head>
  <body>
    <script>${widgetJs}</script>
  </body>
</html>
`;

writeFileSync(resolve(browserDir, 'widget.html'), html);
console.log('✓ Browser files ready: embed.js, widget.html');
