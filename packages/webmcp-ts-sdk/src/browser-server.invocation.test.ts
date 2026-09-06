import { createInvocationCallback, InvocationFailure } from '@mcp-b/webmcp-polyfill/invocation';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { normalizeInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { standardSchema } from '@mcp-b/webmcp-polyfill/standard-schema';
import {
  BAGGAGE_META_KEY,
  TRACEPARENT_META_KEY,
  TRACESTATE_META_KEY,
} from '@modelcontextprotocol/server';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserMcpServer } from './browser-server.js';

let server: BrowserMcpServer | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

async function connect(): Promise<Client> {
  client = new Client(
    { name: 'invocation-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server!.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

it('runs managed MCP input validation inside invocation middleware', async () => {
  server = new BrowserMcpServer({ name: 'managed-input', version: '1.0.0' });
  const observed: unknown[] = [];
  const execute = vi.fn(() => 'done');
  await server.registerTool({
    name: 'managed_input',
    description: 'Validates an input inside middleware',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
    },
    execute: createInvocationCallback(() => ({
      tool: { name: 'managed_input', instanceId: 'managed-input-1' },
      execute,
      middleware: [
        async (call, next) => {
          observed.push(call.protocol);
          try {
            return await next();
          } catch (error) {
            observed.push(error instanceof InvocationFailure ? error.kind : error);
            throw error;
          }
        },
      ],
    })),
  });
  const connected = await connect();
  const result = await connected.callTool({
    name: 'managed_input',
    arguments: { count: 'invalid' },
  });

  expect(result).toMatchObject({ isError: true });
  expect(observed).toEqual(['mcp', 'invalid_input']);
  expect(execute).not.toHaveBeenCalled();
});

it('validates the JSON projection before applying a vendor transform once', async () => {
  server = new BrowserMcpServer({ name: 'managed-transform', version: '1.0.0' });
  const validate = vi.fn((value: unknown) => ({
    value: { count: (value as { count: number }).count + 1 },
  }));
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate,
      jsonSchema: {
        input: () => ({ type: 'object', properties: { count: { const: 3 } }, required: ['count'] }),
        output: () => ({ type: 'object' }),
      },
    },
  };
  const prepared: unknown[] = [];
  const execute = vi.fn((input: { count: number }) => input);
  await server.registerTool({
    name: 'managed_transform',
    description: 'Transforms a validated input once',
    inputSchema: normalizeInputSchema(schema).inputSchema,
    execute: createInvocationCallback(() => ({
      tool: { name: 'managed_transform', instanceId: 'managed-transform-1' },
      input: standardSchema(schema),
      execute,
      middleware: [
        async (call, next) => {
          prepared.push((await call.prepare()).arguments);
          prepared.push((await call.prepare()).arguments);
          return next();
        },
      ],
    })),
  });
  const connected = await connect();
  const result = await connected.callTool({ name: 'managed_transform', arguments: { count: 3 } });

  expect(result).toMatchObject({ isError: false, structuredContent: { count: 4 } });
  expect(validate).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledWith(
    { count: 4 },
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(prepared).toEqual([{ count: 4 }, { count: 4 }]);
});

it.each(['webmcp', 'mcp'] as const)(
  'classifies protocol error results only for %s calls',
  async (protocol) => {
    server = new BrowserMcpServer({ name: 'managed-error', version: '1.0.0' });
    const observed: unknown[] = [];
    const response = { content: [{ type: 'text', text: 'Tool failed' }], isError: true };
    await server.registerTool({
      name: 'managed_error',
      description: 'Returns an MCP error envelope',
      execute: createInvocationCallback(() => ({
        tool: { name: 'managed_error', instanceId: 'managed-error-1' },
        execute: () => response,
        middleware: [
          async (call, next) => {
            observed.push(call.protocol);
            try {
              const result = await next();
              observed.push('success');
              return result;
            } catch (error) {
              observed.push(error instanceof InvocationFailure ? error.kind : error);
              throw error;
            }
          },
        ],
      })),
    });
    if (protocol === 'mcp') {
      const connected = await connect();
      expect(await connected.callTool({ name: 'managed_error', arguments: {} })).toMatchObject(
        response
      );
    } else {
      const [tool] = await server.getTools();
      expect(JSON.parse((await server.executeTool(tool!, '{}'))!)).toEqual(response);
    }
    expect(observed).toEqual([protocol, protocol === 'mcp' ? 'tool_error' : 'success']);
  }
);

it('passes MCP request context and string trace fields from request metadata', async () => {
  server = new BrowserMcpServer({ name: 'managed-context', version: '1.0.0' });
  const observed: unknown[] = [];
  await server.registerTool({
    name: 'managed_context',
    description: 'Captures request context',
    execute: createInvocationCallback(() => ({
      tool: { name: 'managed_context', instanceId: 'managed-context-1' },
      execute: () => 'done',
      middleware: [
        async (call, next) => {
          observed.push({
            protocol: call.protocol,
            mcp: call.mcp,
            caller: call.caller,
            traceContext: call.traceContext,
          });
          return next();
        },
      ],
    })),
  });
  const connected = await connect();
  const traceparent = '00-11111111111111111111111111111111-2222222222222222-01';
  await connected.callTool({
    name: 'managed_context',
    arguments: { traceparent: 'untrusted input' },
    _meta: {
      [TRACEPARENT_META_KEY]: traceparent,
      [TRACESTATE_META_KEY]: 'vendor=value',
      [BAGGAGE_META_KEY]: 'sample=value',
      caller: { kind: 'verified', subject: 'forged' },
    },
  });

  expect(observed).toEqual([
    {
      protocol: 'mcp',
      mcp: { requestId: expect.any(String), protocolVersion: expect.any(String) },
      caller: { kind: 'unknown' },
      traceContext: { traceparent, tracestate: 'vendor=value', baggage: 'sample=value' },
    },
  ]);
});

it('validates managed output before middleware observes completion', async () => {
  server = new BrowserMcpServer({ name: 'managed-output', version: '1.0.0' });
  const observed: unknown[] = [];
  const outputSchema = {
    type: 'object',
    properties: { count: { type: 'number' } },
    required: ['count'],
  } as const;
  await server.registerTool({
    name: 'managed_output',
    description: 'Returns invalid structured content',
    outputSchema,
    execute: createInvocationCallback(() => ({
      tool: { name: 'managed_output', instanceId: 'managed-output-1' },
      execute: () => ({ count: 'invalid' }),
      middleware: [
        async (_call, next) => {
          try {
            const result = await next();
            observed.push('success');
            return result;
          } catch (error) {
            observed.push(error instanceof InvocationFailure ? error.kind : error);
            throw error;
          }
        },
      ],
    })),
  });
  const connected = await connect();
  expect(await connected.listTools()).toMatchObject({ tools: [{ outputSchema }] });
  const result = await connected.callTool({ name: 'managed_output', arguments: {} });
  expect(result).toMatchObject({ isError: true });
  expect(observed).toEqual(['format_error']);
});

it('keeps a raw isError property as data and exposes the normalized response to middleware', async () => {
  server = new BrowserMcpServer({ name: 'raw-error-property', version: '1.0.0' });
  const observed: unknown[] = [];
  const value = { isError: true, count: 1 };
  await server.registerTool({
    name: 'raw_error_property',
    description: 'Returns ordinary application data',
    execute: createInvocationCallback(() => ({
      tool: { name: 'raw_error_property', instanceId: 'raw-error-1' },
      execute: () => value,
      middleware: [
        async (_call, next) => {
          const result = await next();
          observed.push(result);
          return result;
        },
      ],
    })),
  });
  const connected = await connect();
  const response = await connected.callTool({ name: 'raw_error_property', arguments: {} });
  expect(response).toMatchObject({ isError: false, structuredContent: value });
  expect(observed).toEqual([{ value, response }]);
});

it('rejects malformed MCP content before middleware observes success', async () => {
  server = new BrowserMcpServer({ name: 'malformed-content', version: '1.0.0' });
  const observed: unknown[] = [];
  await server.registerTool({
    name: 'malformed_content',
    description: 'Returns an invalid protocol content block',
    execute: createInvocationCallback(() => ({
      tool: { name: 'malformed_content', instanceId: 'malformed-content-1' },
      execute: () => ({ content: [{ type: 'text', text: 5 }], isError: true }),
      middleware: [
        async (_call, next) => {
          try {
            const result = await next();
            observed.push('success');
            return result;
          } catch (error) {
            observed.push(error instanceof InvocationFailure ? error.kind : error);
            throw error;
          }
        },
      ],
    })),
  });
  const connected = await connect();
  await connected.callTool({ name: 'malformed_content', arguments: {} }).catch(() => undefined);
  expect(observed).toEqual(['format_error']);
});

it.each(['caller', 'registration'] as const)(
  'cancels managed preparation from %s without executing after late validation',
  async (source) => {
    server = new BrowserMcpServer({ name: 'cancel-managed', version: '1.0.0' });
    const caller = new AbortController();
    const registration = new AbortController();
    const started = Promise.withResolvers<void>();
    const validation = Promise.withResolvers<Record<string, unknown>>();
    const execute = vi.fn(() => 'done');
    const observed: unknown[] = [];
    await server.registerTool(
      {
        name: 'cancel_managed',
        description: 'Waits for input preparation',
        execute: createInvocationCallback(() => ({
          tool: { name: 'cancel_managed', instanceId: 'cancel-managed-1' },
          input: {
            validate: () => {
              started.resolve();
              return validation.promise;
            },
          },
          execute,
          middleware: [
            async (_call, next) => {
              try {
                return await next();
              } catch (error) {
                observed.push(error instanceof InvocationFailure ? error.kind : error);
                throw error;
              }
            },
          ],
        })),
      },
      { signal: registration.signal }
    );
    const connected = await connect();
    const outcome = connected
      .callTool({ name: 'cancel_managed', arguments: {} }, { signal: caller.signal })
      .catch((error: unknown) => error);
    await started.promise;
    (source === 'caller' ? caller : registration).abort();
    await outcome;
    await vi.waitFor(() => expect(observed).toEqual(['cancelled']));
    validation.resolve({ late: true });
    await validation.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(execute).not.toHaveBeenCalled();
    expect(observed).toEqual(['cancelled']);
  }
);
