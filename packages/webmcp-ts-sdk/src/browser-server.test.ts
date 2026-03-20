import type {
  InputSchema,
  JsonSchemaForInference,
  ModelContextCore,
  StandardJSONSchemaV1,
} from '@mcp-b/webmcp-types';
import { describe, expect, it, vi } from 'vitest';
import { BrowserMcpServer } from './browser-server.js';

const SERVER_INFO = {
  name: 'schema-test-server',
  version: '1.0.0',
} as const;

function createServer(native?: ModelContextCore): BrowserMcpServer {
  return new BrowserMcpServer(SERVER_INFO, native ? { native } : undefined);
}

function createStandardJsonSchema(
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown> = { type: 'object', properties: {} }
): StandardJSONSchemaV1<Record<string, unknown>, Record<string, unknown>> {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      jsonSchema: {
        input: () => inputSchema,
        output: () => outputSchema,
      },
    },
  };
}

function createValidatorOnlyStandardSchema() {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
    },
  };
}

describe('BrowserMcpServer schema registration', () => {
  it('passes plain JSON Schema through listTools unchanged', () => {
    const server = createServer();
    const inputSchema: InputSchema = {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    };
    const outputSchema: JsonSchemaForInference = {
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
      required: ['result'],
    };

    server.registerTool({
      name: 'plain_json_tool',
      description: 'Plain JSON Schema tool',
      inputSchema,
      outputSchema,
      execute: async () => ({ result: 'ok' }),
    });

    expect(server.listTools()).toEqual([
      {
        name: 'plain_json_tool',
        description: 'Plain JSON Schema tool',
        inputSchema,
        outputSchema,
      },
    ]);
  });

  it('converts Standard JSON Schema tool schemas and strips $schema metadata', () => {
    const server = createServer();
    const standardToolSchema = createStandardJsonSchema(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
        required: ['result'],
      }
    );

    server.registerTool({
      name: 'standard_json_tool',
      description: 'Standard JSON Schema tool',
      inputSchema: standardToolSchema,
      outputSchema: standardToolSchema,
      execute: async () => ({ result: 'ok' }),
    });

    const tool = server.listTools()[0];
    expect(tool?.inputSchema).toEqual({
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    });
    expect(tool?.outputSchema).toEqual({
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
      required: ['result'],
    });
    expect(tool?.inputSchema).not.toHaveProperty('$schema');
    expect(tool?.outputSchema).not.toHaveProperty('$schema');
  });

  it('normalizes Standard JSON Schema prompt args for prompt listing', () => {
    const server = createServer();

    server.registerPrompt({
      name: 'review_code',
      description: 'Review code',
      argsSchema: createStandardJsonSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to review' },
        },
        required: ['code'],
      }),
      get: async () => ({
        messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
      }),
    });

    expect(server.listPrompts()).toEqual([
      {
        name: 'review_code',
        description: 'Review code',
        arguments: [{ name: 'code', description: 'Code to review', required: true }],
      },
    ]);
  });

  it('rejects validator-only Standard Schema on tool registration', () => {
    const server = createServer();

    expect(() =>
      server.registerTool({
        name: 'validator_only_tool',
        description: 'Validator-only tool',
        inputSchema: createValidatorOnlyStandardSchema(),
        execute: async () => ({ ok: true }),
      })
    ).toThrow('validator-only Standard Schema');
  });

  it('rejects validator-only Standard Schema on prompt registration', () => {
    const server = createServer();

    expect(() =>
      server.registerPrompt({
        name: 'validator_only_prompt',
        argsSchema: createValidatorOnlyStandardSchema(),
        get: async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
        }),
      })
    ).toThrow('validator-only Standard Schema');
  });

  it('mirrors normalized JSON Schema to native registerTool', () => {
    const native: ModelContextCore = {
      provideContext: vi.fn(),
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      clearContext: vi.fn(),
    };
    const server = createServer(native);

    server.registerTool({
      name: 'native_mirror_tool',
      description: 'Native mirror tool',
      inputSchema: createStandardJsonSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      }),
      outputSchema: createStandardJsonSchema(
        { type: 'object', properties: { message: { type: 'string' } } },
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { result: { type: 'string' } },
          required: ['result'],
        }
      ),
      execute: async () => ({ result: 'ok' }),
    });

    expect(native.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'native_mirror_tool',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
        outputSchema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          required: ['result'],
        },
      })
    );
  });
});
