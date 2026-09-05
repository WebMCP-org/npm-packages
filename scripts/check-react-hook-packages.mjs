#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), 'webmcp-react-packages-'));
const run = (command, args, cwd = root) => {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    process.stderr.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw error;
  }
};

try {
  const tarballs = {};
  for (const directory of [
    'webmcp-types',
    'webmcp-polyfill',
    'webmcp-ts-sdk',
    'usewebmcp',
    'react-webmcp',
  ]) {
    const cwd = join(root, 'packages', directory);
    const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    const { filename } = JSON.parse(
      run('pnpm', ['pack', '--json', '--pack-destination', temporary], cwd)
    );
    tarballs[manifest.name] = `file:${filename}`;
    if (directory === 'usewebmcp' || directory === 'react-webmcp') {
      const javascript = run('tar', ['-xOf', filename, 'package/dist/index.js']);
      assert.match(
        javascript,
        /^(['"])use client\1;/u,
        `${manifest.name}: missing client boundary`
      );
    }
    if (directory === 'usewebmcp') {
      const packed = JSON.parse(run('tar', ['-xOf', filename, 'package/package.json']));
      assert(
        Object.keys(packed.dependencies).every(
          (name) => !name.startsWith('@mcp-b/') && !name.startsWith('@modelcontextprotocol/')
        ),
        'Core hooks must not install MCP-B or MCP SDK packages'
      );
      const declarations = run('tar', ['-xOf', filename, 'package/dist/index.d.ts']);
      assert(
        !/@mcp-b\/|@modelcontextprotocol\//u.test(declarations),
        'Core declarations must be standalone'
      );
    }
  }

  for (const [version, extended] of [
    ['18.3.1', false],
    ['19.2.3', true],
  ]) {
    const consumer = join(temporary, `react-${version}`);
    mkdirSync(consumer);
    const major = version.split('.')[0];
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify(
        {
          private: true,
          type: 'module',
          dependencies: {
            usewebmcp: tarballs.usewebmcp,
            ...(extended
              ? {
                  '@mcp-b/react-webmcp': tarballs['@mcp-b/react-webmcp'],
                  '@mcp-b/webmcp-types': tarballs['@mcp-b/webmcp-types'],
                  'webmcp-types': '0.1.6',
                }
              : {}),
            react: version,
            'react-dom': version,
            '@types/react': major,
            '@types/react-dom': major,
            '@types/node': '22.17.2',
            typescript: '5.9.3',
            zod: '4.4.3',
          },
          pnpm: { overrides: tarballs },
        },
        null,
        2
      )
    );
    console.log(
      `Checking packed hooks with React ${version}${extended ? ' and MCP-B extensions' : ' (core only)'}`
    );
    run(
      'pnpm',
      ['install', '--ignore-scripts', '--lockfile=false', '--reporter=append-only'],
      consumer
    );
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2024', 'DOM', 'DOM.Iterable'],
            strict: true,
            exactOptionalPropertyTypes: true,
            skipLibCheck: false,
            noEmit: true,
          },
          include: ['*.ts'],
        },
        null,
        2
      )
    );
    const coreTypes = readFileSync(
      join(root, 'packages/usewebmcp/type-tests/inference.test.ts'),
      'utf8'
    );
    writeFileSync(
      join(consumer, 'core-types.ts'),
      coreTypes.replace('../src/index.js', 'usewebmcp')
    );
    if (extended) {
      writeFileSync(
        join(consumer, 'extended-types.ts'),
        `
import type { WebMCP } from 'webmcp-types';
import { useWebMCP } from '@mcp-b/react-webmcp';
import type { ToolAnnotations } from '@mcp-b/webmcp-types';
const context: WebMCP.ModelContext | undefined = document.modelContext;
const annotations: ToolAnnotations = { readOnlyHint: true, idempotentHint: true };
export function useExtendedTypes() {
  const tool = useWebMCP({
    name: 'extended', description: 'Extended tool', annotations,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object', properties: { length: { type: 'number' } }, required: ['length'] },
    execute: ({ query }, { signal }) => { signal.throwIfAborted(); return { length: query.length }; },
  });
  const result: Promise<{ length: number }> = tool.execute({ query: 'ok' });
  // @ts-expect-error - outputSchema constrains the handler return type
  useWebMCP({ name: 'wrong', description: 'Wrong result', outputSchema: { type: 'number' }, execute: () => 'wrong' });
  return { context, result };
}
`
      );
    }
    run('pnpm', ['exec', 'tsc'], consumer);
    run(
      'pnpm',
      ['exec', 'tsc', '--strictNullChecks', 'false', '--exactOptionalPropertyTypes', 'false'],
      consumer
    );
    writeFileSync(
      join(consumer, 'ssr.mjs'),
      `
import assert from 'node:assert/strict';
import { createElement, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { useWebMCP } from 'usewebmcp';
${extended ? "import * as mcp from '@mcp-b/react-webmcp';" : ''}
assert.equal(typeof document, 'undefined');
assert.equal(typeof window, 'undefined');
const warnings = [];
const previousError = console.error;
console.error = (...args) => warnings.push(args);
function App() {
  const tool = useWebMCP({ name: 'ssr', description: 'Server rendering', execute: () => 'ready' });
  assert.equal(tool.isSupported, false);
  assert.equal(tool.isRegistered, false);
  assert.equal(tool.state.isExecuting, false);
  ${
    extended
      ? `mcp.useWebMCP({ name: 'ssr_extended', description: 'Extended server rendering', execute: () => 'ready' });
  mcp.useWebMCPContext('ssr_context', 'Context', () => ({ ready: true }));
  mcp.useWebMCPPrompt({ name: 'ssr_prompt', get: () => ({ messages: [] }) });
  mcp.useWebMCPResource({ name: 'ssr_resource', uri: 'data://ssr', read: () => ({ contents: [] }) });`
      : ''
  }
  return createElement('p', null, 'ready');
}
assert.equal(renderToString(createElement(StrictMode, null, createElement(App))), '<p>ready</p>');
console.error = previousError;
assert.deepEqual(warnings, []);
`
    );
    run(process.execPath, ['ssr.mjs'], consumer);
  }
  console.log('Packed client boundaries, isolated type checks, and React 18/19 SSR passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
