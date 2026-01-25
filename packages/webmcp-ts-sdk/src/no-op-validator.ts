/**
 * No-op JSON Schema validator for browser environments.
 *
 * This validator bypasses the MCP SDK's internal ajv-based validation which causes
 * "Error compiling schema" errors in browser extensions due to ajv's use of
 * eval/Function constructor.
 *
 * Validation is handled externally by Zod in @mcp-b/global, making the SDK's
 * internal validation redundant. This no-op validator allows the SDK to function
 * without the ajv dependency issues.
 */

/**
 * Interface for JSON Schema validators.
 * This matches the MCP SDK's jsonSchemaValidator interface.
 */
interface JsonSchemaValidator {
  getValidator<T>(schema: unknown): (input: unknown) => JsonSchemaValidatorResult<T>;
}

/**
 * Result type for JSON Schema validation
 */
type JsonSchemaValidatorResult<T> =
  | { valid: true; data: T; errorMessage: undefined }
  | { valid: false; data: undefined; errorMessage: string };

/**
 * A no-op JSON Schema validator that always returns valid.
 *
 * Use this in browser environments where:
 * - ajv causes "Error compiling schema" errors
 * - Validation is already handled elsewhere (e.g., by Zod)
 * - You need to avoid eval/Function constructor restrictions
 *
 * @example
 * ```typescript
 * import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
 * import { NoOpJsonSchemaValidator } from '@mcp-b/webmcp-ts-sdk/no-op-validator';
 *
 * const server = new BrowserMcpServer(
 *   { name: 'my-server', version: '1.0.0' },
 *   { jsonSchemaValidator: new NoOpJsonSchemaValidator() }
 * );
 * ```
 */
export class NoOpJsonSchemaValidator implements JsonSchemaValidator {
  /**
   * Returns a validator function that always passes.
   * The input data is passed through unchanged.
   *
   * @param _schema - The JSON Schema (ignored)
   * @returns A validator function that always returns valid
   */
  getValidator<T>(_schema: unknown): (input: unknown) => JsonSchemaValidatorResult<T> {
    return (input: unknown): JsonSchemaValidatorResult<T> => ({
      valid: true,
      data: input as T,
      errorMessage: undefined,
    });
  }
}
