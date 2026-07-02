import type {
  InputSchema,
  ModelContext,
  ModelContextClient,
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextToolInfo,
  ModelContextToolReference,
  ToolDescriptor,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import {
  isPlainObject,
  normalizeInputSchema,
  toJsonValue,
  validateValueWithSchema,
} from './schema.js';
import type { StandardInputValidatorSchema } from './schema.js';
export {
  isPlainObject,
  normalizeInputSchema,
  toJsonValue,
  validateValueWithSchema,
} from './schema.js';
export type {
  StandardInputJsonSchema,
  StandardInputValidatorSchema,
  StandardJSONSchemaV1,
  ToolInputSchema,
  ToolOutputSchema,
} from './schema.js';

const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const TOOL_CANCELLED_MESSAGE = 'Tool was cancelled';
/** WebMCP §4.2 tool name: ASCII alnum, underscore, hyphen, period; 1–128 code points. */
const VALID_TOOL_NAME_RE = /^[A-Za-z0-9_\-.]{1,128}$/u;

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;
const STANDARD_VALIDATOR_SYMBOL = Symbol('standardValidator');

function createAbortError(): Error {
  return new DOMException('signal is aborted without reason', 'AbortError');
}

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

interface InstallState {
  installed: boolean;
  previousNavigatorModelContextDescriptor: PropertyDescriptor | undefined;
  previousNavigatorModelContextTestingDescriptor: PropertyDescriptor | undefined;
  previousDocumentModelContextDescriptor: PropertyDescriptor | undefined;
  installedNavigatorModelContext: boolean;
  installedNavigatorModelContextTesting: boolean;
  installedDocumentModelContext: boolean;
}

const installState: InstallState = {
  installed: false,
  previousNavigatorModelContextDescriptor: undefined,
  previousNavigatorModelContextTestingDescriptor: undefined,
  previousDocumentModelContextDescriptor: undefined,
  installedNavigatorModelContext: false,
  installedNavigatorModelContextTesting: false,
  installedDocumentModelContext: false,
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

class StrictWebMCPContext extends EventTarget {
  private tools = new Map<string, PolyfillToolDescriptor>();
  private testingShim: PolyfillTestingShim | null = null;
  private _ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null;
  private unregisterToolDeprecationWarned = false;
  private toolsChangedQueued = false;

  get ontoolchange(): ((this: ModelContext, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContext, ev: Event) => unknown) | null) {
    this._ontoolchange = handler;
  }

  registerTool(tool: ToolDescriptor, options?: ModelContextRegisterToolOptions): Promise<void> {
    const signal = options?.signal;

    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    const normalized = normalizeToolDescriptor(tool, this.tools);
    this.tools.set(normalized.name, normalized);
    this.notifyToolsChanged();

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          if (this.tools.delete(normalized.name)) {
            this.notifyToolsChanged();
          }
        },
        { once: true }
      );
    }

    return Promise.resolve();
  }

  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    this.warnUnregisterToolDeprecationOnce();

    const name = getToolNameForUnregister(nameOrTool);
    const removed = this.tools.delete(name);
    if (removed) {
      this.notifyToolsChanged();
    }
  }

  getTools(): Promise<ModelContextToolInfo[]> {
    return Promise.resolve(this.getRegisteredToolInfos());
  }

  executeTool(
    tool: ModelContextToolInfo,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    return this.executeToolByName(tool.name, inputArgsJson, options, false);
  }

  getTestingShim(): PolyfillTestingShim {
    if (!this.testingShim) {
      this.testingShim = new PolyfillTestingShim(this);
    }
    return this.testingShim;
  }

  /** @internal Used by PolyfillTestingShim */
  getToolInfos(): ModelContextTestingToolInfo[] {
    return [...this.tools.values()].map((tool) => {
      let inputSchema: string;
      try {
        inputSchema = JSON.stringify(tool.inputSchema ?? { type: 'object' });
      } catch {
        inputSchema = '{"type":"object"}';
      }
      return { name: tool.name, description: tool.description, inputSchema };
    });
  }

  /** @internal Used by getTools() */
  getRegisteredToolInfos(): ModelContextToolInfo[] {
    return this.getToolInfos().map((toolInfo) => {
      const tool = this.tools.get(toolInfo.name);
      return {
        ...toolInfo,
        title: tool?.title ?? '',
        origin: globalThis.location?.origin ?? '',
        window: globalThis.window,
      };
    });
  }

  /** @internal Used by PolyfillTestingShim */
  async executeToolForTesting(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    return this.executeToolByName(toolName, inputArgsJson, options, true);
  }

  private async executeToolByName(
    toolName: string,
    inputArgsJson: string,
    options: ModelContextTestingExecuteToolOptions | undefined,
    normalizeResult: boolean
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
      const normalizedResult = normalizeToolResponse(rawResult);
      const outputValidationError = validateOutputForTool(normalizedResult, tool);
      if (outputValidationError) {
        throw new Error(outputValidationError);
      }
      if (normalizeResult) {
        return toSerializedTestingResult(normalizedResult);
      }
      const serialized = JSON.stringify(rawResult);
      return serialized === undefined ? null : serialized;
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
    if (this.toolsChangedQueued) {
      return;
    }
    this.toolsChangedQueued = true;

    queueMicrotask(() => {
      this.toolsChangedQueued = false;
      const event = new Event('toolchange');
      try {
        this._ontoolchange?.call(this as unknown as ModelContext, event);
      } catch (error) {
        console.warn('[WebMCPPolyfill] navigator.modelContext.ontoolchange handler threw:', error);
      }
      this.dispatchEvent(event);
      this.testingShim?.dispatchToolChange();
    });
  }

  private warnUnregisterToolDeprecationOnce(): void {
    if (this.unregisterToolDeprecationWarned) {
      return;
    }

    this.unregisterToolDeprecationWarned = true;
    console.warn(
      '[WebMCPPolyfill] navigator.modelContext.unregisterTool() is deprecated. The April 23, 2026 WebMCP draft removed it in favor of registerTool(tool, { signal }) — pass an AbortSignal and abort it to unregister.'
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

function createInvalidStateError(message: string): DOMException | Error {
  try {
    return new DOMException(message, 'InvalidStateError');
  } catch {
    const error = new Error(message);
    error.name = 'InvalidStateError';
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

function getToolNameForUnregister(nameOrTool: string | ModelContextToolReference): string {
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

function normalizeToolDescriptor(
  tool: ToolDescriptor,
  existing: Map<string, PolyfillToolDescriptor>
): PolyfillToolDescriptor {
  if (!tool || typeof tool !== 'object') {
    throw new TypeError('registerTool(tool) requires a tool object');
  }

  if (typeof tool.name !== 'string' || tool.name.length === 0) {
    throw createInvalidStateError('Tool "name" must be a non-empty string');
  }

  if (!VALID_TOOL_NAME_RE.test(tool.name) || Array.from(tool.name).length > 128) {
    throw createInvalidStateError(
      'Tool "name" must be 1–128 characters and contain only ASCII alphanumeric, underscore, hyphen, or period'
    );
  }

  if (typeof tool.description !== 'string' || tool.description.length === 0) {
    throw createInvalidStateError('Tool "description" must be a non-empty string');
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

function validateOutputForTool(result: ToolResponse, tool: PolyfillToolDescriptor): string | null {
  if (!tool.outputSchema || result.isError) {
    return null;
  }

  if (result.structuredContent === undefined) {
    return `Output validation error: Tool ${tool.name} has an output schema but no structured content was provided`;
  }

  const issue = validateValueWithSchema(result.structuredContent, tool.outputSchema);
  return issue ? `Output validation error: ${issue.message}` : null;
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

function normalizeToolResponse(value: unknown): ToolResponse {
  if (isCallToolResult(value)) {
    return value;
  }

  const structuredContent = toJsonValue(value);

  return {
    content: [
      {
        type: 'text',
        text: serializeTextContent(value),
      },
    ],
    ...(structuredContent !== undefined ? { structuredContent } : {}),
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

function getDocument(): Document | null {
  if (typeof document !== 'undefined') {
    return document;
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

function defineDocumentModelContextProperty(target: Document, value: ModelContext): void {
  Object.defineProperty(target, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });
}

let navigatorModelContextDeprecationWarned = false;

// Per webmachinelearning/webmcp#173 / PR #184, the modelContext getter moved
// from Navigator to Document. We install on document.modelContext as the
// primary surface and expose navigator.modelContext as a deprecated alias that
// returns the same instance and logs a one-time console warning on first
// access. This mirrors the deprecation behavior shipped in Chrome 150.
function defineDeprecatedNavigatorModelContext(target: Navigator, value: ModelContext): void {
  Object.defineProperty(target, 'modelContext', {
    configurable: true,
    enumerable: true,
    get() {
      if (!navigatorModelContextDeprecationWarned) {
        navigatorModelContextDeprecationWarned = true;
        console.warn(
          '[WebMCPPolyfill] navigator.modelContext is deprecated. The May 27, 2026 WebMCP draft moved the modelContext getter from Navigator to Document — use document.modelContext instead. See https://github.com/webmachinelearning/webmcp/pull/184.'
        );
      }
      return value;
    },
  });
}

export function initializeWebMCPPolyfill(options?: WebMCPPolyfillInitOptions): void {
  const nav = getNavigator();
  const doc = getDocument();
  if (!nav && !doc) {
    return;
  }

  const documentModelContext = doc?.modelContext;
  const hasDocumentModelContext = Boolean(documentModelContext);

  if (hasDocumentModelContext) {
    return;
  }

  const navigatorModelContext = nav?.modelContext;
  const hasNavigatorModelContext = Boolean(navigatorModelContext);

  if (installState.installed) {
    cleanupWebMCPPolyfill();
  }

  if (doc && navigatorModelContext) {
    installState.previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
      doc,
      'modelContext'
    );
    defineDocumentModelContextProperty(doc, navigatorModelContext);
    installState.installedDocumentModelContext = true;
    installState.installed = true;
    return;
  }

  if (hasNavigatorModelContext) {
    return;
  }

  const context = new StrictWebMCPContext();
  const modelContext = context as unknown as PolyfillModelContext;
  modelContext[POLYFILL_MARKER_PROPERTY] = true;

  if (doc) {
    installState.previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
      doc,
      'modelContext'
    );
    defineDocumentModelContextProperty(doc, modelContext as ModelContext);
    installState.installedDocumentModelContext = true;
  }

  if (nav) {
    installState.previousNavigatorModelContextDescriptor = Object.getOwnPropertyDescriptor(
      nav,
      'modelContext'
    );
    installState.previousNavigatorModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
      nav,
      'modelContextTesting'
    );

    // Reset the one-shot warning flag so a fresh install warns again on first access.
    navigatorModelContextDeprecationWarned = false;
    defineDeprecatedNavigatorModelContext(nav, modelContext as ModelContext);
    installState.installedNavigatorModelContext = true;

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
      installState.installedNavigatorModelContextTesting = true;
    }
  }

  installState.installed = true;
}

export function cleanupWebMCPPolyfill(): void {
  if (!installState.installed) {
    return;
  }

  const restore = (
    target: Navigator | Document,
    key: string,
    previousDescriptor: PropertyDescriptor | undefined
  ) => {
    if (previousDescriptor) {
      Object.defineProperty(target, key, previousDescriptor);
      return;
    }

    delete (target as unknown as Record<string, unknown>)[key];
  };

  const nav = getNavigator();
  const doc = getDocument();

  if (doc && installState.installedDocumentModelContext) {
    restore(doc, 'modelContext', installState.previousDocumentModelContextDescriptor);
  }
  if (nav && installState.installedNavigatorModelContext) {
    restore(nav, 'modelContext', installState.previousNavigatorModelContextDescriptor);
  }
  if (nav && installState.installedNavigatorModelContextTesting) {
    restore(
      nav,
      'modelContextTesting',
      installState.previousNavigatorModelContextTestingDescriptor
    );
  }

  installState.installed = false;
  installState.previousDocumentModelContextDescriptor = undefined;
  installState.previousNavigatorModelContextDescriptor = undefined;
  installState.previousNavigatorModelContextTestingDescriptor = undefined;
  installState.installedDocumentModelContext = false;
  installState.installedNavigatorModelContext = false;
  installState.installedNavigatorModelContextTesting = false;
  navigatorModelContextDeprecationWarned = false;
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
