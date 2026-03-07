import { describe, expect, it } from 'vitest';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

import { zodSchemaToJsonSchemaCompat } from './zod-json-schema-compat.js';

describe('zodSchemaToJsonSchemaCompat', () => {
  it('converts Zod v3 schema into constrained JSON Schema', () => {
    const result = zodSchemaToJsonSchemaCompat(
      z3.object({
        name: z3.string().min(2),
        age: z3.number().int().min(18),
      })
    );

    expect(result.type).toBe('object');
    expect(result.properties?.name).toMatchObject({ type: 'string', minLength: 2 });
    expect(result.properties?.age).toMatchObject({ type: 'integer', minimum: 18 });
    expect(result.required).toEqual(['name', 'age']);
  });

  it('converts Zod v4 schema into constrained JSON Schema', () => {
    const result = zodSchemaToJsonSchemaCompat(
      z4.object({
        email: z4.string().email(),
        count: z4.number().int().min(1),
      })
    );

    expect(result.type).toBe('object');
    expect(result.properties?.email).toMatchObject({ type: 'string', format: 'email' });
    expect(result.properties?.count).toMatchObject({ type: 'integer', minimum: 1 });
    expect(result.required).toEqual(['email', 'count']);
  });

  it('omits required for optional/default-only object fields', () => {
    const result = zodSchemaToJsonSchemaCompat(
      z3.object({
        optionalField: z3.string().optional(),
        defaultField: z3.number().default(1),
      })
    );

    expect(result.required).toBeUndefined();
  });

  it('throws for non-zod inputs', () => {
    expect(() => zodSchemaToJsonSchemaCompat({} as never)).toThrow(
      'Expected a Zod schema instance (v3 or v4).'
    );
  });
});
