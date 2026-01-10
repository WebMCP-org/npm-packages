/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);

let cachedPolyfill: string | null = null;

/**
 * Load the @mcp-b/global IIFE polyfill code.
 * This polyfill provides the navigator.modelContext API for pages that don't have WebMCP.
 * Cached after first load for performance.
 *
 * @returns The IIFE JavaScript code as a string
 * @throws Error if the polyfill file cannot be found or read
 */
export function getPolyfillCode(): string {
  if (cachedPolyfill) {
    return cachedPolyfill;
  }

  try {
    // Use Node's module resolution to find the package regardless of
    // workspace structure or installation method (pnpm, npm, yarn).
    // Use the package's exported subpath '@mcp-b/global/iife' which resolves
    // to the IIFE bundle via the exports field in package.json.
    const polyfillPath = require.resolve('@mcp-b/global/iife');
    cachedPolyfill = readFileSync(polyfillPath, 'utf-8');
    return cachedPolyfill;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Provide actionable error message
    throw new Error(
      `Could not find @mcp-b/global polyfill: ${message}\n` +
        'Run `pnpm build` in the global package or ensure @mcp-b/global is installed.',
    );
  }
}

/**
 * Clear the cached polyfill code, forcing the next getPolyfillCode() call
 * to reload from disk. Useful for testing or after @mcp-b/global updates.
 */
export function clearPolyfillCache(): void {
  cachedPolyfill = null;
}
