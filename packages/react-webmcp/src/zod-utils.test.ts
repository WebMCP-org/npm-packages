import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isZodSchema, isZodType, zodToJsonSchema } from './zod-utils.js';

describe('zod-utils', () => {
  describe('isZodSchema', () => {
    it('accepts raw Zod shape objects only', () => {
      expect(isZodSchema({ username: z.string(), age: z.number().optional() })).toBe(true);
      expect(isZodSchema({ type: 'object', username: z.string() })).toBe(false);
      expect(isZodSchema(z.object({ username: z.string() }))).toBe(false);
      expect(isZodSchema({ type: 'object', properties: {} })).toBe(false);
      expect(isZodSchema(null)).toBe(false);
    });
  });

  describe('isZodType', () => {
    it('detects constructed Zod schemas', () => {
      expect(isZodType(z.string())).toBe(true);
      expect(isZodType(z.object({ username: z.string() }))).toBe(true);
      expect(isZodType({ username: z.string() })).toBe(false);
    });
  });

  describe('zodToJsonSchema', () => {
    it('delegates raw Zod shape conversion to the SDK compat helpers', () => {
      const result = zodToJsonSchema({
        username: z.string(),
        age: z.number().optional(),
      });

      expect(result).toMatchObject({
        type: 'object',
        properties: {
          username: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['username'],
      });
    });

    it('converts constructed Zod schemas', () => {
      const result = zodToJsonSchema(
        z.object({
          ok: z.boolean(),
        })
      );

      expect(result).toMatchObject({
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
        required: ['ok'],
      });
    });

    it('leaves unsupported unions as schemas without a root type', () => {
      const result = zodToJsonSchema(
        z.union([
          z.object({ kind: z.literal('page'), url: z.string() }),
          z.object({ kind: z.literal('section'), id: z.string() }),
        ])
      );

      expect(result.type).toBeUndefined();
      expect(result.anyOf).toHaveLength(2);
    });
  });
});
