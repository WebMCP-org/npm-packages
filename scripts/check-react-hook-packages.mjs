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
  const [{ dependencies: installed }] = JSON.parse(
    run('pnpm', ['--filter', 'usewebmcp', 'list', 'webmcp-types', '--json'])
  );
  const upstreamTypesVersion = installed['webmcp-types'].version;
  const tarballs = {};
  for (const directory of [
    'webmcp-types',
    'webmcp-polyfill',
    'webmcp-ts-sdk',
    'usewebmcp',
    'react-webmcp',
  ]) {
    const cwd = join(root, 'packages', directory);
    const { name, filename } = JSON.parse(
      run('pnpm', ['pack', '--json', '--pack-destination', temporary], cwd)
    );
    tarballs[name] = `file:${filename}`;
    if (directory === 'usewebmcp' || directory === 'react-webmcp') {
      const javascript = run('tar', ['-xOf', filename, 'package/dist/index.js']);
      assert.match(javascript, /^(['"])use client\1;/u, `${name}: missing client boundary`);
    }
    if (directory === 'usewebmcp') {
      const packed = JSON.parse(run('tar', ['-xOf', filename, 'package/package.json']));
      assert(
        Object.keys(packed.dependencies).every(
          (dependency) =>
            !dependency.startsWith('@mcp-b/') && !dependency.startsWith('@modelcontextprotocol/')
        ),
        'Core hooks must not install MCP-B or MCP SDK packages'
      );
      const declarationFiles = run('tar', ['-tf', filename])
        .split('\n')
        .filter((path) => path.endsWith('.d.ts'));
      const declarations = run('tar', ['-xOf', filename, ...declarationFiles]);
      assert(
        !/(?:from|import)\s*\(?\s*["'](?:@mcp-b|@modelcontextprotocol)\//u.test(declarations),
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
    const dependencies = {
      usewebmcp: tarballs.usewebmcp,
      react: version,
      'react-dom': version,
      '@types/react': major,
      '@types/react-dom': major,
      '@types/node': '22.17.2',
      typescript: '5.9.3',
      zod: '4.4.3',
    };
    if (extended) {
      dependencies['@mcp-b/webmcp-types'] = tarballs['@mcp-b/webmcp-types'];
      dependencies['@mcp-b/react-webmcp'] = tarballs['@mcp-b/react-webmcp'];
      dependencies['@mcp-b/webmcp-ts-sdk'] = tarballs['@mcp-b/webmcp-ts-sdk'];
      dependencies['webmcp-types'] = upstreamTypesVersion;
    }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies,
        pnpm: { overrides: { ...tarballs, 'webmcp-types': upstreamTypesVersion } },
      })
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
      JSON.stringify({
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
      })
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
import type { WebMCP as AliasedWebMCP } from '@mcp-b/webmcp-types';
import { useWebMCP } from '@mcp-b/react-webmcp';
import type { ToolAnnotations } from '@mcp-b/webmcp-ts-sdk';
const context: WebMCP.ModelContext | undefined = document.modelContext;
const aliasedContext: AliasedWebMCP.ModelContext | undefined = context;
const schema = { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } as const;
const aliasedTool: AliasedWebMCP.ModelContextToolFromSchema<typeof schema> = {
  name: 'aliased', description: 'Forwarded upstream inference', inputSchema: schema,
  execute: ({ query }) => query.toUpperCase(),
};
// @ts-expect-error - upstream inference rejects numeric input through the alias too
aliasedTool.execute({ query: 123 }, { signal: new AbortController().signal });
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
  return { context, aliasedContext, result };
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
  assert.equal('isRegistered' in tool, false);
  assert.equal(tool.registrationError, null);
  assert.equal(tool.state.isExecuting, false);
  ${
    extended
      ? `const extendedTool = mcp.useWebMCP({ name: 'ssr_extended', description: 'Extended server rendering', execute: () => 'ready' });
  assert.equal('isRegistered' in extendedTool, false);
  assert.equal(extendedTool.registrationError, null);
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
