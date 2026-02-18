/**
 * No-op ajv stub for browser environments.
 *
 * The MCP SDK's Server class statically imports AjvJsonSchemaValidator as a
 * default fallback. BrowserMcpServer always passes PolyfillJsonSchemaValidator,
 * so ajv is never actually used — but the static import still resolves. This
 * stub satisfies that import without pulling in the real ajv (CJS-only, breaks
 * in browsers).
 */

type ValidateFunction = ((data: unknown) => boolean) & { errors: unknown };

export class Ajv {
  constructor(_opts?: unknown) {}

  compile(_schema: unknown): ValidateFunction {
    const validate = ((_data: unknown) => true) as ValidateFunction;
    validate.errors = null;
    return validate;
  }

  getSchema(_id: string): undefined {
    return undefined;
  }

  errorsText(_errors?: unknown): string {
    return '';
  }
}

export default Ajv;
