import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it, vi } from 'vitest';
import { standardSchema, toInputSchema, validateInput } from './standard-schema.js';
import { invoke } from './invocation.js';

describe('Standard Schema adapter', () => {
  it('uses the supplied asynchronous validator and infers its transformed output', async () => {
    let validations = 0;
    const jsonSchema = () => ({ type: 'string' });
    const schema: StandardSchemaV1<string, number> & StandardJSONSchemaV1<string, number> = {
      '~standard': {
        version: 1,
        vendor: 'number-parser',
        jsonSchema: { input: jsonSchema, output: jsonSchema },
        async validate(input) {
          validations++;
          return typeof input === 'string' && /^\d+$/.test(input)
            ? { value: Number(input) }
            : { issues: [{ message: 'Expected digits' }] };
        },
      },
    };
    const adapter = standardSchema(schema);
    expect(adapter.inputSchema).toEqual({ type: 'string' });
    expect(validations).toBe(0);
    const config = {
      tool: { instanceId: 'schema', name: 'double' },
      input: adapter,
      execute: (input: number) => input * 2,
    };
    expect((await invoke(config, '4')).value).toBe(8);
    expect(validations).toBe(1);
    await expect(invoke(config, 'invalid')).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(validations).toBe(2);
  });
  it('supports converter-only vendors and falls back to draft-07', async () => {
    const input = vi.fn(({ target }: StandardJSONSchemaV1.Options) => {
      if (target !== 'draft-07') throw new Error('Unsupported target');
      return { type: 'object', properties: { value: { type: 'number' } } };
    });
    const schema = {
      '~standard': { version: 1, vendor: 'converter-only', jsonSchema: { input, output: input } },
    } satisfies StandardJSONSchemaV1;
    expect(toInputSchema(schema)).toEqual({
      type: 'object',
      properties: { value: { type: 'number' } },
    });
    expect(input.mock.calls.map(([options]) => options.target)).toEqual([
      'draft-2020-12',
      'draft-07',
    ]);
    const value = { value: 3 };
    await expect(validateInput(schema, value)).resolves.toBe(value);
  });

  it('requires JSON Schema metadata for validator-only vendors', () => {
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'validator-only',
        validate: (value: unknown) => ({ value }),
      },
    } satisfies StandardSchemaV1;
    expect(() => toInputSchema(schema)).toThrow('~standard.jsonSchema.input()');
  });

  it('does not attach a validator to metadata for a runtime to execute a second time', async () => {
    const validate = vi.fn((value: unknown) => ({ value }));
    const jsonSchema = () => ({ type: 'object' });
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'both',
        validate,
        jsonSchema: { input: jsonSchema, output: jsonSchema },
      },
    } satisfies StandardSchemaV1 & StandardJSONSchemaV1;
    const metadata = toInputSchema(schema);
    expect('~standard' in metadata).toBe(false);
    await validateInput(schema, {});
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('leaves raw JSON Schema validation to the caller or runtime', async () => {
    const schema = { type: 'object', properties: { value: { type: 'number' } } };
    expect(toInputSchema(schema)).toBe(schema);
    const input = { value: 'not validated by JSON metadata' };
    await expect(validateInput(schema, input)).resolves.toBe(input);
  });
});
