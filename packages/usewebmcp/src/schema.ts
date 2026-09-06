import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { InferValidatedToolInput, ToolInputSchema } from './types.js';

function isStandardSchema(schema: object): schema is StandardSchemaV1 {
  return (
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    'version' in schema['~standard'] &&
    schema['~standard'].version === 1 &&
    'validate' in schema['~standard'] &&
    typeof schema['~standard'].validate === 'function'
  );
}

function isStandardJSONSchema(schema: object): schema is StandardJSONSchemaV1 {
  return (
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    'version' in schema['~standard'] &&
    schema['~standard'].version === 1 &&
    'jsonSchema' in schema['~standard'] &&
    typeof schema['~standard'].jsonSchema === 'object' &&
    schema['~standard'].jsonSchema !== null &&
    'input' in schema['~standard'].jsonSchema &&
    typeof schema['~standard'].jsonSchema.input === 'function'
  );
}

export function toInputSchema(schema: ToolInputSchema): object {
  if (isStandardJSONSchema(schema)) {
    for (const target of ['draft-2020-12', 'draft-07'] as const) {
      try {
        const converted = schema['~standard'].jsonSchema.input({ target });
        if (converted && typeof converted === 'object' && !Array.isArray(converted)) {
          return converted;
        }
      } catch {
        // A vendor may only support an older JSON Schema target.
      }
    }
    throw new TypeError(
      'Failed to convert Standard JSON Schema inputSchema to a JSON Schema object'
    );
  }
  if ('~standard' in schema) {
    throw new TypeError(
      'Standard Schema inputSchema must provide ~standard.jsonSchema.input() for tool metadata'
    );
  }
  return schema;
}

export function validateInput<T extends ToolInputSchema>(
  schema: T | undefined,
  input: unknown
): Promise<InferValidatedToolInput<T>>;
export async function validateInput(schema: object | undefined, input: unknown): Promise<unknown> {
  if (!schema || !isStandardSchema(schema)) return input;
  const result = await schema['~standard'].validate(input);
  if (!result.issues && 'value' in result) return result.value;
  throw new TypeError(
    `Invalid tool input: ${(result.issues ?? []).map((issue) => issue.message).join('; ')}`
  );
}
