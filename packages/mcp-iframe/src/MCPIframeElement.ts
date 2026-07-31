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
  ModelContextCore,
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
  type SubscriptionFilter,
  type Tool,
} from '@modelcontextprotocol/client';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PREFIX_SEPARATOR = '_';
const DEFAULT_CHANNEL_ID = 'mcp-iframe';

type McpBRegistrationExtensions = Pick<BrowserMcpServer, 'registerPrompt' | 'registerResource'>;
type NativeToolSyncExtension = Pick<BrowserMcpServer, 'syncNativeTools'>;
type ListChangedNotificationMethod =
  | 'notifications/tools/list_changed'
  | 'notifications/resources/list_changed'
  | 'notifications/prompts/list_changed';

function hasMcpBRegistrationExtensions(
  modelContext: ModelContextCore
): modelContext is ModelContextCore & McpBRegistrationExtensions {
  return (
    'registerResource' in modelContext &&
    typeof modelContext.registerResource === 'function' &&
    'registerPrompt' in modelContext &&
    typeof modelContext.registerPrompt === 'function'
  );
}

function hasNativeToolSync(
  modelContext: ModelContextCore
): modelContext is ModelContextCore & NativeToolSyncExtension {
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

  const expressions = [...new Set(variables)].map((variable, index) => {
    const key = `variable-${index}`;
    const expression = `{${variable}}`;
    parentUri.searchParams.set(key, expression);
    return { expression, key };
  });

  let href = parentUri.href;
  for (const { expression, key } of expressions) {
    const encodedPair = new URLSearchParams({ [key]: expression }).toString();
    href = href.replace(encodedPair, `${key}=${expression}`);
  }
  return href;
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
] as const;

// ============================================================================
// Types
// ============================================================================

/** Custom event detail for mcp-iframe-ready */
export interface MCPIframeReadyEventDetail {
  tools: string[];
  resources: string[];
  prompts: string[];
}

/** Custom event detail for mcp-iframe-error */
export interface MCPIframeErrorEventDetail {
  error: unknown;
}

/** Custom event detail for mcp-iframe-tools-changed */
export interface MCPIframeToolsChangedEventDetail {
  tools: string[];
  resources: string[];
  prompts: string[];
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
 * @fires mcp-iframe-error - When connection fails
 * @fires mcp-iframe-tools-changed - When items are refreshed
 */
export class MCPIframeElement extends HTMLElement {
  // Internal state
  #iframe: HTMLIFrameElement | null = null;
  #client: Client | null = null;
  #transport: IframeParentTransport | null = null;
  #ready = false;
  #connectionAttempt: Promise<void> | null = null;
  #announcedReady = false;
  #connectionGeneration = 0;
  #connectionRequestGeneration = 0;
  #refreshRevision = 0;
  #refreshQueue: Promise<void> = Promise.resolve();
  #listChangedController: AbortController | null = null;
  #listChangedNotificationMethods = new Set<ListChangedNotificationMethod>();
  #nativeToolSyncPending = false;

  // MCP items from iframe
  #mcpTools: Tool[] = [];
  #mcpResources: Resource[] = [];
  #mcpResourceTemplates: ResourceTemplateType[] = [];
  #mcpPrompts: Prompt[] = [];

  // Registered items on parent
  #registeredTools = new Map<string, AbortController>();
  #registeredResources = new Map<string, RegistrationHandle>();
  #registeredPrompts = new Map<string, RegistrationHandle>();

  // Configuration
  #callTimeout = DEFAULT_CALL_TIMEOUT;
  #prefixSeparator = DEFAULT_PREFIX_SEPARATOR;
  #channelId = DEFAULT_CHANNEL_ID;
  #targetOrigin: string | null = null;

  static get observedAttributes(): string[] {
    return [...IFRAME_ATTRIBUTES, 'target-origin', 'channel', 'call-timeout', 'prefix-separator'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ==================== Lifecycle ====================

  connectedCallback(): void {
    this.#createIframe();
  }

  disconnectedCallback(): void {
    void this.#cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'target-origin':
        this.#targetOrigin = newValue;
        if (this.#ready || this.#client) void this.#reconnect();
        break;

      case 'channel':
        this.#channelId = newValue ?? DEFAULT_CHANNEL_ID;
        if (this.#ready || this.#client) void this.#reconnect();
        break;

      case 'call-timeout':
        this.#callTimeout = newValue ? Number.parseInt(newValue, 10) : DEFAULT_CALL_TIMEOUT;
        break;

      case 'prefix-separator': {
        const separator = newValue ?? DEFAULT_PREFIX_SEPARATOR;
        const sanitizedSeparator = sanitizeMCPNamePart(separator);
        if (sanitizedSeparator !== separator) {
          console.warn(
            `[MCPIframe] Invalid prefix-separator "${separator}". ` +
              `Using sanitized value: "${sanitizedSeparator}"`
          );
        }
        this.#prefixSeparator = sanitizedSeparator;
        if (this.#ready && this.#client) {
          void this.#queueRefresh(this.#client, this.#connectionGeneration, true).catch((error) => {
            console.error('[MCPIframe] Failed to update parent registrations:', error);
          });
        }
        break;
      }

      default:
        // Mirror standard iframe attributes
        if (this.#iframe && (IFRAME_ATTRIBUTES as readonly string[]).includes(name)) {
          if (newValue === null) {
            this.#iframe.removeAttribute(name);
          } else {
            this.#iframe.setAttribute(name, newValue);
          }
          // Reconnect when source changes
          if (name === 'src' || name === 'srcdoc') {
            ++this.#connectionRequestGeneration;
            void this.#disconnect();
          }
        }
    }
  }

  // ==================== Public API ====================

  /** The wrapped iframe element */
  get iframe(): HTMLIFrameElement | null {
    return this.#iframe;
  }

  /** The MCP client (if connected) */
  get client(): Client | null {
    return this.#client;
  }

  /** Whether the element is connected to the iframe's MCP server */
  get ready(): boolean {
    return this.#ready;
  }

  /** List of exposed tool names (with prefix) */
  get exposedTools(): string[] {
    return Array.from(this.#registeredTools.keys());
  }

  /** List of exposed parent-side resource wrapper URIs */
  get exposedResources(): string[] {
    return Array.from(this.#registeredResources.keys());
  }

  /** List of exposed prompt names (with prefix) */
  get exposedPrompts(): string[] {
    return Array.from(this.#registeredPrompts.keys());
  }

  /** Raw tools from the iframe's MCP server (without prefix) */
  get mcpTools(): Tool[] {
    return [...this.#mcpTools];
  }

  /** Raw resources from the iframe's MCP server (without prefix) */
  get mcpResources(): Resource[] {
    return [...this.#mcpResources];
  }

  /** Raw prompts from the iframe's MCP server (without prefix) */
  get mcpPrompts(): Prompt[] {
    return [...this.#mcpPrompts];
  }

  /** The item name prefix (id + separator), sanitized for MCP compatibility */
  get itemPrefix(): string {
    const rawId = this.id || this.getAttribute('name') || 'iframe';
    const id = sanitizeMCPNamePart(rawId);
    if (id !== rawId) {
      console.warn(
        `[MCPIframe] ID/name "${rawId}" contains invalid characters for MCP names. ` +
          `Using sanitized value: "${id}"`
      );
    }
    return `${id}${this.#prefixSeparator}`;
  }

  /** @deprecated Use itemPrefix instead */
  get toolPrefix(): string {
    return this.itemPrefix;
  }

  /** Manually refresh all items from the iframe */
  async refresh(): Promise<void> {
    const client = this.#client;
    if (!client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    await this.#queueRefresh(client, this.#connectionGeneration, true);
    await this.#waitForRefreshQueue(client, this.#connectionGeneration);
  }

  /** @deprecated Use refresh() instead */
  async refreshTools(): Promise<void> {
    return this.refresh();
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

    // Default styling
    this.#iframe.style.border = 'none';
    this.#iframe.style.width = this.getAttribute('width') ?? '100%';
    this.#iframe.style.height = this.getAttribute('height') ?? '100%';

    // A load is the single source of truth for replacing the iframe connection.
    this.#iframe.addEventListener('load', () => void this.#handleIframeLoad());

    this.shadowRoot?.appendChild(this.#iframe);
  }

  async #handleIframeLoad(): Promise<void> {
    const requestGeneration = ++this.#connectionRequestGeneration;
    await this.#disconnect();
    if (requestGeneration !== this.#connectionRequestGeneration || !this.isConnected) return;
    await this.#connect(requestGeneration);
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
    let connectingClient: Client | undefined;
    let connectionGeneration: number | undefined;

    try {
      const targetOrigin = this.#getTargetOrigin();
      if (!targetOrigin) {
        console.warn('[MCPIframe] Cannot determine target origin. Set target-origin attribute.');
        return;
      }

      const transport = new IframeParentTransport({
        iframe,
        targetOrigin,
        channelId: this.#channelId,
      });
      this.#transport = transport;

      const client = new Client(
        {
          name: `MCPIframe:${this.id || 'anonymous'}`,
          version: '1.0.0',
        },
        { versionNegotiation: { mode: 'auto' } }
      );
      connectingClient = client;
      this.#client = client;
      const currentConnectionGeneration = ++this.#connectionGeneration;
      connectionGeneration = currentConnectionGeneration;
      client.onclose = () => {
        if (!this.#isCurrentConnection(client, currentConnectionGeneration)) return;
        void this.#disconnect();
      };

      // Connect to iframe's MCP server
      await client.connect(transport);
      if (
        requestGeneration !== this.#connectionRequestGeneration ||
        !this.#isCurrentConnection(client, connectionGeneration)
      ) {
        return;
      }
      this.#ready = true;

      await this.#observeListChanges(client, connectionGeneration);
      await this.#queueRefresh(client, connectionGeneration, false);
      await this.#waitForRefreshQueue(client, connectionGeneration);
      if (!this.#isCurrentConnection(client, connectionGeneration)) return;
      this.#announcedReady = true;

      this.dispatchEvent(
        new CustomEvent<MCPIframeReadyEventDetail>('mcp-iframe-ready', {
          detail: {
            tools: this.exposedTools,
            resources: this.exposedResources,
            prompts: this.exposedPrompts,
          },
        })
      );
    } catch (error) {
      if (
        requestGeneration !== this.#connectionRequestGeneration ||
        !this.isConnected ||
        (connectingClient &&
          connectionGeneration !== undefined &&
          !this.#isCurrentConnection(connectingClient, connectionGeneration))
      ) {
        return;
      }
      await this.#disconnect();
      console.error('[MCPIframe] Failed to connect:', error);
      this.dispatchEvent(
        new CustomEvent<MCPIframeErrorEventDetail>('mcp-iframe-error', {
          detail: { error },
        })
      );
    }
  }

  async #fetchAllFromIframe(client: Client): Promise<{
    tools: Tool[];
    resources: Resource[];
    resourceTemplates: ResourceTemplateType[];
    prompts: Prompt[];
  }> {
    const capabilities = client.getServerCapabilities();
    const [toolsResult, resourcesResult, resourceTemplatesResult, promptsResult] =
      await Promise.all([
        capabilities?.tools
          ? client.listTools(undefined, { cacheMode: 'refresh' })
          : Promise.resolve({ tools: [] as Tool[] }),
        capabilities?.resources
          ? client.listResources(undefined, { cacheMode: 'refresh' })
          : Promise.resolve({ resources: [] as Resource[] }),
        capabilities?.resources
          ? client.listResourceTemplates(undefined, { cacheMode: 'refresh' })
          : Promise.resolve({ resourceTemplates: [] as ResourceTemplateType[] }),
        capabilities?.prompts
          ? client.listPrompts(undefined, { cacheMode: 'refresh' })
          : Promise.resolve({ prompts: [] as Prompt[] }),
      ]);

    return {
      tools: toolsResult.tools,
      resources: resourcesResult.resources,
      resourceTemplates: resourceTemplatesResult.resourceTemplates,
      prompts: promptsResult.prompts,
    };
  }

  #isCurrentConnection(client: Client, connectionGeneration: number): boolean {
    return this.#client === client && this.#connectionGeneration === connectionGeneration;
  }

  #queueRefresh(client: Client, connectionGeneration: number, notify: boolean): Promise<void> {
    const refreshRevision = ++this.#refreshRevision;
    const refresh = this.#refreshQueue
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.#isCurrentConnection(client, connectionGeneration) ||
          refreshRevision !== this.#refreshRevision
        ) {
          return;
        }
        const snapshot = await this.#fetchAllFromIframe(client);
        if (
          !this.#isCurrentConnection(client, connectionGeneration) ||
          refreshRevision !== this.#refreshRevision
        ) {
          return;
        }

        this.#unregisterAll();
        this.#mcpTools = snapshot.tools;
        this.#mcpResources = snapshot.resources;
        this.#mcpResourceTemplates = snapshot.resourceTemplates;
        this.#mcpPrompts = snapshot.prompts;

        try {
          await this.#registerAllOnModelContext(() =>
            this.#isCurrentConnection(client, connectionGeneration)
          );
        } catch (error) {
          this.#unregisterAll();
          throw error;
        }

        if (!this.#isCurrentConnection(client, connectionGeneration)) {
          this.#unregisterAll();
          return;
        }

        if (refreshRevision === this.#refreshRevision && notify && this.#announcedReady) {
          this.#dispatchItemsChanged();
        }
      });
    this.#refreshQueue = refresh;
    return refresh;
  }

  async #waitForRefreshQueue(client: Client, connectionGeneration: number): Promise<void> {
    while (this.#isCurrentConnection(client, connectionGeneration)) {
      const refresh = this.#refreshQueue;
      await refresh;
      if (refresh === this.#refreshQueue) return;
    }
  }

  async #observeListChanges(client: Client, connectionGeneration: number): Promise<void> {
    const capabilities = client.getServerCapabilities();
    const toolsListChanged = capabilities?.tools?.listChanged === true;
    const resourcesListChanged = capabilities?.resources?.listChanged === true;
    const promptsListChanged = capabilities?.prompts?.listChanged === true;

    const handleListChanged = () => {
      void this.#queueRefresh(client, connectionGeneration, true).catch((error) => {
        if (this.#isCurrentConnection(client, connectionGeneration)) {
          console.error('[MCPIframe] Failed to refresh after list_changed:', error);
        }
      });
    };

    if (toolsListChanged) {
      client.setNotificationHandler('notifications/tools/list_changed', handleListChanged);
      this.#listChangedNotificationMethods.add('notifications/tools/list_changed');
    }
    if (resourcesListChanged) {
      client.setNotificationHandler('notifications/resources/list_changed', handleListChanged);
      this.#listChangedNotificationMethods.add('notifications/resources/list_changed');
    }
    if (promptsListChanged) {
      client.setNotificationHandler('notifications/prompts/list_changed', handleListChanged);
      this.#listChangedNotificationMethods.add('notifications/prompts/list_changed');
    }

    if (
      client.getProtocolEra() !== 'modern' ||
      (!toolsListChanged && !resourcesListChanged && !promptsListChanged)
    ) {
      return;
    }

    const filter: SubscriptionFilter = {
      ...(toolsListChanged && { toolsListChanged: true }),
      ...(resourcesListChanged && { resourcesListChanged: true }),
      ...(promptsListChanged && { promptsListChanged: true }),
    };
    const controller = new AbortController();
    this.#listChangedController = controller;
    const subscription = await client.listen(filter, { signal: controller.signal });
    if (controller.signal.aborted || !this.#isCurrentConnection(client, connectionGeneration)) {
      await subscription.close();
    }
  }

  #stopObservingListChanges(client: Client): void {
    this.#listChangedController?.abort();
    this.#listChangedController = null;

    for (const method of this.#listChangedNotificationMethods) {
      client.removeNotificationHandler(method);
    }
    this.#listChangedNotificationMethods.clear();
  }

  #dispatchItemsChanged(): void {
    this.dispatchEvent(
      new CustomEvent<MCPIframeToolsChangedEventDetail>('mcp-iframe-tools-changed', {
        detail: {
          tools: this.exposedTools,
          resources: this.exposedResources,
          prompts: this.exposedPrompts,
        },
      })
    );
  }

  #getTargetOrigin(): string | null {
    // Use explicit attribute if set
    if (this.#targetOrigin) {
      return this.#targetOrigin;
    }

    // Infer from src attribute
    const src = this.getAttribute('src');
    if (src) {
      try {
        return new URL(src, window.location.href).origin;
      } catch (error) {
        console.warn('[MCPIframeElement] Invalid src URL for origin detection:', src, error);
      }
    }

    // Default to same origin
    return window.location.origin;
  }

  async #registerAllOnModelContext(isActive: () => boolean): Promise<void> {
    const modelContext: ModelContextCore | undefined =
      document.modelContext ?? navigator.modelContext;
    if (!modelContext) {
      console.warn('[MCPIframe] Model Context API not available on parent');
      return;
    }

    if (this.#nativeToolSyncPending && hasNativeToolSync(modelContext)) {
      // Drain native reconciliation queued by the aborted registrations before reusing names.
      await modelContext.syncNativeTools();
      if (!isActive()) return;
      this.#nativeToolSyncPending = false;
    }

    await this.#registerToolsOnModelContext(modelContext, isActive);
    if (!isActive()) return;
    if (hasMcpBRegistrationExtensions(modelContext)) {
      this.#registerResourcesOnModelContext(modelContext);
      this.#registerPromptsOnModelContext(modelContext);
    } else if (
      this.#mcpResources.length > 0 ||
      this.#mcpResourceTemplates.length > 0 ||
      this.#mcpPrompts.length > 0
    ) {
      console.warn(
        '[MCPIframe] Parent modelContext does not provide the MCP-B resource and prompt extensions'
      );
    }
  }

  async #registerToolsOnModelContext(
    modelContext: ModelContextCore,
    isActive: () => boolean
  ): Promise<void> {
    for (const tool of this.#mcpTools) {
      if (!isActive()) return;
      const prefixedName = `${this.itemPrefix}${tool.name}`;

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
      this.#registeredTools.set(prefixedName, controller);
      try {
        await modelContext.registerTool(descriptor, { signal: controller.signal });
      } catch (error) {
        const wasAborted = controller.signal.aborted;
        if (!wasAborted) {
          this.#nativeToolSyncPending = true;
          controller.abort();
        }
        if (this.#registeredTools.get(prefixedName) === controller) {
          this.#registeredTools.delete(prefixedName);
        }
        if (!wasAborted) {
          console.error(`[MCPIframe] Failed to register tool "${prefixedName}":`, error);
        }
      }
    }
  }

  #registerResourcesOnModelContext(modelContext: McpBRegistrationExtensions): void {
    for (const resource of this.#mcpResources) {
      const parentUri = createParentResourceUri(this.itemPrefix, resource.uri);

      const descriptor: ResourceDescriptor = {
        uri: parentUri,
        name: resource.name,
        ...(resource.description !== undefined && { description: resource.description }),
        ...(resource.mimeType !== undefined && { mimeType: resource.mimeType }),
        read: (_uri, _params) => this.#readIframeResource(resource.uri),
      };
      const registration = modelContext.registerResource(descriptor);
      this.#registeredResources.set(parentUri, registration);
    }

    for (const resourceTemplate of this.#mcpResourceTemplates) {
      const childTemplate = new UriTemplate(resourceTemplate.uriTemplate);
      const parentUri = createParentResourceUri(
        this.itemPrefix,
        resourceTemplate.uriTemplate,
        childTemplate.variableNames
      );
      const descriptor: ResourceDescriptor = {
        uri: parentUri,
        name: resourceTemplate.name,
        ...(resourceTemplate.description !== undefined && {
          description: resourceTemplate.description,
        }),
        ...(resourceTemplate.mimeType !== undefined && { mimeType: resourceTemplate.mimeType }),
        read: (_uri, params) => this.#readIframeResource(childTemplate.expand(params ?? {})),
      };
      const registration = modelContext.registerResource(descriptor);
      this.#registeredResources.set(parentUri, registration);
    }
  }

  #registerPromptsOnModelContext(modelContext: McpBRegistrationExtensions): void {
    for (const prompt of this.#mcpPrompts) {
      const prefixedName = `${this.itemPrefix}${prompt.name}`;

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
      this.#registeredPrompts.set(prefixedName, registration);
    }
  }

  #unregisterAll(): void {
    if (this.#registeredTools.size > 0) {
      this.#nativeToolSyncPending = true;
    }
    for (const controller of this.#registeredTools.values()) {
      controller.abort();
    }
    this.#registeredTools.clear();

    for (const registration of this.#registeredResources.values()) {
      registration.unregister();
    }
    this.#registeredResources.clear();

    for (const registration of this.#registeredPrompts.values()) {
      registration.unregister();
    }
    this.#registeredPrompts.clear();
  }

  #requireClient(): Client {
    const client = this.#client;
    if (!client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }
    return client;
  }

  async #callIframeTool(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.#requireClient().callTool(
      { name: toolName, arguments: args },
      { timeout: this.#callTimeout }
    );
  }

  async #readIframeResource(uri: string): Promise<ReadResourceResult> {
    return this.#requireClient().readResource({ uri }, { timeout: this.#callTimeout });
  }

  async #getIframePrompt(name: string, args: Record<string, string>): Promise<GetPromptResult> {
    return this.#requireClient().getPrompt(
      { name, arguments: args },
      { timeout: this.#callTimeout }
    );
  }

  async #reconnect(): Promise<void> {
    const requestGeneration = ++this.#connectionRequestGeneration;
    await this.#disconnect();
    // Brief delay for iframe to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (requestGeneration !== this.#connectionRequestGeneration || !this.isConnected) return;
    await this.#connect(requestGeneration);
  }

  async #disconnect(): Promise<void> {
    const client = this.#client;
    const transport = this.#transport;
    ++this.#connectionGeneration;
    ++this.#refreshRevision;
    this.#ready = false;
    this.#announcedReady = false;
    this.#client = null;
    this.#transport = null;
    this.#mcpTools = [];
    this.#mcpResources = [];
    this.#mcpResourceTemplates = [];
    this.#mcpPrompts = [];
    this.#unregisterAll();

    if (client) {
      this.#stopObservingListChanges(client);
      delete client.onclose;
    }
    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.warn('[MCPIframeElement] Error closing transport during disconnect:', error);
      }
    }
    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.warn('[MCPIframeElement] Error closing client during disconnect:', error);
      }
    }
  }

  async #cleanup(): Promise<void> {
    ++this.#connectionRequestGeneration;
    await this.#disconnect();
  }
}

// ============================================================================
// Registration
// ============================================================================

/** Register the custom element with a custom tag name */
export function registerMCPIframeElement(tagName = 'mcp-iframe'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, MCPIframeElement);
  }
}

// Auto-register in browser environments
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  registerMCPIframeElement();
}
