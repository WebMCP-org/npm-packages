/**
 * Native ESM resolution test.
 *
 * This test verifies that the package's dependencies can be imported in a native
 * Node.js ESM environment WITHOUT bundler intervention. This catches issues like
 * missing .js extensions in ESM imports, which bundlers like Vite/esbuild handle
 * but native Node.js ESM does not.
 *
 * This test was added after discovering that @n8n/json-schema-to-zod had broken
 * native ESM imports (missing .js extensions), which caused failures in Astro
 * and other native ESM environments.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Spawns a native Node.js ESM process to test imports without bundler intervention.
 */
function testNativeEsmImport(code: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['--input-type=module', '-e', code], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

describe('Native ESM Resolution', () => {
  it('should import json-schema-to-zod dependency without bundler', async () => {
    // This test directly imports our json-schema-to-zod dependency in a native
    // Node.js ESM context. If the dependency has broken ESM (like missing .js
    // extensions), this will fail even though bundled tests pass.
    const code = `
      import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
      const schema = jsonSchemaToZod({ type: 'object', properties: { name: { type: 'string' } } });
      if (typeof schema !== 'object') throw new Error('Invalid schema');
    `;

    const result = await testNativeEsmImport(code);

    expect(result.success, `Native ESM import failed: ${result.error}`).toBe(true);
  });

  it('should convert JSON schema to Zod schema correctly in native ESM', async () => {
    const code = `
      import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
      import { z } from 'zod';

      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name']
      });

      // Verify it's a valid Zod schema by using it
      const result = schema.safeParse({ name: 'test', age: 25 });
      if (!result.success) throw new Error('Schema validation failed');
    `;

    const result = await testNativeEsmImport(code);

    expect(result.success, `Native ESM schema conversion failed: ${result.error}`).toBe(true);
  });
});
