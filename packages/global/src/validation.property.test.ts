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
  isZodSchema,
  jsonSchemaToZod,
  normalizeSchema,
  validateWithZod,
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

  describe('isZodSchema - extended', () => {
    it('should detect Zod schemas (have _zod property)', () => {
      const schema = { name: z.string() };
      expect(isZodSchema(schema)).toBe(true);
    });

    it('should detect Zod 3 style schemas (have _def property)', () => {
      // Simulate a Zod 3 schema structure - now supported
      const fakeZod3Schema = {
        name: { _def: { typeName: 'ZodString' } },
      };
      expect(isZodSchema(fakeZod3Schema)).toBe(true);
    });

    it('should return false for JSON Schema', () => {
      const jsonSchema = { type: 'object', properties: { name: { type: 'string' } } };
      expect(isZodSchema(jsonSchema)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
      expect(isZodSchema('string')).toBe(false);
      expect(isZodSchema(123)).toBe(false);
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

    it('should accept Infinity values with default z.number() in Zod 3.25+', () => {
      // Zod 3.25+ accepts Infinity by default with z.number()
      const validator = z.number();
      expect(validateWithZod(Number.POSITIVE_INFINITY, validator).success).toBe(true);
      expect(validateWithZod(Number.NEGATIVE_INFINITY, validator).success).toBe(true);
    });

    it('should reject Infinity values with z.number().finite()', () => {
      // Use .finite() to reject Infinity in Zod 3.25+
      const validator = z.number().finite();
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

  describe('jsonSchemaToZod - complex types', () => {
    it('should handle nested objects', () => {
      const nestedSchema = {
        type: 'object' as const,
        properties: {
          user: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const },
              age: { type: 'number' as const },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };

      const zodValidator = jsonSchemaToZod(nestedSchema);

      // Valid nested object
      const validResult = validateWithZod({ user: { name: 'Alice', age: 30 } }, zodValidator);
      expect(validResult.success).toBe(true);

      // Missing required nested field
      const invalidResult = validateWithZod({ user: { age: 30 } }, zodValidator);
      expect(invalidResult.success).toBe(false);

      // Missing required top-level field
      const missingUserResult = validateWithZod({}, zodValidator);
      expect(missingUserResult.success).toBe(false);
    });

    it('should handle deeply nested objects', () => {
      const deepSchema = {
        type: 'object' as const,
        properties: {
          level1: {
            type: 'object' as const,
            properties: {
              level2: {
                type: 'object' as const,
                properties: {
                  level3: {
                    type: 'object' as const,
                    properties: {
                      value: { type: 'string' as const },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const zodValidator = jsonSchemaToZod(deepSchema);
      const validResult = validateWithZod(
        { level1: { level2: { level3: { value: 'deep' } } } },
        zodValidator
      );
      expect(validResult.success).toBe(true);
    });

    it('should handle arrays of primitives', () => {
      const arraySchema = {
        type: 'object' as const,
        properties: {
          tags: {
            type: 'array' as const,
            items: { type: 'string' as const },
          },
        },
      };

      const zodValidator = jsonSchemaToZod(arraySchema);

      // Valid array
      const validResult = validateWithZod({ tags: ['a', 'b', 'c'] }, zodValidator);
      expect(validResult.success).toBe(true);

      // Empty array should be valid
      const emptyResult = validateWithZod({ tags: [] }, zodValidator);
      expect(emptyResult.success).toBe(true);

      // Invalid array item type
      const invalidResult = validateWithZod({ tags: [1, 2, 3] }, zodValidator);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle arrays of objects', () => {
      const arrayOfObjectsSchema = {
        type: 'object' as const,
        properties: {
          users: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const },
                age: { type: 'number' as const },
              },
              required: ['name'],
            },
          },
        },
      };

      const zodValidator = jsonSchemaToZod(arrayOfObjectsSchema);

      // Valid array of objects
      const validResult = validateWithZod(
        { users: [{ name: 'Alice', age: 30 }, { name: 'Bob' }] },
        zodValidator
      );
      expect(validResult.success).toBe(true);

      // Invalid: missing required field in array item
      const invalidResult = validateWithZod({ users: [{ age: 30 }] }, zodValidator);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle enum values', () => {
      const enumSchema = {
        type: 'object' as const,
        properties: {
          status: {
            type: 'string' as const,
            enum: ['active', 'inactive', 'pending'],
          },
        },
        required: ['status'],
      };

      const zodValidator = jsonSchemaToZod(enumSchema);

      // Valid enum value
      const validResult = validateWithZod({ status: 'active' }, zodValidator);
      expect(validResult.success).toBe(true);

      // Invalid enum value
      const invalidResult = validateWithZod({ status: 'unknown' }, zodValidator);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle optional fields', () => {
      const optionalSchema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          nickname: { type: 'string' as const },
        },
        required: ['name'],
      };

      const zodValidator = jsonSchemaToZod(optionalSchema);

      // With optional field
      const withOptionalResult = validateWithZod({ name: 'Alice', nickname: 'Al' }, zodValidator);
      expect(withOptionalResult.success).toBe(true);

      // Without optional field
      const withoutOptionalResult = validateWithZod({ name: 'Alice' }, zodValidator);
      expect(withoutOptionalResult.success).toBe(true);

      // Missing required field
      const missingRequiredResult = validateWithZod({ nickname: 'Al' }, zodValidator);
      expect(missingRequiredResult.success).toBe(false);
    });

    it('should handle numeric constraints', () => {
      const constraintSchema = {
        type: 'object' as const,
        properties: {
          count: {
            type: 'integer' as const,
            minimum: 0,
            maximum: 100,
          },
        },
        required: ['count'],
      };

      const zodValidator = jsonSchemaToZod(constraintSchema);

      // Valid within range
      const validResult = validateWithZod({ count: 50 }, zodValidator);
      expect(validResult.success).toBe(true);

      // At boundaries
      const minResult = validateWithZod({ count: 0 }, zodValidator);
      expect(minResult.success).toBe(true);
      const maxResult = validateWithZod({ count: 100 }, zodValidator);
      expect(maxResult.success).toBe(true);
    });

    it('should handle empty properties schema', () => {
      // Empty properties is valid JSON Schema - should work correctly
      const emptyPropsSchema = {
        type: 'object' as const,
        properties: {},
      };

      // Should not throw
      const zodValidator = jsonSchemaToZod(emptyPropsSchema);
      expect(zodValidator).toBeDefined();

      // Empty object should be valid
      const emptyResult = validateWithZod({}, zodValidator);
      expect(emptyResult.success).toBe(true);
    });

    it('should not throw on conversion and return a validator', () => {
      // Even unusual schemas should return a validator (may use fallback)
      const unusualSchema = {
        type: 'object' as const,
      };

      // Should not throw
      expect(() => jsonSchemaToZod(unusualSchema)).not.toThrow();

      const zodValidator = jsonSchemaToZod(unusualSchema);
      expect(zodValidator).toBeDefined();
    });
  });
});
