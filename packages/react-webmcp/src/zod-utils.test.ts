import { describe, expect, it } from 'vitest';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

import { isZodSchema, zodToJsonSchema } from './zod-utils.js';

describe('zod-utils', () => {
  describe('isZodSchema', () => {
    it('returns false for non-zod values and JSON Schema objects', () => {
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema([])).toBe(false);
      expect(isZodSchema({})).toBe(false);
      expect(isZodSchema({ type: 'object', properties: {} })).toBe(false);
      expect(isZodSchema({ username: { type: 'string' } })).toBe(false);
    });

    it('returns true for zod v3 and v4 schema records', () => {
      expect(isZodSchema({ username: z3.string() })).toBe(true);
      expect(isZodSchema({ username: z4.string() })).toBe(true);
    });
  });

  describe('zodToJsonSchema', () => {
    it('converts zod v3 raw schema shape with required and optional keys', () => {
      const result = zodToJsonSchema({
        requiredField: z3.string().min(2),
        optionalField: z3.number().optional(),
        defaultField: z3.boolean().default(false),
      });

      expect(result.type).toBe('object');
      expect(result.properties?.requiredField).toMatchObject({ type: 'string', minLength: 2 });
      expect(result.properties?.optionalField).toMatchObject({ type: 'number' });
      expect(result.properties?.defaultField).toMatchObject({ type: 'boolean' });
      expect(result.required).toEqual(['requiredField']);
    });

    it('converts zod v4 raw schema shape into constrained JSON schema', () => {
      const result = zodToJsonSchema({
        username: z4.string().min(3),
        age: z4.number().int().min(18),
      });

      expect(result.type).toBe('object');
      expect(result.properties?.username).toMatchObject({ type: 'string', minLength: 3 });
      expect(result.properties?.age).toMatchObject({ type: 'integer', minimum: 18 });
      expect(result.required).toEqual(['username', 'age']);
    });

    it('omits required when all fields are optional/defaulted', () => {
      const result = zodToJsonSchema({
        optionalField: z3.string().optional(),
        defaultField: z3.number().default(1),
      });

      expect(result.required).toBeUndefined();
    });

    it('throws deterministic error for mixed zod v3/v4 schema shapes', () => {
      expect(() =>
        zodToJsonSchema({
          oldSchema: z3.string(),
          newSchema: z4.number(),
        })
      ).toThrow(
        'Mixed Zod versions detected in schema shape. Use either all Zod v3 schemas or all Zod v4 schemas.'
      );
    });
  });
});
