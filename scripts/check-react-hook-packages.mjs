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
    'webmcp-plugins',
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
    if (directory === 'webmcp-polyfill') {
      for (const entry of ['invocation', 'standard-schema', 'execution-state', 'consent', 'otel']) {
        assert.equal(
          `./${entry}` in manifest.exports,
          false,
          'Removed plugin paths must not remain as aliases'
        );
      }
    }
    if (directory === 'usewebmcp') {
      const packed = JSON.parse(run('tar', ['-xOf', filename, 'package/package.json']));
      assert(
        Object.keys(packed.dependencies).every(
          (name) =>
            (name === '@mcp-b/webmcp-plugins' || !name.startsWith('@mcp-b/')) &&
            !name.startsWith('@modelcontextprotocol/')
        ),
        'Core hooks may depend on the shared invocation runtime, never the MCP bridge or SDK'
      );
      const declarations = run('tar', ['-xOf', filename, 'package/dist/index.d.ts']);
      assert(
        !/@mcp-b\/(?!webmcp-plugins)|@modelcontextprotocol\//u.test(declarations),
        'Core declarations may reference the shared invocation contract, never bridge types'
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
            '@mcp-b/webmcp-plugins': tarballs['@mcp-b/webmcp-plugins'],
            ...(extended
              ? {
                  '@mcp-b/react-webmcp': tarballs['@mcp-b/react-webmcp'],
                  '@mcp-b/webmcp-ts-sdk': tarballs['@mcp-b/webmcp-ts-sdk'],
                  '@modelcontextprotocol/client': '2.0.0',
                  '@opentelemetry/api': '1.9.1',
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
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { ConsentBroker, consent } from '@mcp-b/webmcp-plugins/consent';
import { otel } from '@mcp-b/webmcp-plugins/otel';
import { trace } from '@opentelemetry/api';
import type { ToolAnnotations } from '@mcp-b/webmcp-types';
import { z } from 'zod';
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
  const raw = useWebMCP({
    name: 'raw', description: 'Infer results without an output schema',
    plugins: [executionState<number>()], execute: () => 42,
  });
  const rawResult: Promise<number> = raw.execute({});
  const transformed = useWebMCP({
    name: 'transformed', description: 'Infer transformed input with a generic observer',
    plugins: [executionState()],
    inputSchema: z.object({ count: z.string().transform(Number) }),
    execute: ({ count }) => count * 2,
  });
  const transformedResult: Promise<number> = transformed.execute({ count: '3' });
  const instrumented = useWebMCP({
    name: 'instrumented', description: 'Built-in plugins preserve handler result types',
    plugins: [
      otel({ tracer: trace.getTracer('packed-types') }),
      consent({ broker: new ConsentBroker({ policy: { mode: 'click' } }) }),
    ],
    inputSchema: z.object({ count: z.string().transform(Number) }),
    execute: ({ count }) => count * 2,
  });
  const instrumentedResult: Promise<number> = instrumented.execute({ count: '3' });
  // @ts-expect-error - outputSchema constrains the handler return type
  useWebMCP({ name: 'wrong', description: 'Wrong result', outputSchema: { type: 'number' }, execute: () => 'wrong' });
  return { context, result, rawResult, transformedResult, instrumentedResult };
}
`
      );
    }
    run('pnpm', ['exec', 'tsc'], consumer);
    run(
      'pnpm',
      [
        'exec',
        'tsc',
        '--strict',
        'false',
        '--strictNullChecks',
        'false',
        '--exactOptionalPropertyTypes',
        'false',
      ],
      consumer
    );
    writeFileSync(
      join(consumer, 'ssr.mjs'),
      `
import assert from 'node:assert/strict';
import { createElement, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import * as core from 'usewebmcp';
import { useWebMCP, useToolExecutionState } from 'usewebmcp';
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
${extended ? "import * as mcp from '@mcp-b/react-webmcp';" : ''}
assert.equal(typeof document, 'undefined');
assert.equal(typeof window, 'undefined');
const warnings = [];
const previousError = console.error;
console.error = (...args) => warnings.push(args);
const execution = executionState();
assert.deepEqual(Object.keys(core).sort(), ['useToolExecutionState', 'useWebMCP']);
function App() {
  assert.equal(useToolExecutionState(execution).isExecuting, false);
  const tool = useWebMCP({ name: 'ssr', description: 'Server rendering', execute: () => 'ready' });
  assert.equal(tool.isSupported, false);
  assert.equal('isRegistered' in tool, false);
  assert.equal(tool.registrationError, null);
  assert.equal('state' in tool, false);
  assert.equal('reset' in tool, false);
  ${
    extended
      ? `const extendedTool = mcp.useWebMCP({ name: 'ssr_extended', description: 'Extended server rendering', execute: () => 'ready' });
  assert.equal('isRegistered' in extendedTool, false);
  assert.equal('useWebMCPTool' in mcp, false);
  assert.equal('state' in extendedTool, false);
  assert.equal('reset' in extendedTool, false);
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
    if (extended) {
      writeFileSync(
        join(consumer, 'interop.mjs'),
        `
import assert from 'node:assert/strict';
import { createInvocationCallback, InvocationFailure } from '@mcp-b/webmcp-plugins';
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
const server = new BrowserMcpServer({ name: 'packed', version: '1' });
const client = new Client({ name: 'packed-client', version: '1' });
const observed = [];
const state = executionState();
let executions = 0;
try {
  await server.registerTool({
    name: 'packed_validation', description: 'Checks shared runner identity',
    inputSchema: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
    execute: createInvocationCallback(() => ({
      tool: { name: 'packed_validation', instanceId: 'packed-1' },
      plugins: [state, { name: 'packed:observe', async aroundInvoke(call, next) {
        observed.push(call.protocol);
        try { return await next(); }
        catch (error) {
          assert(error instanceof InvocationFailure);
          observed.push(error.kind);
          throw error;
        }
      } }],
      execute: ({ value }) => { executions += 1; return { value }; },
    })),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const invalid = await client.callTool({ name: 'packed_validation', arguments: { value: 'invalid' } });
  assert.equal(invalid.isError, true);
  assert.deepEqual(observed, ['mcp', 'invalid_input']);
  assert.equal(executions, 0);
  assert.equal(state.getSnapshot().executionCount, 0);
  assert(state.getSnapshot().error instanceof Error);
  const valid = await client.callTool({ name: 'packed_validation', arguments: { value: 7 } });
  assert.deepEqual(valid.structuredContent, { value: 7 });
  assert.equal(executions, 1);
  assert.equal(state.getSnapshot().executionCount, 1);
} finally { await client.close(); await server.close(); }
`
      );
      run(process.execPath, ['interop.mjs'], consumer);
    }
  }
  console.log(
    'Packed exports, isolated types, React 18/19 SSR, and shared MCP plugin identity passed.'
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
