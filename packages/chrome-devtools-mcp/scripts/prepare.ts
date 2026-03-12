/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';

const projectRoot = process.cwd();

const filesToRemove = [
  'node_modules/chrome-devtools-frontend/package.json',
  'node_modules/chrome-devtools-frontend/front_end/models/trace/lantern/testing',
  'node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat/package/package.json',
];

const formatterWorkerFilesToPatch = [
  'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/ESTreeWalker.ts',
  'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/JavaScriptFormatter.ts',
  'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/ScopeParser.ts',
];

/**
 * Removes the conflicting global HTMLElementEventMap declaration from
 * @paulirish/trace_engine/models/trace/ModelImpl.d.ts to avoid TS2717 error
 * when both chrome-devtools-frontend and @paulirish/trace_engine declare
 * the same property.
 */
function removeConflictingGlobalDeclaration(): void {
  console.log(
    'Removing conflicting global declaration from @paulirish/trace_engine...',
  );
  const pnpmStorePath = resolve(projectRoot, '..', '..', 'node_modules', '.pnpm');
  if (!existsSync(pnpmStorePath)) {
    console.log('Trace engine declaration file not found, skipping cleanup.');
    return;
  }

  const traceEngineDir = readdirSync(pnpmStorePath).find(entry =>
    entry.startsWith('@paulirish+trace_engine@'),
  );
  if (!traceEngineDir) {
    console.log('Trace engine declaration file not found, skipping cleanup.');
    return;
  }

  const filePath = resolve(
    pnpmStorePath,
    traceEngineDir,
    'node_modules',
    '@paulirish',
    'trace_engine',
    'models',
    'trace',
    'ModelImpl.d.ts',
  );
  if (!existsSync(filePath)) {
    console.log('Trace engine declaration file not found, skipping cleanup.');
    return;
  }
  const content = readFileSync(filePath, 'utf-8');
  // Remove the declare global block using regex
  // Matches: declare global { ... interface HTMLElementEventMap { ... } ... }
  const newContent = content.replace(
    /declare global\s*\{\s*interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}\s*\}/s,
    '',
  );
  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Successfully removed conflicting global declaration.');
}

function disableTypeCheckingForFormatterWorker(): void {
  for (const file of formatterWorkerFilesToPatch) {
    const fullPath = resolve(projectRoot, file);
    if (!existsSync(fullPath)) {
      continue;
    }

    const content = readFileSync(fullPath, 'utf-8');
    if (content.startsWith('// @ts-nocheck')) {
      continue;
    }
    writeFileSync(fullPath, `// @ts-nocheck\n${content}`, 'utf-8');
  }
  console.log('Patched formatter worker sources for third-party typecheck compatibility.');
}

async function main() {
  console.log('Running prepare script to clean up chrome-devtools-frontend...');
  for (const file of filesToRemove) {
    const fullPath = resolve(projectRoot, file);
    console.log(`Removing: ${file}`);
    try {
      await rm(fullPath, {recursive: true, force: true});
    } catch (error) {
      console.error(`Failed to remove ${file}:`, error);
      process.exit(1);
    }
  }
  console.log('Clean up of chrome-devtools-frontend complete.');

  removeConflictingGlobalDeclaration();
  disableTypeCheckingForFormatterWorker();
}

void main();
