import { validateInput as validateSchemaInput } from '@mcp-b/webmcp-plugins/standard-schema';
import type { InferValidatedToolInput, ToolInputSchema } from './types.js';

export { toInputSchema } from '@mcp-b/webmcp-plugins/standard-schema';

export function validateInput<T extends ToolInputSchema>(
  schema: T | undefined,
  input: unknown
): Promise<InferValidatedToolInput<T>>;
export function validateInput(schema: object | undefined, input: unknown): Promise<unknown> {
  return validateSchemaInput(schema, input);
}
