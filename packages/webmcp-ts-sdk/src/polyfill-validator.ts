import { isPlainObject, validateArgsWithSchema } from '@mcp-b/webmcp-polyfill';
import type { InputSchema } from '@mcp-b/webmcp-types';

interface JsonSchemaValidator {
  getValidator<T>(schema: unknown): (input: unknown) => JsonSchemaValidatorResult<T>;
}

type JsonSchemaValidatorResult<T> =
  | { valid: true; data: T; errorMessage: undefined }
  | { valid: false; data: undefined; errorMessage: string };

export class PolyfillJsonSchemaValidator implements JsonSchemaValidator {
  getValidator<T>(schema: unknown): (input: unknown) => JsonSchemaValidatorResult<T> {
    return (input: unknown): JsonSchemaValidatorResult<T> => {
      if (!isPlainObject(input)) {
        return { valid: false, data: undefined, errorMessage: 'expected object arguments' };
      }

      const issue = validateArgsWithSchema(input, schema as InputSchema);
      if (issue) {
        return { valid: false, data: undefined, errorMessage: issue.message };
      }

      return { valid: true, data: input as T, errorMessage: undefined };
    };
  }
}
