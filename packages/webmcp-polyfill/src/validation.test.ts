import { describe, expect, it } from 'vitest';
import { compileJsonSchema, validateWithSchema } from './validation.js';

describe('JSON Schema Validation (core polyfill)', () => {
  it('validates required fields and primitive types', () => {
    const validator = compileJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'count'],
    });

    expect(validateWithSchema({ name: 'ok', count: 1 }, validator).success).toBe(true);
    expect(validateWithSchema({ name: 'ok' }, validator).success).toBe(false);
    expect(validateWithSchema({ name: 'ok', count: -1 }, validator).success).toBe(false);
  });

  it('requires own properties (not prototype-inherited values)', () => {
    const validator = compileJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    });

    const inheritedOnly = Object.create({ name: 'from-prototype' }) as Record<string, unknown>;
    const result = validateWithSchema(inheritedOnly, validator);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Missing required property');
    }
  });

  it('supports arrays and uniqueItems', () => {
    const validator = compileJsonSchema({
      type: 'array',
      items: { type: 'number' },
      uniqueItems: true,
    });

    expect(validateWithSchema([1, 2, 3], validator).success).toBe(true);
    expect(validateWithSchema([1, 2, 1], validator).success).toBe(false);
  });

  it('handles cyclic objects in uniqueItems without stack overflow', () => {
    const validator = compileJsonSchema({
      type: 'array',
      items: { type: 'object', properties: {} },
      uniqueItems: true,
    });

    const first: Record<string, unknown> = {};
    first.self = first;
    const second: Record<string, unknown> = {};
    second.self = second;

    expect(() => validateWithSchema([first, second], validator)).not.toThrow();
    const result = validateWithSchema([first, second], validator);
    expect(result.success).toBe(false);
  });

  it('fails fast for unsupported JSON Schema keywords in strict mode', () => {
    const unsupportedSchema = {
      type: 'object' as const,
      properties: {
        payload: {
          oneOf: [{ type: 'string' as const }, { type: 'number' as const }],
        },
      },
    };

    expect(() => compileJsonSchema(unsupportedSchema, { strict: true })).toThrow(
      /Unsupported JSON Schema keyword/i
    );
  });

  it('falls back to permissive validator in non-strict mode', () => {
    const unsupportedSchema = {
      type: 'object' as const,
      properties: {
        payload: {
          oneOf: [{ type: 'string' as const }, { type: 'number' as const }],
        },
      },
    };

    const validator = compileJsonSchema(unsupportedSchema, { strict: false });
    const result = validateWithSchema({ payload: { any: 'shape' } }, validator);

    expect(result.success).toBe(true);
  });

  it('reuses validator instances for equivalent schemas', () => {
    const schemaA = {
      type: 'object' as const,
      properties: {
        count: { type: 'integer' as const, minimum: 0 },
        label: { type: 'string' as const },
      },
      required: ['count'],
    };

    const schemaB = {
      properties: {
        label: { type: 'string' as const },
        count: { minimum: 0, type: 'integer' as const },
      },
      required: ['count'],
      type: 'object' as const,
    };

    const first = compileJsonSchema(schemaA);
    const second = compileJsonSchema(schemaB);

    expect(second).toBe(first);
  });
});
