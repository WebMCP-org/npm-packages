/**
 * MCPIframe Custom Element
 *
 * A custom element that wraps an iframe and automatically exposes tools,
 * resources, and prompts registered in the iframe's MCP server to the
 * parent page's Model Context API.
 *
 * The iframe should expose its MCP server through `document.modelContext`.
 * Older runtimes that only expose `navigator.modelContext` remain supported.
 *
 * @example
 * ```html
 * <mcp-iframe src="./child-app.html" id="my-app"></mcp-iframe>
 * ```
 *
 * Tool and prompt names use the element's ID as a prefix. Resources use a wrapper URI:
 * - Child registers tool "calculate" -> Parent sees "my-app_calculate"
 * - Child registers resource "config://settings" -> Parent sees an "mcp-iframe:" wrapper URI
 * - Child registers prompt "help" -> Parent sees "my-app_help"
 *
 * Note: The prefix separator defaults to underscore (_) to ensure WebMCP compatibility.
 * The parent model context validates the final prefixed tool name.
 *
 * @example
 * ```typescript
 * const mcpIframe = document.querySelector('mcp-iframe');
 * mcpIframe.addEventListener('mcp-iframe-ready', (e) => {
 *   console.log('Tools:', e.detail.tools);
 *   console.log('Resources:', e.detail.resources);
 *   console.log('Prompts:', e.detail.prompts);
 * });
 * ```
 */

import { IframeParentTransport } from '@mcp-b/transports';
import {
  type BrowserMcpServer,
  type PromptDescriptor,
  type ResourceDescriptor,
} from '@mcp-b/webmcp-ts-sdk';
import type {
  CallToolResult,
  InputSchema,
  ModelContext,
  ModelContextTool,
  RegistrationHandle,
} from '@mcp-b/webmcp-types';
import {
  Client,
  UriTemplate,
  type GetPromptResult,
  type Prompt,
  type ReadResourceResult,
  type Resource,
  type ResourceTemplateType,
  type Tool,
  type Variables,
} from '@modelcontextprotocol/client';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PREFIX_SEPARATOR = '_';
const DEFAULT_CHANNEL_ID = 'mcp-iframe';

type McpBRegistrationExtensions = Pick<BrowserMcpServer, 'registerPrompt' | 'registerResource'>;
type NativeToolSyncExtension = Pick<BrowserMcpServer, 'syncNativeTools'>;

interface McpItems {
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: ResourceTemplateType[];
  prompts: Prompt[];
}

interface Connection {
  client: Client;
  ready: boolean;
  refreshRevision: number;
  refreshQueue: Promise<void>;
  items: McpItems;
  toolRegistrations: Map<string, AbortController>;
  resourceRegistrations: Map<string, RegistrationHandle>;
  promptRegistrations: Map<string, RegistrationHandle>;
}

const emptyItems = (): McpItems => ({
  tools: [],
  resources: [],
  resourceTemplates: [],
  prompts: [],
});

function hasMcpBRegistrationExtensions(
  modelContext: ModelContext
): modelContext is ModelContext & McpBRegistrationExtensions {
  return (
    'registerResource' in modelContext &&
    typeof modelContext.registerResource === 'function' &&
    'registerPrompt' in modelContext &&
    typeof modelContext.registerPrompt === 'function'
  );
}

function hasNativeToolSync(
  modelContext: ModelContext
): modelContext is ModelContext & NativeToolSyncExtension {
  return 'syncNativeTools' in modelContext && typeof modelContext.syncNativeTools === 'function';
}

/**
 * Sanitizes a string to contain only valid MCP name characters.
 * Replaces invalid characters with underscores.
 */
function sanitizeMCPNamePart(str: string): string {
  return str.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function createParentResourceUri(
  source: string,
  childUri: string,
  variables: readonly string[] = []
): string {
  const parentUri = new URL('mcp-iframe:');
  parentUri.searchParams.set('source', source);
  parentUri.searchParams.set('uri', childUri);
  return [...new Set(variables)].reduce(
    (uri, variable, index) => `${uri}&variable-${index}={${variable}*}`,
    parentUri.href
  );
}

/**
 * Registration maps are keyed by the parent-visible name or URI, so a second item with the same
 * key can only shadow a live registration that `#unregisterAll` would then never tear down.
 */
function isDuplicateRegistration(
  registrations: ReadonlyMap<string, unknown>,
  key: string,
  kind: string
): boolean {
  if (!registrations.has(key)) return false;
  console.warn(`[MCPIframe] Ignoring duplicate iframe ${kind} "${key}"`);
  return true;
}

function decodeTemplateVariables(variables: Variables): Variables {
  return Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(decodeURIComponent) : decodeURIComponent(value),
    ])
  );
}

/** Standard iframe attributes that are mirrored to the internal iframe */
const IFRAME_ATTRIBUTES = [
  'src',
  'srcdoc',
  'name',
  'sandbox',
  'allow',
  'allowfullscreen',
  'width',
  'height',
  'loading',
  'referrerpolicy',
  'credentialless',
] satisfies readonly string[];

// ============================================================================
// Types
// ============================================================================

/** Names of items currently exposed on the parent model context. */
export interface MCPIframeItemsEventDetail {
  tools: string[];
  resources: string[];
  prompts: string[];
}

/** Custom event detail for mcp-iframe-ready */
/** Custom event detail for mcp-iframe-error */
export interface MCPIframeErrorEventDetail {
  error: unknown;
}

export interface MCPIframeEventMap {
  'mcp-iframe-ready': CustomEvent<MCPIframeItemsEventDetail>;
  'mcp-iframe-error': CustomEvent<MCPIframeErrorEventDetail>;
  'mcp-iframe-items-changed': CustomEvent<MCPIframeItemsEventDetail>;
}

// ============================================================================
// MCPIframeElement
// ============================================================================

/**
 * MCPIframe Custom Element
 *
 * Wraps an iframe and exposes its MCP tools, resources, and prompts
 * to the parent's Model Context API.
 *
 * @fires mcp-iframe-ready - When connected to iframe's MCP server
 * @fires mcp-iframe-error - When the connection or an item refresh fails
 * @fires mcp-iframe-items-changed - When items are refreshed
 */
export class MCPIframeElement extends HTMLElement {
  declare addEventListener: (<K extends keyof MCPIframeEventMap>(
    type: K,
    listener: (this: MCPIframeElement, event: MCPIframeEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ) => void) &
    HTMLElement['addEventListener'];

  declare removeEventListener: (<K extends keyof MCPIframeEventMap>(
    type: K,
    listener: (this: MCPIframeElement, event: MCPIframeEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions
  ) => void) &
    HTMLElement['removeEventListener'];

  #iframe: HTMLIFrameElement | null = null;
  #connection: Connection | null = null;
  #connectionAttempt: Promise<void> | null = null;
  #connectionRequestGeneration = 0;
  #nativeToolSyncPending = false;

  static get observedAttributes(): string[] {
    return [
      ...IFRAME_ATTRIBUTES,
      'id',
      'target-origin',
      'channel',
      'call-timeout',
      'prefix-separator',
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ==================== Lifecycle ====================

  connectedCallback(): void {
    if (this.#iframe) {
      void this.#reconnect();
    } else {
      this.#createIframe();
    }
  }

  disconnectedCallback(): void {
    ++this.#connectionRequestGeneration;
    void this.#disconnect();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'target-origin' || name === 'channel') {
      if (this.#iframe && this.isConnected) void this.#reconnect();
      return;
    }

    if (name === 'call-timeout') {
      const timeout = Number(newValue);
      if (newValue !== null && (!Number.isSafeInteger(timeout) || timeout <= 0)) {
        console.warn(
          `[MCPIframe] Invalid call-timeout "${newValue}". Using ${DEFAULT_CALL_TIMEOUT}.`
        );
      }
      return;
    }

    if (name === 'id' || name === 'prefix-separator') {
      if (name === 'prefix-separator' && newValue !== null) {
        const sanitized = sanitizeMCPNamePart(newValue);
        if (sanitized !== newValue) {
          console.warn(`[MCPIframe] Invalid prefix-separator "${newValue}". Using "${sanitized}".`);
        }
      }
      const connection = this.#connection;
      if (connection) {
        this.#requestRefresh(connection, 'Failed to update parent registrations');
      }
      return;
    }

    if (!this.#iframe || !IFRAME_ATTRIBUTES.includes(name)) return;
    if (newValue === null) {
      this.#iframe.removeAttribute(name);
    } else {
      this.#iframe.setAttribute(name, newValue);
    }
    if (name === 'src' || name === 'srcdoc') {
      ++this.#connectionRequestGeneration;
      void this.#disconnect();
    } else if (name === 'name') {
      const connection = this.#connection;
      if (connection) {
        this.#requestRefresh(connection, 'Failed to update parent registrations');
      }
    }
  }

  // ==================== Public API ====================

  /** The wrapped iframe element */
  get iframe(): HTMLIFrameElement | null {
    return this.#iframe;
  }

  /** Whether the element is connected to the iframe's MCP server */
  get ready(): boolean {
    return this.#connection?.ready ?? false;
  }

  /** List of exposed tool names (with prefix) */
  get exposedTools(): string[] {
    return Array.from(this.#connection?.toolRegistrations.keys() ?? []);
  }

  /** List of exposed parent-side resource wrapper URIs */
  get exposedResources(): string[] {
    return Array.from(this.#connection?.resourceRegistrations.keys() ?? []);
  }

  /** List of exposed prompt names (with prefix) */
  get exposedPrompts(): string[] {
    return Array.from(this.#connection?.promptRegistrations.keys() ?? []);
  }

  /** The item name prefix (id + separator), sanitized for MCP compatibility */
  get itemPrefix(): string {
    const rawId = this.id || this.getAttribute('name') || 'iframe';
    const id = sanitizeMCPNamePart(rawId);
    const separator = sanitizeMCPNamePart(
      this.getAttribute('prefix-separator') ?? DEFAULT_PREFIX_SEPARATOR
    );
    return `${id}${separator}`;
  }

  /** Manually refresh all items from the iframe */
  async refresh(): Promise<void> {
    const connection = this.#connection;
    if (!connection?.ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    await this.#queueRefresh(connection, true, 'Failed to refresh iframe items');
    await this.#waitForRefreshQueue(connection);
    if (!this.#isCurrentConnection(connection) || !connection.ready) {
      throw new Error('Iframe connection changed before refresh completed');
    }
  }

  // ==================== Private Methods ====================

  #createIframe(): void {
    if (this.#iframe) return;

    this.#iframe = document.createElement('iframe');

    // Mirror all iframe attributes
    for (const attr of IFRAME_ATTRIBUTES) {
      const value = this.getAttribute(attr);
      if (value !== null) {
        this.#iframe.setAttribute(attr, value);
      }
    }

    this.#iframe.style.border = 'none';

    // src/srcdoc changes only tear down; the load event rebuilds the connection.
    this.#iframe.addEventListener('load', () => void this.#reconnect());

    this.shadowRoot?.appendChild(this.#iframe);
  }

  async #connect(requestGeneration: number): Promise<void> {
    const activeAttempt = this.#connectionAttempt;
    if (activeAttempt) {
      await activeAttempt.catch(() => undefined);
    }
    const iframe = this.#iframe;
    if (requestGeneration !== this.#connectionRequestGeneration || !iframe || !this.isConnected) {
      return;
    }

    const attempt = this.#connectCurrent(requestGeneration, iframe);
    this.#connectionAttempt = attempt;
    try {
      await attempt;
    } finally {
      if (this.#connectionAttempt === attempt) {
        this.#connectionAttempt = null;
      }
    }
  }

  async #connectCurrent(requestGeneration: number, iframe: HTMLIFrameElement): Promise<void> {
    let connection: Connection | undefined;

    try {
      const transport = new IframeParentTransport({
        iframe,
        targetOrigin: this.#getTargetOrigin(),
        channelId: this.getAttribute('channel') ?? DEFAULT_CHANNEL_ID,
      });
      const onListChanged = () => {
        if (connection) this.#requestRefresh(connection, 'Failed to refresh iframe items');
      };
      const listChanged = { autoRefresh: false, debounceMs: 0, onChanged: onListChanged };
      const client = new Client(
        { name: `MCPIframe:${this.id || 'anonymous'}`, version: '1.0.0' },
        {
          versionNegotiation: { mode: 'auto' },
          listChanged: { tools: listChanged, resources: listChanged, prompts: listChanged },
        }
      );
      const currentConnection: Connection = {
        client,
        ready: false,
        refreshRevision: 0,
        refreshQueue: Promise.resolve(),
        items: emptyItems(),
        toolRegistrations: new Map(),
        resourceRegistrations: new Map(),
        promptRegistrations: new Map(),
      };
      connection = currentConnection;
      this.#connection = currentConnection;
      client.onclose = () => {
        if (currentConnection.ready) void this.#disconnect(currentConnection);
      };
      client.onerror = (error) => {
        this.#failConnection(currentConnection, error, 'Iframe MCP client error');
      };

      await client.connect(transport);
      if (
        requestGeneration !== this.#connectionRequestGeneration ||
        !this.#isCurrentConnection(currentConnection)
      ) {
        return;
      }

      await this.#queueRefresh(currentConnection, false, 'Failed to connect');
      await this.#waitForRefreshQueue(currentConnection);
      if (!this.#isCurrentConnection(currentConnection)) return;
      currentConnection.ready = true;
      this.#dispatchItems('mcp-iframe-ready');
    } catch (error) {
      if (
        requestGeneration !== this.#connectionRequestGeneration ||
        !this.isConnected ||
        (connection && !this.#isCurrentConnection(connection))
      ) {
        return;
      }
      if (connection) {
        this.#failConnection(connection, error, 'Failed to connect');
      } else {
        this.#dispatchError(error, 'Failed to connect');
      }
    }
  }

  async #fetchAllFromIframe(client: Client): Promise<McpItems> {
    const capabilities = client.getServerCapabilities();
    const [tools, resources, resourceTemplates, prompts] = await Promise.all([
      capabilities?.tools
        ? client.listTools(undefined, { cacheMode: 'refresh' }).then((result) => result.tools)
        : [],
      capabilities?.resources
        ? client
            .listResources(undefined, { cacheMode: 'refresh' })
            .then((result) => result.resources)
        : [],
      capabilities?.resources
        ? client
            .listResourceTemplates(undefined, { cacheMode: 'refresh' })
            .then((result) => result.resourceTemplates)
        : [],
      capabilities?.prompts
        ? client.listPrompts(undefined, { cacheMode: 'refresh' }).then((result) => result.prompts)
        : [],
    ]);
    return { tools, resources, resourceTemplates, prompts };
  }

  #isCurrentConnection(connection: Connection): boolean {
    return this.#connection === connection;
  }

  #requestRefresh(connection: Connection, context: string): void {
    void this.#queueRefresh(connection, true, context).catch(() => undefined);
  }

  #queueRefresh(connection: Connection, notify: boolean, context: string): Promise<void> {
    const refreshRevision = ++connection.refreshRevision;
    let registrationsReplaced = false;
    const refresh = connection.refreshQueue
      .catch(() => undefined)
      .then(async () => {
        const isActive = () =>
          this.#isCurrentConnection(connection) && refreshRevision === connection.refreshRevision;
        if (!isActive()) return;

        try {
          const items = await this.#fetchAllFromIframe(connection.client);
          if (!isActive()) return;

          this.#unregisterAll(connection);
          registrationsReplaced = true;
          connection.items = items;
          await this.#registerAllOnModelContext(connection, this.itemPrefix, isActive);
        } catch (error) {
          if (!isActive()) {
            if (registrationsReplaced) this.#unregisterAll(connection);
            return;
          }
          this.#failConnection(connection, error, context);
          throw error;
        }

        if (!isActive()) {
          this.#unregisterAll(connection);
          return;
        }
        if (notify && connection.ready) this.#dispatchItems('mcp-iframe-items-changed');
      });
    connection.refreshQueue = refresh;
    return refresh;
  }

  async #waitForRefreshQueue(connection: Connection): Promise<void> {
    while (this.#isCurrentConnection(connection)) {
      const refresh = connection.refreshQueue;
      await refresh;
      if (refresh === connection.refreshQueue) return;
    }
  }

  #dispatchItems(type: 'mcp-iframe-ready' | 'mcp-iframe-items-changed'): void {
    this.dispatchEvent(
      new CustomEvent<MCPIframeItemsEventDetail>(type, {
        detail: {
          tools: this.exposedTools,
          resources: this.exposedResources,
          prompts: this.exposedPrompts,
        },
      })
    );
  }

  #dispatchError(error: unknown, context: string): void {
    console.error(`[MCPIframe] ${context}:`, error);
    this.dispatchEvent(
      new CustomEvent<MCPIframeErrorEventDetail>('mcp-iframe-error', { detail: { error } })
    );
  }

  #failConnection(connection: Connection, error: unknown, context: string): void {
    if (!this.#invalidateConnection(connection)) return;
    this.#dispatchError(error, context);
    void this.#closeConnection(connection);
  }

  #getTargetOrigin(): string {
    const explicit = this.getAttribute('target-origin');
    if (explicit !== null) {
      if (!explicit) throw new Error('target-origin cannot be empty');
      return explicit;
    }

    if (
      this.#iframe?.hasAttribute('sandbox') &&
      !this.#iframe.sandbox.contains('allow-same-origin')
    ) {
      throw new Error('Opaque sandboxed iframes require target-origin="*"');
    }
    if (this.hasAttribute('srcdoc')) return window.location.origin;

    const src = this.getAttribute('src');
    if (!src) return window.location.origin;
    const url = new URL(src, window.location.href);
    if (url.protocol === 'about:') return window.location.origin;
    if (url.origin === 'null') {
      throw new Error('Opaque iframe sources require target-origin="*"');
    }
    return url.origin;
  }

  async #registerAllOnModelContext(
    connection: Connection,
    prefix: string,
    isActive: () => boolean
  ): Promise<void> {
    const modelContext: ModelContext | undefined = document.modelContext ?? navigator.modelContext;
    if (!modelContext) {
      throw new Error('Model Context API not available on parent');
    }

    if (this.#nativeToolSyncPending && hasNativeToolSync(modelContext)) {
      // Drain native reconciliation queued by the aborted registrations before reusing names.
      await modelContext.syncNativeTools();
      if (!isActive()) return;
      this.#nativeToolSyncPending = false;
    }

    await this.#registerToolsOnModelContext(connection, modelContext, prefix, isActive);
    if (!isActive()) return;
    if (hasMcpBRegistrationExtensions(modelContext)) {
      this.#registerResourcesOnModelContext(connection, modelContext, prefix);
      this.#registerPromptsOnModelContext(connection, modelContext, prefix);
    } else if (
      connection.items.resources.length > 0 ||
      connection.items.resourceTemplates.length > 0 ||
      connection.items.prompts.length > 0
    ) {
      console.warn(
        '[MCPIframe] Parent modelContext does not provide the MCP-B resource and prompt extensions'
      );
    }
  }

  async #registerToolsOnModelContext(
    connection: Connection,
    modelContext: ModelContext,
    prefix: string,
    isActive: () => boolean
  ): Promise<void> {
    for (const tool of connection.items.tools) {
      if (!isActive()) return;
      const prefixedName = `${prefix}${tool.name}`;
      if (isDuplicateRegistration(connection.toolRegistrations, prefixedName, 'tool')) continue;

      const descriptor: ModelContextTool<Record<string, unknown>, CallToolResult> & {
        inputSchema: InputSchema;
      } = {
        name: prefixedName,
        ...(tool.title !== undefined && { title: tool.title }),
        description: tool.description ?? `Tool from iframe: ${tool.name}`,
        inputSchema: tool.inputSchema,
        ...(tool.annotations?.readOnlyHint !== undefined && {
          annotations: { readOnlyHint: tool.annotations.readOnlyHint },
        }),
        execute: (args) => this.#callIframeTool(tool.name, args),
      };
      const controller = new AbortController();
      connection.toolRegistrations.set(prefixedName, controller);
      try {
        await modelContext.registerTool(descriptor, { signal: controller.signal });
      } catch (error) {
        const wasAborted = controller.signal.aborted;
        if (!wasAborted) {
          this.#nativeToolSyncPending = true;
          controller.abort();
        }
        if (connection.toolRegistrations.get(prefixedName) === controller) {
          connection.toolRegistrations.delete(prefixedName);
        }
        if (!wasAborted) throw error;
      }
    }
  }

  #registerResourcesOnModelContext(
    connection: Connection,
    modelContext: McpBRegistrationExtensions,
    prefix: string
  ): void {
    for (const resource of connection.items.resources) {
      const parentUri = createParentResourceUri(prefix, resource.uri);
      if (isDuplicateRegistration(connection.resourceRegistrations, parentUri, 'resource'))
        continue;

      const descriptor: ResourceDescriptor = {
        uri: parentUri,
        name: resource.name,
        ...(resource.description !== undefined && { description: resource.description }),
        ...(resource.mimeType !== undefined && { mimeType: resource.mimeType }),
        read: (_uri, _params) => this.#readIframeResource(resource.uri),
      };
      const registration = modelContext.registerResource(descriptor);
      connection.resourceRegistrations.set(parentUri, registration);
    }

    for (const resourceTemplate of connection.items.resourceTemplates) {
      const childTemplate = new UriTemplate(resourceTemplate.uriTemplate);
      const parentUri = createParentResourceUri(
        prefix,
        resourceTemplate.uriTemplate,
        childTemplate.variableNames
      );
      if (isDuplicateRegistration(connection.resourceRegistrations, parentUri, 'resource'))
        continue;

      const descriptor: ResourceDescriptor = {
        uri: parentUri,
        name: resourceTemplate.name,
        ...(resourceTemplate.description !== undefined && {
          description: resourceTemplate.description,
        }),
        ...(resourceTemplate.mimeType !== undefined && { mimeType: resourceTemplate.mimeType }),
        read: (_uri, params) =>
          this.#readIframeResource(childTemplate.expand(decodeTemplateVariables(params ?? {}))),
      };
      const registration = modelContext.registerResource(descriptor);
      connection.resourceRegistrations.set(parentUri, registration);
    }
  }

  #registerPromptsOnModelContext(
    connection: Connection,
    modelContext: McpBRegistrationExtensions,
    prefix: string
  ): void {
    for (const prompt of connection.items.prompts) {
      const prefixedName = `${prefix}${prompt.name}`;
      if (isDuplicateRegistration(connection.promptRegistrations, prefixedName, 'prompt')) continue;

      const descriptor: PromptDescriptor = {
        name: prefixedName,
        ...(prompt.description !== undefined && { description: prompt.description }),
        ...(prompt.arguments &&
          prompt.arguments.length > 0 && {
            argsSchema: {
              type: 'object',
              properties: Object.fromEntries(
                prompt.arguments.map((arg) => [
                  arg.name,
                  {
                    type: 'string',
                    ...(arg.description !== undefined && { description: arg.description }),
                  },
                ])
              ),
              required: prompt.arguments.filter((a) => a.required).map((a) => a.name),
            } satisfies InputSchema,
          }),
        get: (args) => this.#getIframePrompt(prompt.name, args),
      };
      const registration = modelContext.registerPrompt(descriptor);
      connection.promptRegistrations.set(prefixedName, registration);
    }
  }

  #unregisterAll(connection: Connection): void {
    const tools = [...connection.toolRegistrations.values()];
    const registrations = [
      ...connection.resourceRegistrations.values(),
      ...connection.promptRegistrations.values(),
    ];
    connection.toolRegistrations.clear();
    connection.resourceRegistrations.clear();
    connection.promptRegistrations.clear();
    connection.items = emptyItems();
    if (tools.length > 0) this.#nativeToolSyncPending = true;

    for (const controller of tools) {
      try {
        controller.abort();
      } catch (error) {
        console.warn('[MCPIframe] Failed to unregister a parent tool:', error);
      }
    }
    for (const registration of registrations) {
      try {
        registration.unregister();
      } catch (error) {
        console.warn('[MCPIframe] Failed to unregister a parent item:', error);
      }
    }
  }

  #requireClient(): Client {
    const connection = this.#connection;
    if (!connection?.ready) {
      throw new Error('Not connected to iframe MCP server');
    }
    return connection.client;
  }

  #getCallTimeout(): number {
    const timeout = Number(this.getAttribute('call-timeout'));
    return Number.isSafeInteger(timeout) && timeout > 0 ? timeout : DEFAULT_CALL_TIMEOUT;
  }

  async #callIframeTool(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.#requireClient().callTool(
      { name: toolName, arguments: args },
      { timeout: this.#getCallTimeout() }
    );
  }

  async #readIframeResource(uri: string): Promise<ReadResourceResult> {
    return this.#requireClient().readResource({ uri }, { timeout: this.#getCallTimeout() });
  }

  async #getIframePrompt(name: string, args: Record<string, string>): Promise<GetPromptResult> {
    return this.#requireClient().getPrompt(
      { name, arguments: args },
      { timeout: this.#getCallTimeout() }
    );
  }

  async #reconnect(): Promise<void> {
    const requestGeneration = ++this.#connectionRequestGeneration;
    await this.#disconnect();
    if (requestGeneration !== this.#connectionRequestGeneration || !this.isConnected) return;
    await this.#connect(requestGeneration);
  }

  async #disconnect(connection = this.#connection): Promise<void> {
    if (!connection || !this.#invalidateConnection(connection)) return;
    await this.#closeConnection(connection);
  }

  #invalidateConnection(connection: Connection): boolean {
    if (!this.#isCurrentConnection(connection)) return false;
    this.#connection = null;
    ++connection.refreshRevision;
    connection.ready = false;
    delete connection.client.onclose;
    delete connection.client.onerror;
    this.#unregisterAll(connection);
    return true;
  }

  async #closeConnection(connection: Connection): Promise<void> {
    try {
      await connection.client.close();
    } catch (error) {
      console.warn('[MCPIframeElement] Error closing client during disconnect:', error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mcp-iframe': MCPIframeElement;
  }
}

/** Register the custom element with a custom tag name */
export function registerMCPIframeElement(tagName = 'mcp-iframe'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, MCPIframeElement);
  }
}
