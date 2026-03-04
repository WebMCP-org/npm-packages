import { type Schema, Validator } from '@cfworker/json-schema';
import type {
  InputSchema,
  JsonObject,
  ModelContext,
  ModelContextClient,
  ModelContextOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ToolDescriptor,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import type { StandardSchemaV1 } from '@standard-schema/spec';

const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const TOOL_CANCELLED_MESSAGE = 'Tool was cancelled';
const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;
const STANDARD_VALIDATOR_SYMBOL = Symbol('standardValidator');

export type StandardInputValidatorSchema = StandardSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
    readonly jsonSchema: {
      readonly input: (options: {
        readonly target: 'draft-2020-12' | 'draft-07' | 'openapi-3.0' | ({} & string);
        readonly libraryOptions?: Record<string, unknown> | undefined;
      }) => Record<string, unknown>;
      readonly output: (options: {
        readonly target: 'draft-2020-12' | 'draft-07' | 'openapi-3.0' | ({} & string);
        readonly libraryOptions?: Record<string, unknown> | undefined;
      }) => Record<string, unknown>;
    };
  };
}
export type StandardInputJsonSchema = StandardJSONSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export type ToolInputSchema = InputSchema | StandardInputValidatorSchema | StandardInputJsonSchema;
export type ToolOutputSchema = InputSchema | StandardInputJsonSchema;

type StandardValidationResult = Awaited<
  ReturnType<StandardInputValidatorSchema['~standard']['validate']>
>;
type StandardValidationIssue = NonNullable<StandardValidationResult['issues']>[number];

interface PolyfillModelContext extends ModelContext {
  [POLYFILL_MARKER_PROPERTY]: true;
}

interface PolyfillToolDescriptor extends ToolDescriptor<Record<string, unknown>, unknown, string> {
  inputSchema: InputSchema;
  [STANDARD_VALIDATOR_SYMBOL]: StandardInputValidatorSchema;
}

interface NormalizedInputSchema {
  inputSchema: InputSchema;
  standardValidator: StandardInputValidatorSchema;
}

interface InstallState {
  installed: boolean;
  previousModelContextDescriptor: PropertyDescriptor | undefined;
  previousModelContextTestingDescriptor: PropertyDescriptor | undefined;
  cleanupDeclarativeSync: (() => void) | null;
}

const installState: InstallState = {
  installed: false,
  previousModelContextDescriptor: undefined,
  previousModelContextTestingDescriptor: undefined,
  cleanupDeclarativeSync: null,
};

export interface WebMCPPolyfillInitOptions {
  /**
   * Controls whether the polyfill auto-initializes when loaded.
   * Set to false to prevent auto-initialization; then call initializeWebMCPPolyfill() manually.
   * @default true
   */
  autoInitialize?: boolean;

  /**
   * Controls installation of navigator.modelContextTesting when this polyfill provides modelContext.
   * - true or 'if-missing' (default): install only when modelContextTesting is missing.
   * - 'always': install even when modelContextTesting already exists.
   * - false: do not install.
   * @default 'if-missing'
   */
  installTestingShim?: boolean | 'always' | 'if-missing';

  /**
   * Deprecated no-op kept for backward compatibility with previous wrappers.
   */
  disableIframeTransportByDefault?: boolean;
}

interface DeclarativeToolDefinition {
  name: string;
  description: string;
  inputSchema?: InputSchema;
  response?: ToolResponse;
}

interface DeclarativeToolResult {
  tool: DeclarativeToolDefinition;
  source: 'script' | 'element';
  id: string;
}

function normalizeDeclarativeToolEntry(
  entry: Record<string, unknown>
): DeclarativeToolDefinition | null {
  const name = entry.name;
  const description = entry.description;
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  if (typeof description !== 'string' || description.length === 0) {
    return null;
  }

  const output: DeclarativeToolDefinition = { name, description };

  if (isPlainObject(entry.inputSchema)) {
    output.inputSchema = entry.inputSchema as InputSchema;
  }

  if (isPlainObject(entry.response)) {
    output.response = entry.response as ToolResponse;
  }

  return output;
}

function parseDeclarativeToolsFromDom(doc: Document): DeclarativeToolResult[] {
  const results: DeclarativeToolResult[] = [];

  const scriptNodes = doc.querySelectorAll('script[type="application/webmcp+json"]');
  scriptNodes.forEach((node, index) => {
    const text = node.textContent?.trim();
    if (!text) {
      return;
    }

    try {
      const parsed = JSON.parse(text) as { tools?: unknown };
      const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      tools.forEach((entry, entryIndex) => {
        if (!isPlainObject(entry)) {
          return;
        }
        const normalized = normalizeDeclarativeToolEntry(entry);
        if (!normalized) {
          return;
        }
        results.push({
          tool: normalized,
          source: 'script',
          id: `script:${index}:${entryIndex}`,
        });
      });
    } catch {
      // Skip invalid declarative scripts.
    }
  });

  const elementNodes = doc.querySelectorAll<HTMLElement>('[data-webmcp-tool]');
  elementNodes.forEach((node, index) => {
    const name = node.dataset.webmcpTool;
    const description = node.dataset.webmcpDescription ?? '';
    if (!name || !description) {
      return;
    }

    let inputSchema: InputSchema | undefined;
    if (node.dataset.webmcpInputSchema) {
      try {
        const parsedSchema = JSON.parse(node.dataset.webmcpInputSchema);
        if (isPlainObject(parsedSchema)) {
          inputSchema = parsedSchema as InputSchema;
        }
      } catch {
        // Ignore invalid schema declarations.
      }
    }

    let response: ToolResponse | undefined;
    if (node.dataset.webmcpResponse) {
      try {
        const parsedResponse = JSON.parse(node.dataset.webmcpResponse);
        if (isPlainObject(parsedResponse)) {
          response = parsedResponse as ToolResponse;
        }
      } catch {
        // Ignore invalid response payloads.
      }
    }

    results.push({
      source: 'element',
      id: `element:${index}`,
      tool: {
        name,
        description,
        ...(inputSchema ? { inputSchema } : {}),
        ...(response ? { response } : {}),
      },
    });
  });

  return results;
}

function startDeclarativeToolSync(context: StrictWebMCPContext): {
  stop: () => void;
  getSerializedResult: () => string;
} {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return { stop: () => {}, getSerializedResult: () => '[]' };
  }

  const registeredNames = new Set<string>();
  let lastSerializedResult = '[]';

  const sync = () => {
    const parsedTools = parseDeclarativeToolsFromDom(document);
    const nextNames = new Set(parsedTools.map((entry) => entry.tool.name));

    for (const currentName of [...registeredNames]) {
      if (!nextNames.has(currentName)) {
        context.unregisterTool(currentName);
        registeredNames.delete(currentName);
      }
    }

    for (const parsedTool of parsedTools) {
      if (registeredNames.has(parsedTool.tool.name)) {
        continue;
      }

      try {
        context.registerTool({
          name: parsedTool.tool.name,
          description: parsedTool.tool.description,
          inputSchema: parsedTool.tool.inputSchema ?? DEFAULT_INPUT_SCHEMA,
          execute: async () =>
            parsedTool.tool.response ?? {
              content: [{ type: 'text', text: `Declarative tool ${parsedTool.tool.name}` }],
            },
        });
        registeredNames.add(parsedTool.tool.name);
      } catch {
        // Ignore duplicate or invalid declarative entries.
      }
    }

    lastSerializedResult = JSON.stringify(
      parsedTools.map((entry) => ({
        id: entry.id,
        source: entry.source,
        name: entry.tool.name,
        description: entry.tool.description,
      }))
    );
  };

  sync();

  const observer = new MutationObserver(() => {
    sync();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  return {
    stop: () => {
      observer.disconnect();
      for (const name of [...registeredNames]) {
        context.unregisterTool(name);
      }
      registeredNames.clear();
    },
    getSerializedResult: () => lastSerializedResult,
  };
}

class StrictWebMCPContext {
  private tools = new Map<string, PolyfillToolDescriptor>();
  private toolsChangedCallback: (() => void) | null = null;
  private readonly getCrossDocumentScriptToolResultValue: () => string;

  constructor(getCrossDocumentScriptToolResultValue: () => string = () => '[]') {
    this.getCrossDocumentScriptToolResultValue = getCrossDocumentScriptToolResultValue;
  }

  provideContext(options: ModelContextOptions = {}): void {
    const nextTools = new Map<string, PolyfillToolDescriptor>();

    for (const tool of options.tools ?? []) {
      const normalized = normalizeToolDescriptor(tool, nextTools);
      nextTools.set(normalized.name, normalized);
    }

    this.tools = nextTools;
    this.notifyToolsChanged();
  }

  clearContext(): void {
    this.tools.clear();
    this.notifyToolsChanged();
  }

  registerTool(tool: ToolDescriptor): void {
    const normalized = normalizeToolDescriptor(tool, this.tools);
    this.tools.set(normalized.name, normalized);
    this.notifyToolsChanged();
  }

  unregisterTool(name: string): void {
    const removed = this.tools.delete(name);
    if (removed) {
      this.notifyToolsChanged();
    }
  }

  getTestingShim(): ModelContextTesting {
    return {
      listTools: () => {
        return [...this.tools.values()].map((tool) => {
          const output: ModelContextTestingToolInfo = {
            name: tool.name,
            description: tool.description,
          };

          try {
            output.inputSchema = JSON.stringify(tool.inputSchema);
          } catch {
            // Keep inputSchema omitted when serialization fails.
          }

          return output;
        });
      },
      executeTool: (
        toolName: string,
        inputArgsJson: string,
        options?: ModelContextTestingExecuteToolOptions
      ) => this.executeToolForTesting(toolName, inputArgsJson, options),
      registerToolsChangedCallback: (callback: () => void) => {
        if (typeof callback !== 'function') {
          throw new TypeError(
            "Failed to execute 'registerToolsChangedCallback' on 'ModelContextTesting': parameter 1 is not of type 'Function'."
          );
        }
        this.toolsChangedCallback = callback;
      },
      getCrossDocumentScriptToolResult: async () => this.getCrossDocumentScriptToolResultValue(),
    };
  }

  private async executeToolForTesting(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    if (options?.signal?.aborted) {
      throw createUnknownError(TOOL_CANCELLED_MESSAGE);
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw createUnknownError(`Tool not found: ${toolName}`);
    }

    const args = parseInputArgsJson(inputArgsJson);
    const validationError = await validateArgsForTool(args, tool);
    if (validationError) {
      throw createUnknownError(validationError);
    }

    let contextActive = true;
    const client: ModelContextClient = {
      requestUserInteraction: async (callback: () => Promise<unknown>): Promise<unknown> => {
        if (!contextActive) {
          throw new Error(
            `ModelContextClient for tool "${toolName}" is no longer active after execute() resolved`
          );
        }

        if (typeof callback !== 'function') {
          throw new TypeError('requestUserInteraction(callback) requires a function callback');
        }

        return callback();
      },
    };

    try {
      const execution = tool.execute(args, client);
      const rawResult = await withAbortSignal(Promise.resolve(execution), options?.signal);
      return toSerializedTestingResult(normalizeToolResponse(rawResult));
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${TOOL_INVOCATION_FAILED_MESSAGE}: ${error.message}`
          : TOOL_INVOCATION_FAILED_MESSAGE;
      throw createUnknownError(detail);
    } finally {
      contextActive = false;
    }
  }

  private notifyToolsChanged(): void {
    if (!this.toolsChangedCallback) {
      return;
    }

    queueMicrotask(() => {
      try {
        this.toolsChangedCallback?.();
      } catch (error) {
        // Callback errors are ignored to match browser event callback behavior.
        console.warn('[WebMCPPolyfill] toolsChanged callback threw:', error);
      }
    });
  }
}

function createUnknownError(message: string): Error {
  try {
    return new DOMException(message, 'UnknownError');
  } catch {
    const error = new Error(message);
    error.name = 'UnknownError';
    return error;
  }
}

function parseInputArgsJson(inputArgsJson: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(inputArgsJson);
  } catch {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  return parsed as Record<string, unknown>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStandardProps(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const standard = value['~standard'];
  if (!isPlainObject(standard)) {
    return null;
  }

  return standard;
}

function isStandardInputValidatorSchema(value: unknown): value is StandardInputValidatorSchema {
  const standard = getStandardProps(value);
  return Boolean(standard && standard.version === 1 && typeof standard.validate === 'function');
}

function isStandardInputJsonSchema(value: unknown): value is StandardInputJsonSchema {
  const standard = getStandardProps(value);
  if (!standard || standard.version !== 1 || !isPlainObject(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema.input === 'function';
}

function createStandardValidatorFromJsonSchema(schema: InputSchema): StandardInputValidatorSchema {
  return {
    '~standard': {
      version: 1,
      vendor: '@mcp-b/webmcp-polyfill-json-schema',
      validate(value: unknown): StandardValidationResult {
        if (!isPlainObject(value)) {
          return {
            issues: [{ message: 'expected object arguments' }],
          };
        }

        const issue = validateArgsWithSchema(value, schema);
        if (issue) {
          return {
            issues: [issue],
          };
        }

        return {
          value,
        };
      },
    },
  };
}

function convertStandardInputSchema(schema: StandardInputJsonSchema): InputSchema {
  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      validateInputSchema(converted);
      return converted;
    } catch (error) {
      console.warn(
        `[WebMCPPolyfill] Standard JSON Schema conversion failed for target "${target}":`,
        error
      );
    }
  }

  throw new Error('Failed to convert Standard JSON Schema inputSchema to a JSON Schema object');
}

function normalizeInputSchema(inputSchema: ToolInputSchema | undefined): NormalizedInputSchema {
  if (inputSchema === undefined) {
    const normalized = DEFAULT_INPUT_SCHEMA;
    return {
      inputSchema: normalized,
      standardValidator: createStandardValidatorFromJsonSchema(normalized),
    };
  }

  if (isStandardInputJsonSchema(inputSchema)) {
    // Prefer JSON conversion for parity across JSON and Standard Schema inputs.
    const converted = convertStandardInputSchema(inputSchema);
    return {
      inputSchema: converted,
      standardValidator: createStandardValidatorFromJsonSchema(converted),
    };
  }

  if (isStandardInputValidatorSchema(inputSchema)) {
    return {
      inputSchema: DEFAULT_INPUT_SCHEMA,
      standardValidator: inputSchema,
    };
  }

  validateInputSchema(inputSchema);

  // Empty {} is valid JSON Schema but lacks type:"object" required by MCP.
  if (Object.keys(inputSchema as Record<string, unknown>).length === 0) {
    return {
      inputSchema: DEFAULT_INPUT_SCHEMA,
      standardValidator: createStandardValidatorFromJsonSchema(DEFAULT_INPUT_SCHEMA),
    };
  }

  const normalizedSchema =
    inputSchema.type === undefined
      ? ({ type: 'object', ...inputSchema } as InputSchema)
      : inputSchema;
  return {
    inputSchema: normalizedSchema,
    standardValidator: createStandardValidatorFromJsonSchema(normalizedSchema),
  };
}

function validateInputSchema(schema: unknown): asserts schema is InputSchema {
  if (!isPlainObject(schema)) {
    throw new Error('inputSchema must be a JSON Schema object');
  }

  validateJsonSchemaNode(schema, '$');
}

function validateJsonSchemaNode(node: Record<string, unknown>, path: string): void {
  const typeValue = node.type;
  if (
    typeValue !== undefined &&
    typeof typeValue !== 'string' &&
    !(
      Array.isArray(typeValue) &&
      typeValue.every((entry) => typeof entry === 'string' && entry.length > 0)
    )
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "type" must be a string or string[]`);
  }

  const requiredValue = node.required;
  if (
    requiredValue !== undefined &&
    !(Array.isArray(requiredValue) && requiredValue.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "required" must be an array of strings`);
  }

  const propertiesValue = node.properties;
  if (propertiesValue !== undefined) {
    if (!isPlainObject(propertiesValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "properties" must be an object`);
    }

    for (const [key, value] of Object.entries(propertiesValue)) {
      if (!isPlainObject(value)) {
        throw new Error(`Invalid JSON Schema at ${path}.properties.${key}: expected object schema`);
      }
      validateJsonSchemaNode(value, `${path}.properties.${key}`);
    }
  }

  const itemsValue = node.items;
  if (itemsValue !== undefined) {
    if (Array.isArray(itemsValue)) {
      for (const [index, value] of itemsValue.entries()) {
        if (!isPlainObject(value)) {
          throw new Error(`Invalid JSON Schema at ${path}.items[${index}]: expected object schema`);
        }
        validateJsonSchemaNode(value, `${path}.items[${index}]`);
      }
    } else if (isPlainObject(itemsValue)) {
      validateJsonSchemaNode(itemsValue, `${path}.items`);
    } else {
      throw new Error(`Invalid JSON Schema at ${path}: "items" must be an object or object[]`);
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const value = node[keyword];
    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      throw new Error(`Invalid JSON Schema at ${path}: "${keyword}" must be an array`);
    }

    for (const [index, entry] of value.entries()) {
      if (!isPlainObject(entry)) {
        throw new Error(
          `Invalid JSON Schema at ${path}.${keyword}[${index}]: expected object schema`
        );
      }
      validateJsonSchemaNode(entry, `${path}.${keyword}[${index}]`);
    }
  }

  const notValue = node.not;
  if (notValue !== undefined) {
    if (!isPlainObject(notValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "not" must be an object schema`);
    }
    validateJsonSchemaNode(notValue, `${path}.not`);
  }

  try {
    JSON.stringify(node);
  } catch {
    throw new Error(`Invalid JSON Schema at ${path}: schema must be JSON-serializable`);
  }
}

function normalizeToolDescriptor(
  tool: ToolDescriptor,
  existing: Map<string, PolyfillToolDescriptor>
): PolyfillToolDescriptor {
  if (!tool || typeof tool !== 'object') {
    throw new TypeError('registerTool(tool) requires a tool object');
  }

  if (typeof tool.name !== 'string' || tool.name.length === 0) {
    throw new TypeError('Tool "name" must be a non-empty string');
  }

  if (typeof tool.description !== 'string' || tool.description.length === 0) {
    throw new TypeError('Tool "description" must be a non-empty string');
  }

  if (typeof tool.execute !== 'function') {
    throw new TypeError('Tool "execute" must be a function');
  }

  if (existing.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }

  const normalizedInputSchema = normalizeInputSchema(tool.inputSchema);

  const annotations = tool.annotations;
  const normalizedAnnotations = annotations
    ? {
        ...annotations,
        ...(annotations.readOnlyHint === 'true'
          ? { readOnlyHint: true }
          : annotations.readOnlyHint === 'false'
            ? { readOnlyHint: false }
            : {}),
        ...(annotations.destructiveHint === 'true'
          ? { destructiveHint: true }
          : annotations.destructiveHint === 'false'
            ? { destructiveHint: false }
            : {}),
        ...(annotations.idempotentHint === 'true'
          ? { idempotentHint: true }
          : annotations.idempotentHint === 'false'
            ? { idempotentHint: false }
            : {}),
        ...(annotations.openWorldHint === 'true'
          ? { openWorldHint: true }
          : annotations.openWorldHint === 'false'
            ? { openWorldHint: false }
            : {}),
      }
    : undefined;

  return {
    ...tool,
    ...(normalizedAnnotations ? { annotations: normalizedAnnotations } : {}),
    inputSchema: normalizedInputSchema.inputSchema,
    [STANDARD_VALIDATOR_SYMBOL]: normalizedInputSchema.standardValidator,
  };
}

export function validateArgsWithSchema(
  args: Record<string, unknown>,
  schema: InputSchema
): StandardValidationIssue | null {
  const validator = new Validator(schema as Schema, '2020-12', true);
  const result = validator.validate(args);

  if (result.valid) {
    return null;
  }

  // Use the deepest (last) error for the most specific message.
  const error = result.errors[result.errors.length - 1];
  if (!error) {
    return { message: 'Input validation failed' };
  }

  return { message: error.error };
}

function formatStandardIssuePath(path: StandardValidationIssue['path']) {
  if (!path || path.length === 0) {
    return null;
  }

  const segments = path
    .map((segment) => {
      if (isPlainObject(segment) && 'key' in segment) {
        return segment.key;
      }
      return segment;
    })
    .map((segment) => String(segment))
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  return segments.join('.');
}

async function validateArgsWithStandardSchema(
  args: Record<string, unknown>,
  schema: StandardInputValidatorSchema
): Promise<string | null> {
  let result: StandardValidationResult;

  try {
    result = await Promise.resolve(schema['~standard'].validate(args));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    console.error('[WebMCPPolyfill] Standard Schema validation threw unexpectedly:', error);
    return `Input validation error: schema validation failed${detail}`;
  }

  if (!result.issues || result.issues.length === 0) {
    return null;
  }

  const firstIssue = result.issues[0];
  if (!firstIssue) {
    return 'Input validation error';
  }

  const path = formatStandardIssuePath(firstIssue?.path);
  if (path) {
    return `Input validation error: ${firstIssue.message} at ${path}`;
  }

  return `Input validation error: ${firstIssue.message}`;
}

async function validateArgsForTool(
  args: Record<string, unknown>,
  tool: PolyfillToolDescriptor
): Promise<string | null> {
  return validateArgsWithStandardSchema(args, tool[STANDARD_VALIDATOR_SYMBOL]);
}

function isCallToolResult(value: unknown): value is ToolResponse {
  return isPlainObject(value) && Array.isArray(value.content);
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) {
    return Number.isFinite(value as number) || typeof value !== 'number';
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function toStructuredContent(value: unknown): JsonObject | undefined {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    return undefined;
  }

  return value as JsonObject;
}

function serializeTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    const candidate = JSON.stringify(value);
    return candidate ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeToolResponse(value: unknown): ToolResponse {
  if (isCallToolResult(value)) {
    return value;
  }

  const structuredContent = toStructuredContent(value);

  return {
    content: [
      {
        type: 'text',
        text: serializeTextContent(value),
      },
    ],
    ...(structuredContent ? { structuredContent } : {}),
    isError: false,
  };
}

function getFirstTextBlock(result: ToolResponse): string | null {
  for (const block of result.content ?? []) {
    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      return block.text;
    }
  }

  return null;
}

function toSerializedTestingResult(result: ToolResponse): string | null {
  if (result.isError) {
    const firstText = getFirstTextBlock(result);
    const message = firstText?.replace(/^Error:\s*/i, '').trim() || TOOL_INVOCATION_FAILED_MESSAGE;
    throw createUnknownError(message);
  }

  const metadata = (result as ToolResponse & { metadata?: { willNavigate?: boolean } }).metadata;
  if (metadata && typeof metadata === 'object' && metadata.willNavigate) {
    return null;
  }

  try {
    return JSON.stringify(result);
  } catch {
    throw createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
  }
}

function withAbortSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    return Promise.reject(createUnknownError(TOOL_CANCELLED_MESSAGE));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createUnknownError(TOOL_CANCELLED_MESSAGE));
    };

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function getNavigator(): Navigator | null {
  if (typeof navigator !== 'undefined') {
    return navigator;
  }

  return null;
}

function defineNavigatorProperty<K extends keyof Navigator>(
  target: Navigator,
  key: K,
  value: Navigator[K]
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });
}

export function initializeWebMCPPolyfill(options?: WebMCPPolyfillInitOptions): void {
  const nav = getNavigator();
  if (!nav) {
    return;
  }

  const hasModelContext = Boolean(nav.modelContext);

  if (hasModelContext) {
    return;
  }

  if (installState.installed) {
    cleanupWebMCPPolyfill();
  }

  let crossDocumentResultGetter = () => '[]';
  const context = new StrictWebMCPContext(() => crossDocumentResultGetter());
  const modelContext = context as unknown as PolyfillModelContext;
  modelContext[POLYFILL_MARKER_PROPERTY] = true;

  installState.previousModelContextDescriptor = Object.getOwnPropertyDescriptor(
    nav,
    'modelContext'
  );
  installState.previousModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
    nav,
    'modelContextTesting'
  );

  defineNavigatorProperty(nav, 'modelContext', modelContext as Navigator['modelContext']);

  const installTestingShim = options?.installTestingShim ?? 'if-missing';
  const hasModelContextTesting = Boolean(nav.modelContextTesting);
  const shouldInstallTestingShim =
    installTestingShim === 'always' ||
    ((installTestingShim === true || installTestingShim === 'if-missing') &&
      !hasModelContextTesting);

  if (shouldInstallTestingShim) {
    defineNavigatorProperty(
      nav,
      'modelContextTesting',
      context.getTestingShim() as Navigator['modelContextTesting']
    );
  }

  const declarativeSync = startDeclarativeToolSync(context);
  crossDocumentResultGetter = declarativeSync.getSerializedResult;
  installState.cleanupDeclarativeSync = declarativeSync.stop;

  installState.installed = true;
}

export function cleanupWebMCPPolyfill(): void {
  const nav = getNavigator();
  if (!nav || !installState.installed) {
    return;
  }

  const restore = <K extends keyof Navigator>(
    key: K,
    previousDescriptor: PropertyDescriptor | undefined
  ) => {
    if (previousDescriptor) {
      Object.defineProperty(nav, key, previousDescriptor);
      return;
    }

    delete (nav as unknown as Record<string, unknown>)[key as string];
  };

  restore('modelContext', installState.previousModelContextDescriptor);
  restore('modelContextTesting', installState.previousModelContextTestingDescriptor);

  installState.cleanupDeclarativeSync?.();

  installState.installed = false;
  installState.previousModelContextDescriptor = undefined;
  installState.previousModelContextTestingDescriptor = undefined;
  installState.cleanupDeclarativeSync = null;
}

export { initializeWebMCPPolyfill as initializeWebModelContextPolyfill };

declare global {
  interface Window {
    __webMCPPolyfillOptions?: WebMCPPolyfillInitOptions;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const options = window.__webMCPPolyfillOptions;
  const shouldAutoInitialize = options?.autoInitialize !== false;

  if (shouldAutoInitialize) {
    try {
      initializeWebMCPPolyfill(options);
    } catch (error) {
      console.error('[WebMCPPolyfill] Auto-initialization failed:', error);
    }
  }
}
