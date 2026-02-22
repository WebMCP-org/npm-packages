/**
 * Throwing ajv stub for browser environments.
 *
 * The MCP SDK's Server class statically imports AjvJsonSchemaValidator as a
 * default fallback. BrowserMcpServer always passes PolyfillJsonSchemaValidator,
 * so ajv is never actually used — but the static import still resolves. This
 * stub satisfies that import without pulling in the real ajv (CJS-only, breaks
 * in browsers).
 *
 * If any code path unexpectedly reaches this stub, it throws immediately so the
 * issue is surfaced rather than silently passing all validation.
 */

export class Ajv {
  compile(_schema: unknown): never {
    throw new Error(
      '[WebMCP] Ajv stub was invoked. This indicates the MCP SDK is bypassing ' +
        'PolyfillJsonSchemaValidator. Please report this as a bug.'
    );
  }

  getSchema(_id: string): undefined {
    return undefined;
  }

  errorsText(_errors?: unknown): string {
    return '';
  }
}

export default Ajv;
