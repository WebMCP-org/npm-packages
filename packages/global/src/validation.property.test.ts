/**
 * Property-based tests for validation utilities using fast-check.
 *
 * These tests verify that validation functions handle arbitrary inputs correctly,
 * improving robustness against edge cases and potential security issues.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  detectZodSchema,
  isZodSchema,
  jsonSchemaToZod,
  normalizeSchema,
  validateWithZod,
  Zod3SchemaError,
  zodToJsonSchema,
} from './validation.js';

// Reserved JavaScript property names that should not be used as field names
const RESERVED_NAMES = ['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString'];

// Arbitrary for valid field names (alphanumeric starting with letter/underscore, excluding reserved)
const validFieldName = fc
  .string()
  .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) && !RESERVED_NAMES.includes(s) && s.length > 0);

describe('Validation Property-Based Tests', () => {
  describe('isZodSchema', () => {
    it('should return false for non-objects', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (value) => {
            expect(isZodSchema(value)).toBe(false);
          }
        )
      );
    });

    it('should return false for objects with type property as string (JSON Schema)', () => {
      fc.assert(
        fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (obj) => {
          const withType = { ...obj, type: 'object' };
          expect(isZodSchema(withType)).toBe(false);
        })
      );
    });

    it('should return false for empty objects', () => {
      expect(isZodSchema({})).toBe(false);
    });
  });

  describe('detectZodSchema', () => {
    it('should detect Zod 4 schemas (have _zod property)', () => {
      const schema = { name: z.string() };
      const result = detectZodSchema(schema);

      expect(result.isZodSchema).toBe(true);
      expect(result.hasZod4).toBe(true);
      expect(result.hasZod3).toBe(false);
    });

    it('should detect Zod 3 schemas (have _def but not _zod)', () => {
      // Simulate a Zod 3 schema structure
      const fakeZod3Schema = {
        name: { _def: { typeName: 'ZodString' } },
      };
      const result = detectZodSchema(fakeZod3Schema);

      expect(result.isZodSchema).toBe(true);
      expect(result.hasZod4).toBe(false);
      expect(result.hasZod3).toBe(true);
    });

    it('should return false for JSON Schema', () => {
      const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };
      const result = detectZodSchema(jsonSchema);

      expect(result.isZodSchema).toBe(false);
      expect(result.hasZod4).toBe(false);
      expect(result.hasZod3).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(detectZodSchema(null).isZodSchema).toBe(false);
      expect(detectZodSchema(undefined).isZodSchema).toBe(false);
      expect(detectZodSchema('string').isZodSchema).toBe(false);
      expect(detectZodSchema(123).isZodSchema).toBe(false);
    });
  });

  describe('Zod3SchemaError', () => {
    it('should throw Zod3SchemaError when Zod 3 schema is passed to normalizeSchema', () => {
      // Simulate a Zod 3 schema structure
      const fakeZod3Schema = {
        name: { _def: { typeName: 'ZodString' } },
      };

      expect(() => normalizeSchema(fakeZod3Schema)).toThrow(Zod3SchemaError);
      expect(() => normalizeSchema(fakeZod3Schema)).toThrow(/Zod 3 schema detected/);
      expect(() => normalizeSchema(fakeZod3Schema)).toThrow(/import { z } from "zod\/v4"/);
    });

    it('should not throw for Zod 4 schemas', () => {
      const schema = { name: z.string() };
      expect(() => normalizeSchema(schema)).not.toThrow();
    });

    it('should not throw for JSON Schema', () => {
      const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };
      expect(() => normalizeSchema(jsonSchema)).not.toThrow();
    });
  });

  describe('zodToJsonSchema', () => {
    it('should produce valid JSON Schema for string fields', () => {
      fc.assert(
        fc.property(validFieldName, (fieldName) => {
          const schema = { [fieldName]: z.string() };
          const jsonSchema = zodToJsonSchema(schema);

          expect(jsonSchema.type).toBe('object');
          expect(jsonSchema.properties).toBeDefined();
          expect(jsonSchema.properties?.[fieldName]).toEqual({ type: 'string' });
        })
      );
    });

    it('should produce valid JSON Schema for number fields', () => {
      fc.assert(
        fc.property(validFieldName, (fieldName) => {
          const schema = { [fieldName]: z.number() };
          const jsonSchema = zodToJsonSchema(schema);

          expect(jsonSchema.type).toBe('object');
          expect(jsonSchema.properties?.[fieldName]).toEqual({ type: 'number' });
        })
      );
    });

    it('should produce valid JSON Schema for boolean fields', () => {
      fc.assert(
        fc.property(validFieldName, (fieldName) => {
          const schema = { [fieldName]: z.boolean() };
          const jsonSchema = zodToJsonSchema(schema);

          expect(jsonSchema.type).toBe('object');
          expect(jsonSchema.properties?.[fieldName]).toEqual({ type: 'boolean' });
        })
      );
    });

    it('should handle multiple fields', () => {
      fc.assert(
        fc.property(
          fc.array(validFieldName, {
            minLength: 1,
            maxLength: 5,
          }),
          (fieldNames) => {
            const uniqueNames = [...new Set(fieldNames)];
            if (uniqueNames.length === 0) return;

            const schema: Record<string, z.ZodTypeAny> = {};
            for (const name of uniqueNames) {
              schema[name] = z.string();
            }

            const jsonSchema = zodToJsonSchema(schema);
            expect(jsonSchema.type).toBe('object');
            expect(Object.keys(jsonSchema.properties || {})).toEqual(
              expect.arrayContaining(uniqueNames)
            );
          }
        )
      );
    });
  });

  describe('validateWithZod', () => {
    it('should accept valid strings', () => {
      fc.assert(
        fc.property(fc.string(), (value) => {
          const validator = z.string();
          const result = validateWithZod(value, validator);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toBe(value);
          }
        })
      );
    });

    it('should accept valid finite numbers', () => {
      fc.assert(
        fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (value) => {
          const validator = z.number();
          const result = validateWithZod(value, validator);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toBe(value);
          }
        })
      );
    });

    it('should reject Infinity values with default z.number()', () => {
      // This test documents that Zod rejects Infinity by default
      const validator = z.number();
      expect(validateWithZod(Number.POSITIVE_INFINITY, validator).success).toBe(false);
      expect(validateWithZod(Number.NEGATIVE_INFINITY, validator).success).toBe(false);
    });

    it('should accept valid integers', () => {
      fc.assert(
        fc.property(fc.integer(), (value) => {
          const validator = z.number().int();
          const result = validateWithZod(value, validator);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toBe(value);
          }
        })
      );
    });

    it('should reject strings when expecting numbers', () => {
      fc.assert(
        fc.property(fc.string(), (value) => {
          const validator = z.number();
          const result = validateWithZod(value, validator);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should accept valid objects matching schema', () => {
      fc.assert(
        fc.property(fc.string(), fc.integer(), (name, age) => {
          const validator = z.object({ name: z.string(), age: z.number() });
          const result = validateWithZod({ name, age }, validator);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).toEqual({ name, age });
          }
        })
      );
    });

    it('should reject objects missing required fields', () => {
      fc.assert(
        fc.property(fc.string(), (name) => {
          const validator = z.object({ name: z.string(), age: z.number() });
          const result = validateWithZod({ name }, validator);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('Validation failed');
          }
        })
      );
    });
  });

  describe('normalizeSchema', () => {
    it('should handle Zod schemas and produce consistent output', () => {
      fc.assert(
        fc.property(validFieldName, (fieldName) => {
          const zodSchema = { [fieldName]: z.string() };
          const result = normalizeSchema(zodSchema);

          expect(result.jsonSchema.type).toBe('object');
          expect(result.jsonSchema.properties?.[fieldName]).toBeDefined();
          expect(result.zodValidator).toBeDefined();
        })
      );
    });

    it('should handle JSON schemas and produce consistent output', () => {
      fc.assert(
        fc.property(validFieldName, (fieldName) => {
          const jsonSchema = {
            type: 'object' as const,
            properties: {
              [fieldName]: { type: 'string' as const },
            },
          };
          const result = normalizeSchema(jsonSchema);

          expect(result.jsonSchema).toEqual(jsonSchema);
          expect(result.zodValidator).toBeDefined();
        })
      );
    });
  });

  describe('JSON Schema round-trip', () => {
    it('should preserve schema semantics through Zod conversion', () => {
      fc.assert(
        fc.property(fc.string(), fc.integer(), (strValue, numValue) => {
          const originalSchema = { name: z.string(), count: z.number() };
          const jsonSchema = zodToJsonSchema(originalSchema);

          const zodValidator = jsonSchemaToZod(jsonSchema);

          const validResult = validateWithZod({ name: strValue, count: numValue }, zodValidator);
          expect(validResult.success).toBe(true);
        })
      );
    });
  });
});
