import { type Schema, Validator } from '@cfworker/json-schema';
import type {
  InputSchema,
  JsonObject,
  JsonSchemaForInference,
  ModelContext,
  ModelContextClient,
  ModelContextOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextToolReference,
  StandardJSONSchemaV1,
  ToolDescriptor,
  ToolInputSchema as WebMCPToolInputSchema,
  ToolOutputSchema as WebMCPToolOutputSchema,
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
export type StandardInputJsonSchema = StandardJSONSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
/** Re-export of `ToolInputSchema` from `@mcp-b/webmcp-types`. Accepted as `inputSchema` on tool registration. */
export type ToolInputSchema = WebMCPToolInputSchema;
/** Re-export of `ToolOutputSchema` from `@mcp-b/webmcp-types`. Accepted as `outputSchema` on tool registration. */
export type ToolOutputSchema = WebMCPToolOutputSchema;
export type { StandardJSONSchemaV1 } from '@mcp-b/webmcp-types';
export type { StandardSchemaV1 } from '@standard-schema/spec';

type SchemaKind = 'input' | 'output';

type StandardValidationResult = Awaited<
  ReturnType<StandardInputValidatorSchema['~standard']['validate']>
>;
type StandardValidationIssue = NonNullable<StandardValidationResult['issues']>[number];

interface StandardProps {
  readonly version: 1;
  readonly validate?: ((value: unknown) => unknown) | undefined;
  readonly jsonSchema?:
    | {
        readonly input?:
          | ((options: { readonly target: string }) => Record<string, unknown>)
          | undefined;
        readonly output?:
          | ((options: { readonly target: string }) => Record<string, unknown>)
          | undefined;
      }
    | undefined;
}

/**
 * The result of normalizing a tool's input schema at registration time.
 * Contains the resolved JSON Schema and a Standard Schema validator derived from it.
 */
export interface NormalizedRuntimeInputSchema {
  inputSchema: InputSchema;
  standardValidator: StandardInputValidatorSchema;
}

/**
 * Options that control error messages produced during schema normalization.
 * `source` labels the caller (e.g. `'[BrowserMcpServer]'`); `descriptor` names the
 * specific field being normalized (e.g. `'tool "foo" inputSchema'`).
 */
export interface RegistrationNormalizationOptions {
  descriptor?: string;
  source?: string;
}

/**
 * A fully normalized tool descriptor stored in `WebMCPToolRegistry`.
 * Extends `ToolDescriptor` with resolved `inputSchema`/`outputSchema` (plain JSON Schema)
 * and a `standardValidator` used for runtime argument validation.
 */
export interface RegisteredToolDescriptor extends ToolDescriptor<
  Record<string, unknown>,
  unknown,
  string
> {
  inputSchema: InputSchema;
  outputSchema?: JsonSchemaForInference;
  standardValidator: StandardInputValidatorSchema;
}

function getSourceLabel(source = '[WebMCPPolyfill]'): string {
  return source;
}

function getDescriptor(kind: SchemaKind, descriptor: string | undefined): string {
  return descriptor ?? (kind === 'input' ? 'inputSchema' : 'outputSchema');
}

function toRegistrationError(
  kind: SchemaKind,
  options: RegistrationNormalizationOptions,
  message: string
): Error {
  return new Error(
    `${getSourceLabel(options.source)} ${message.replace('{descriptor}', getDescriptor(kind, options.descriptor))}`
  );
}

function warnStandardJsonSchemaFailure(
  kind: SchemaKind,
  options: RegistrationNormalizationOptions,
  target: string,
  error: unknown
): void {
  console.warn(
    `${getSourceLabel(options.source)} Standard JSON Schema conversion failed for ${getDescriptor(kind, options.descriptor)} with target "${target}":`,
    error
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStandardProps(value: unknown): StandardProps | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const standard = value['~standard'];
  if (!isPlainObject(standard) || standard.version !== 1) {
    return null;
  }

  return standard as unknown as StandardProps;
}

function isStandardInputJsonSchema(value: unknown): value is StandardInputJsonSchema {
  const standard = getStandardProps(value);
  if (!standard || !isPlainObject(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema.input === 'function';
}

function hasStandardJsonSchema(
  standard: StandardProps,
  kind: SchemaKind
): standard is StandardProps & {
  readonly jsonSchema: {
    readonly input: (options: { readonly target: string }) => Record<string, unknown>;
    readonly output: (options: { readonly target: string }) => Record<string, unknown>;
  };
} {
  if (!isPlainObject(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema[kind] === 'function';
}

function stripSchemaMeta(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripSchemaMeta(entry));
  }

  if (!isPlainObject(schema)) {
    return schema;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema') {
      continue;
    }
    next[key] = stripSchemaMeta(value);
  }
  return next;
}

function convertStandardJsonSchema(
  schema: unknown,
  kind: SchemaKind,
  options: RegistrationNormalizationOptions
): InputSchema | JsonSchemaForInference {
  const standard = getStandardProps(schema);
  if (!standard || !hasStandardJsonSchema(standard, kind)) {
    throw toRegistrationError(
      kind,
      options,
      '{descriptor} must provide Standard JSON Schema export for ' + kind
    );
  }

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = stripSchemaMeta(standard.jsonSchema[kind]({ target }));
      if (kind === 'input') {
        validateInputSchema(converted);
      }
      return converted as InputSchema | JsonSchemaForInference;
    } catch (error) {
      warnStandardJsonSchemaFailure(kind, options, target, error);
    }
  }

  throw toRegistrationError(kind, options, 'Failed to convert {descriptor} to JSON Schema');
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

function normalizeInputSchemaForRegistration(
  inputSchema: ToolInputSchema | undefined,
  options: RegistrationNormalizationOptions = {}
): InputSchema | undefined {
  if (inputSchema === undefined) {
    return undefined;
  }

  if (isStandardInputJsonSchema(inputSchema)) {
    return convertStandardJsonSchema(inputSchema, 'input', options) as InputSchema;
  }

  const standard = getStandardProps(inputSchema);
  if (standard && typeof standard.validate === 'function') {
    throw toRegistrationError(
      'input',
      options,
      '{descriptor} cannot use validator-only Standard Schema. Use plain JSON Schema or Standard JSON Schema on MCP registration surfaces.'
    );
  }

  if (standard) {
    throw toRegistrationError(
      'input',
      options,
      '{descriptor} must expose Standard JSON Schema for input'
    );
  }

  validateInputSchema(inputSchema);

  if (Object.keys(inputSchema as Record<string, unknown>).length === 0) {
    return DEFAULT_INPUT_SCHEMA;
  }

  return inputSchema.type === undefined
    ? ({ type: 'object', ...inputSchema } as InputSchema)
    : inputSchema;
}

function normalizeRuntimeInputSchema(
  inputSchema: ToolInputSchema | undefined,
  options: RegistrationNormalizationOptions = {}
): NormalizedRuntimeInputSchema {
  const registrationSchema =
    normalizeInputSchemaForRegistration(inputSchema, options) ?? DEFAULT_INPUT_SCHEMA;

  return {
    inputSchema: registrationSchema,
    standardValidator: createStandardValidatorFromJsonSchema(registrationSchema),
  };
}

function normalizeOutputSchemaForRegistration(
  outputSchema: ToolOutputSchema | undefined,
  options: RegistrationNormalizationOptions = {}
): JsonSchemaForInference | undefined {
  if (outputSchema === undefined) {
    return undefined;
  }

  const standard = getStandardProps(outputSchema);
  if (standard && hasStandardJsonSchema(standard, 'output')) {
    return convertStandardJsonSchema(outputSchema, 'output', options) as JsonSchemaForInference;
  }

  if (standard && typeof standard.validate === 'function') {
    throw toRegistrationError(
      'output',
      options,
      '{descriptor} cannot use validator-only Standard Schema. Use plain JSON Schema or Standard JSON Schema on MCP registration surfaces.'
    );
  }

  if (standard) {
    throw toRegistrationError(
      'output',
      options,
      '{descriptor} must expose Standard JSON Schema for output'
    );
  }

  return stripSchemaMeta(outputSchema) as JsonSchemaForInference;
}

function normalizeAnnotations(
  annotations: ToolDescriptor['annotations']
): ToolDescriptor['annotations'] | undefined {
  if (!annotations) {
    return undefined;
  }

  return {
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
  };
}

function resolveToolNameForUnregister(nameOrTool: string | ModelContextToolReference): string {
  if (typeof nameOrTool === 'string') {
    return nameOrTool;
  }

  if (isPlainObject(nameOrTool) && typeof nameOrTool.name === 'string') {
    return nameOrTool.name;
  }

  throw new TypeError(
    "Failed to execute 'unregisterTool' on 'ModelContext': parameter 1 must be a string or an object with a string name."
  );
}

/**
 * Shared tool registry used by both the polyfill and `BrowserMcpServer`.
 *
 * Handles schema normalization (plain JSON Schema, Standard JSON Schema, Standard Schema)
 * and maintains the authoritative map of registered tools. Extracted so higher-level
 * wrappers can delegate tool bookkeeping without duplicating normalization logic.
 */
export class WebMCPToolRegistry {
  private tools = new Map<string, RegisteredToolDescriptor>();
  private readonly source: string;

  constructor(source = '[WebMCPPolyfill]') {
    this.source = source;
  }

  /**
   * Replaces the entire tool set with the tools listed in `options.tools`.
   * Any previously registered tools not present in the new list are removed.
   */
  provideContext(options: ModelContextOptions = {}): void {
    const nextTools = new Map<string, RegisteredToolDescriptor>();

    for (const tool of options.tools ?? []) {
      const normalized = this.normalizeToolDescriptor(tool, nextTools);
      nextTools.set(normalized.name, normalized);
    }

    this.tools = nextTools;
  }

  /**
   * Removes all registered tools.
   * @returns `true` if any tools were present before clearing, `false` otherwise.
   */
  clearTools(): boolean {
    const hadTools = this.tools.size > 0;
    this.tools.clear();
    return hadTools;
  }

  /**
   * Normalizes and registers a single tool.
   * Throws if the tool name is already registered or if its schemas are invalid.
   */
  registerTool(tool: ToolDescriptor): RegisteredToolDescriptor {
    const normalized = this.normalizeToolDescriptor(tool, this.tools);
    this.tools.set(normalized.name, normalized);
    return normalized;
  }

  /**
   * Removes a tool by name or tool reference.
   * @returns `true` if the tool was found and removed, `false` if it was not registered.
   */
  unregisterTool(nameOrTool: string | ModelContextToolReference): boolean {
    return this.tools.delete(resolveToolNameForUnregister(nameOrTool));
  }

  /** Returns the normalized descriptor for the named tool, or `undefined` if not registered. */
  getTool(name: string): RegisteredToolDescriptor | undefined {
    return this.tools.get(name);
  }

  /** Returns a snapshot of all registered tools serialized as `ModelContextTestingToolInfo[]`. */
  listToolInfos(): ModelContextTestingToolInfo[] {
    return [...this.tools.values()].map((tool) => {
      let inputSchema: string;
      try {
        inputSchema = JSON.stringify(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA);
      } catch {
        inputSchema = JSON.stringify(DEFAULT_INPUT_SCHEMA);
      }

      return {
        name: tool.name,
        description: tool.description,
        inputSchema,
      };
    });
  }

  /**
   * Normalizes a prompt's `argsSchema` for registration (same pipeline as tool `inputSchema`,
   * but errors are attributed to the named prompt rather than a tool).
   */
  normalizePromptArgsSchema(
    promptName: string,
    argsSchema: ToolInputSchema | undefined
  ): InputSchema | undefined {
    return normalizeInputSchemaForRegistration(argsSchema, {
      source: this.source,
      descriptor: `prompt "${promptName}" argsSchema`,
    });
  }

  private normalizeToolDescriptor(
    tool: ToolDescriptor,
    existing: Map<string, RegisteredToolDescriptor>
  ): RegisteredToolDescriptor {
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

    const normalizedInputSchema = normalizeRuntimeInputSchema(tool.inputSchema, {
      source: this.source,
      descriptor: `tool "${tool.name}" inputSchema`,
    });
    const normalizedOutputSchema = normalizeOutputSchemaForRegistration(tool.outputSchema, {
      source: this.source,
      descriptor: `tool "${tool.name}" outputSchema`,
    });
    const normalizedAnnotations = normalizeAnnotations(tool.annotations);
    const {
      annotations: _rawAnnotations,
      inputSchema: _rawInputSchema,
      outputSchema: _rawOutputSchema,
      ...toolRest
    } = tool;

    return {
      ...toolRest,
      ...(normalizedAnnotations ? { annotations: normalizedAnnotations } : {}),
      inputSchema: normalizedInputSchema.inputSchema,
      ...(normalizedOutputSchema !== undefined ? { outputSchema: normalizedOutputSchema } : {}),
      standardValidator: normalizedInputSchema.standardValidator,
    };
  }
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

  const error = result.errors[result.errors.length - 1];
  if (!error) {
    return { message: 'Input validation failed' };
  }

  return { message: error.error };
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

function isCallToolResult(value: unknown): value is ToolResponse {
  return isPlainObject(value) && Array.isArray(value.content);
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

/**
 * Coerces an arbitrary tool return value into a `ToolResponse`.
 * If the value is already a `ToolResponse` (has a `content` array) it is returned as-is.
 * Otherwise the value is serialized to text and wrapped in a single `text` content block.
 */
export function normalizeToolResponse(value: unknown): ToolResponse {
  if (isCallToolResult(value)) {
    return value;
  }

  const structuredContent = toStructuredContent(value);

  return {
    content: [{ type: 'text', text: serializeTextContent(value) }],
    ...(structuredContent ? { structuredContent } : {}),
    isError: false,
  };
}

interface PolyfillModelContext extends ModelContext {
  [POLYFILL_MARKER_PROPERTY]: true;
}

interface PolyfillToolDescriptor extends ToolDescriptor<Record<string, unknown>, unknown, string> {
  inputSchema: InputSchema;
  [STANDARD_VALIDATOR_SYMBOL]: StandardInputValidatorSchema;
}

interface InstallState {
  installed: boolean;
  previousModelContextDescriptor: PropertyDescriptor | undefined;
  previousModelContextTestingDescriptor: PropertyDescriptor | undefined;
}

const installState: InstallState = {
  installed: false,
  previousModelContextDescriptor: undefined,
  previousModelContextTestingDescriptor: undefined,
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

class StrictWebMCPContext {
  private toolRegistry = new WebMCPToolRegistry('[WebMCPPolyfill]');
  private testingShim: PolyfillTestingShim | null = null;
  private provideContextDeprecationWarned = false;
  private clearContextDeprecationWarned = false;

  provideContext(options: ModelContextOptions = {}): void {
    this.warnProvideContextDeprecationOnce();
    this.toolRegistry.provideContext(options);
    this.notifyToolsChanged();
  }

  clearContext(): void {
    this.warnClearContextDeprecationOnce();
    if (this.toolRegistry.clearTools()) {
      this.notifyToolsChanged();
      return;
    }
    this.notifyToolsChanged();
  }

  registerTool(tool: ToolDescriptor): void {
    this.toolRegistry.registerTool(tool);
    this.notifyToolsChanged();
  }

  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    const removed = this.toolRegistry.unregisterTool(nameOrTool);
    if (removed) {
      this.notifyToolsChanged();
    }
  }

  getTestingShim(): PolyfillTestingShim {
    if (!this.testingShim) {
      this.testingShim = new PolyfillTestingShim(this);
    }
    return this.testingShim;
  }

  /** @internal Used by PolyfillTestingShim */
  getToolInfos(): ModelContextTestingToolInfo[] {
    return this.toolRegistry.listToolInfos();
  }

  /** @internal Used by PolyfillTestingShim */
  async executeToolForTesting(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    if (options?.signal?.aborted) {
      throw createUnknownError(TOOL_CANCELLED_MESSAGE);
    }

    const tool = this.getRegisteredTool(toolName);
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
    queueMicrotask(() => {
      this.testingShim?.dispatchToolChange();
    });
  }

  private getRegisteredTool(name: string): PolyfillToolDescriptor | undefined {
    const tool = this.toolRegistry.getTool(name);
    if (!tool) {
      return undefined;
    }

    return {
      ...tool,
      [STANDARD_VALIDATOR_SYMBOL]: tool.standardValidator,
    };
  }

  private warnProvideContextDeprecationOnce(): void {
    if (this.provideContextDeprecationWarned) {
      return;
    }

    this.provideContextDeprecationWarned = true;
    console.warn(
      '[WebMCPPolyfill] navigator.modelContext.provideContext() is deprecated and will be removed in the next major version. Register tools individually with registerTool() instead.'
    );
  }

  private warnClearContextDeprecationOnce(): void {
    if (this.clearContextDeprecationWarned) {
      return;
    }

    this.clearContextDeprecationWarned = true;
    console.warn(
      '[WebMCPPolyfill] navigator.modelContext.clearContext() is deprecated and will be removed in the next major version. Unregister individual tools instead.'
    );
  }
}

/**
 * EventTarget-based testing shim matching the native Chromium ModelContextTesting surface.
 *
 * Fires `toolchange` events and supports the `ontoolchange` handler property,
 * matching the native Chromium 148 API. The deprecated `registerToolsChangedCallback`
 * is kept as a compat layer that wraps `addEventListener`.
 */
class PolyfillTestingShim extends EventTarget implements ModelContextTesting {
  private context: StrictWebMCPContext;
  private _ontoolchange: ((this: ModelContextTesting, ev: Event) => unknown) | null = null;

  constructor(context: StrictWebMCPContext) {
    super();
    this.context = context;
  }

  listTools(): ModelContextTestingToolInfo[] {
    return this.context.getToolInfos();
  }

  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    return this.context.executeToolForTesting(toolName, inputArgsJson, options);
  }

  getCrossDocumentScriptToolResult(): Promise<string> {
    return Promise.resolve('[]');
  }

  get ontoolchange(): ((this: ModelContextTesting, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContextTesting, ev: Event) => unknown) | null) {
    this._ontoolchange = handler;
  }

  /**
   * @deprecated Use `addEventListener('toolchange', callback)` instead.
   * Kept for backward compatibility with older polyfill consumers.
   */
  registerToolsChangedCallback(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new TypeError(
        "Failed to execute 'registerToolsChangedCallback' on 'ModelContextTesting': parameter 1 is not of type 'Function'."
      );
    }
    this.addEventListener('toolchange', callback);
  }

  /** @internal Called by StrictWebMCPContext when tools change. */
  dispatchToolChange(): void {
    const event = new Event('toolchange');
    try {
      this._ontoolchange?.call(this, event);
    } catch (error) {
      console.warn('[WebMCPPolyfill] ontoolchange handler threw:', error);
    }
    this.dispatchEvent(event);
    // Deprecated compat: fire old event name so existing listeners keep working
    this.dispatchEvent(new Event('toolschanged'));
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

  const context = new StrictWebMCPContext();
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

  installState.installed = false;
  installState.previousModelContextDescriptor = undefined;
  installState.previousModelContextTestingDescriptor = undefined;
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
