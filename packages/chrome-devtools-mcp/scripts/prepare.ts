/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();

const filesToRemove = [
  'node_modules/chrome-devtools-frontend/package.json',
  'node_modules/chrome-devtools-frontend/front_end/models/trace/lantern/testing',
  'node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat/package/package.json',
];

/**
 * Removes the conflicting global HTMLElementEventMap declaration from
 * @paulirish/trace_engine/models/trace/ModelImpl.d.ts to avoid TS2717 error
 * when both chrome-devtools-frontend and @paulirish/trace_engine declare
 * the same property.
 */
function removeConflictingGlobalDeclaration(): void {
  console.log('Removing conflicting global declaration from @paulirish/trace_engine...');
  const pnpmVirtualStore = resolve(projectRoot, '../../node_modules/.pnpm');
  const traceEngineStoreEntry = existsSync(pnpmVirtualStore)
    ? readdirSync(pnpmVirtualStore).find((entry) => entry.startsWith('@paulirish+trace_engine@'))
    : undefined;
  const candidatePaths = [
    resolve(projectRoot, 'node_modules/@paulirish/trace_engine/models/trace/ModelImpl.d.ts'),
    ...(traceEngineStoreEntry
      ? [
          resolve(
            pnpmVirtualStore,
            traceEngineStoreEntry,
            'node_modules/@paulirish/trace_engine/models/trace/ModelImpl.d.ts'
          ),
        ]
      : []),
  ];
  const filePath = candidatePaths.find((path) => existsSync(path));

  if (!filePath) {
    console.log('No trace_engine ModelImpl.d.ts found; skipping patch.');
    return;
  }

  const content = readFileSync(filePath, 'utf-8');
  // Remove the declare global block using regex
  // Matches: declare global { ... interface HTMLElementEventMap { ... } ... }
  const newContent = content.replace(
    /declare global\s*\{\s*interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}\s*\}/s,
    ''
  );

  if (newContent === content) {
    console.log('No conflicting global declaration found; skipping patch.');
    return;
  }

  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Successfully removed conflicting global declaration.');
}

async function main() {
  console.log('Running prepare script to clean up chrome-devtools-frontend...');
  for (const file of filesToRemove) {
    const fullPath = resolve(projectRoot, file);
    console.log(`Removing: ${file}`);
    try {
      await rm(fullPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove ${file}:`, error);
      process.exit(1);
    }
  }
  console.log('Clean up of chrome-devtools-frontend complete.');

  removeConflictingGlobalDeclaration();
}

void main();
