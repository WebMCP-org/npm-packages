import type { InputSchema } from '@mcp-b/webmcp-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { zodToJsonSchemaMock } = vi.hoisted(() => ({
  zodToJsonSchemaMock: vi.fn(),
}));

vi.mock('zod-to-json-schema', () => ({
  zodToJsonSchema: zodToJsonSchemaMock,
}));

import type { ZodSchemaObject } from './zod-utils.js';
import { isZodSchema, zodToJsonSchema } from './zod-utils.js';

describe('zod-utils', () => {
  beforeEach(() => {
    zodToJsonSchemaMock.mockReset();
  });

  describe('isZodSchema', () => {
    it('returns false for non-zod-like values and JSON Schema objects', () => {
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema([])).toBe(false);
      expect(isZodSchema({})).toBe(false);
      expect(isZodSchema({ type: 'object', properties: {} })).toBe(false);
      expect(isZodSchema({ username: { type: 'string' } })).toBe(false);
    });

    it('returns false for Standard Schema objects that expose zod-like internals', () => {
      expect(
        isZodSchema({
          '~standard': {
            version: 1,
            vendor: 'zod',
            types: { input: { username: 'string' } },
          },
          _def: { typeName: 'ZodObject' },
          innerType: { _def: { typeName: 'ZodString' } },
        })
      ).toBe(false);
    });

    it('returns true for zod-like schema records', () => {
      expect(
        isZodSchema({
          username: { _def: { typeName: 'ZodString' } },
          age: { _def: { typeName: 'ZodNumber' } },
        })
      ).toBe(true);
    });

    it('returns true for zod-like schema records with non-zod keys', () => {
      expect(
        isZodSchema({
          type: 'object',
          username: { _def: { typeName: 'ZodString' } },
        })
      ).toBe(true);
    });
  });

  describe('zodToJsonSchema', () => {
    it('converts zod-like fields, strips schema metadata, and infers required keys', () => {
      const schema = {
        type: 'object',
        requiredField: { _def: { typeName: 'ZodString' } },
        optionalField: { _def: { typeName: 'ZodOptional' } },
        defaultField: { _def: { typeName: 'ZodDefault' } },
        malformedDefField: { _def: 'not-an-object' },
      };

      zodToJsonSchemaMock.mockImplementation((value: unknown): InputSchema => {
        if (value === schema.requiredField) {
          return {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'string',
          };
        }

        if (value === schema.optionalField) {
          return {
            type: 'number',
            $schema: 'https://json-schema.org/draft/2020-12/schema',
          };
        }

        if (value === schema.defaultField) {
          return {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
              nested: {
                $schema: 'https://json-schema.org/draft/2020-12/schema',
                type: 'string',
              },
            },
          };
        }

        return {
          type: 'boolean',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
        };
      });

      const result = zodToJsonSchema(schema as unknown as ZodSchemaObject);

      expect(zodToJsonSchemaMock).toHaveBeenCalledTimes(4);
      expect(result).toEqual({
        type: 'object',
        properties: {
          requiredField: { type: 'string' },
          optionalField: { type: 'number' },
          defaultField: {
            type: 'object',
            properties: {
              nested: { type: 'string' },
            },
          },
          malformedDefField: { type: 'boolean' },
        },
        required: ['requiredField', 'malformedDefField'],
      });
    });

    it('omits required when every field is optional or defaulted', () => {
      const schema = {
        optionalField: { _def: { typeName: 'ZodOptional' } },
        defaultField: { _def: { typeName: 'ZodDefault' } },
      };

      zodToJsonSchemaMock.mockImplementation((value: unknown): InputSchema => {
        if (value === schema.optionalField) {
          return { type: 'string' };
        }
        return { type: 'number' };
      });

      const result = zodToJsonSchema(schema as unknown as ZodSchemaObject);

      expect(result).toEqual({
        type: 'object',
        properties: {
          optionalField: { type: 'string' },
          defaultField: { type: 'number' },
        },
      });
      expect(result.required).toBeUndefined();
    });
  });
});
