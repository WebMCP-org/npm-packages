import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodSchemaObjectToJsonSchema } from './zod-utils.js';

describe('zodSchemaObjectToJsonSchema', () => {
  it('should convert a simple Zod schema to JSON Schema', () => {
    const schema = {
      name: z.string(),
      age: z.number(),
    };

    const result = zodSchemaObjectToJsonSchema(schema);

    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
    expect(result.properties?.name).toBeDefined();
    expect(result.properties?.age).toBeDefined();
  });

  it('should mark required properties', () => {
    const schema = {
      required: z.string(),
      optional: z.string().optional(),
    };

    const result = zodSchemaObjectToJsonSchema(schema);

    expect(result.required).toContain('required');
    expect(result.required).not.toContain('optional');
  });

  it('should strip $schema property', () => {
    const schema = {
      name: z.string(),
    };

    const result = zodSchemaObjectToJsonSchema(schema);

    expect(result).not.toHaveProperty('$schema');
  });

  it('should handle empty schema', () => {
    const result = zodSchemaObjectToJsonSchema({});

    expect(result.type).toBe('object');
  });

  it('should handle complex types', () => {
    const schema = {
      tags: z.array(z.string()),
      nested: z.object({ key: z.string() }),
    };

    const result = zodSchemaObjectToJsonSchema(schema);

    expect(result.type).toBe('object');
    expect(result.properties?.tags).toBeDefined();
    expect(result.properties?.nested).toBeDefined();
  });

  it('should include descriptions from Zod describe()', () => {
    const schema = {
      name: z.string().describe('The user name'),
    };

    const result = zodSchemaObjectToJsonSchema(schema);

    expect(result.properties?.name?.description).toBe('The user name');
  });
});
