/**
 * MCPIframe Custom Element
 *
 * A custom element that wraps an iframe and automatically exposes tools,
 * resources, and prompts registered in the iframe's MCP server to the
 * parent page's Model Context API.
 *
 * The iframe should have the MCP polyfill installed, which creates an MCP server
 * that exposes items registered via `navigator.modelContext`.
 *
 * @example
 * ```html
 * <mcp-iframe src="./child-app.html" id="my-app"></mcp-iframe>
 * ```
 *
 * Items from the iframe will be exposed with the element's ID as prefix:
 * - Child registers tool "calculate" -> Parent sees "my-app_calculate"
 * - Child registers resource "config://settings" -> Parent sees "my-app_config://settings"
 * - Child registers prompt "help" -> Parent sees "my-app_help"
 *
 * Note: The prefix separator defaults to underscore (_) to ensure MCP compatibility.
 * Tool and prompt names must match the pattern: ^[a-zA-Z0-9_-]{1,128}$
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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PREFIX_SEPARATOR = '_';
const DEFAULT_CHANNEL_ID = 'mcp-iframe';

/**
 * MCP name validation pattern.
 * Tool/prompt names must match: ^[a-zA-Z0-9_-]{1,128}$
 */
const MCP_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const MCP_NAME_MAX_LENGTH = 128;

/**
 * Validates that a string contains only valid MCP name characters.
 * Valid characters: a-z, A-Z, 0-9, underscore (_), hyphen (-)
 */
function isValidMCPNameChars(str: string): boolean {
  return /^[a-zA-Z0-9_-]*$/.test(str);
}

/**
 * Validates a complete MCP name (tool name, prompt name).
 * Must be 1-128 characters and contain only valid characters.
 */
function isValidMCPName(name: string): boolean {
  return MCP_NAME_PATTERN.test(name);
}

/**
 * Sanitizes a string to contain only valid MCP name characters.
 * Replaces invalid characters with underscores.
 */
function sanitizeMCPNamePart(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
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

/** Registration handle returned by navigator.modelContext register methods */
interface RegistrationHandle {
  unregister: () => void;
}

/** Minimal ModelContext interface for registering tools, resources, and prompts */
interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: Tool['inputSchema'];
    execute: (args: Record<string, unknown>) => Promise<CallToolResult>;
  }): RegistrationHandle;

  registerResource(resource: {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    read: (uri: URL, params?: Record<string, string>) => Promise<ReadResourceResult>;
  }): RegistrationHandle;

  registerPrompt(prompt: {
    name: string;
    description?: string;
    argsSchema?: Record<string, unknown>;
    get: (args: Record<string, unknown>) => Promise<GetPromptResult>;
  }): RegistrationHandle;
}

/** Navigator with optional modelContext */
interface NavigatorWithModelContext extends Navigator {
  modelContext?: ModelContext;
}

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
  #connecting = false;

  // MCP items from iframe
  #mcpTools: Tool[] = [];
  #mcpResources: Resource[] = [];
  #mcpPrompts: Prompt[] = [];

  // Registered items on parent
  #registeredTools = new Map<string, RegistrationHandle>();
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
        if (this.#ready) void this.#reconnect();
        break;

      case 'channel':
        this.#channelId = newValue ?? DEFAULT_CHANNEL_ID;
        if (this.#ready) void this.#reconnect();
        break;

      case 'call-timeout':
        this.#callTimeout = newValue ? Number.parseInt(newValue, 10) : DEFAULT_CALL_TIMEOUT;
        break;

      case 'prefix-separator': {
        const separator = newValue ?? DEFAULT_PREFIX_SEPARATOR;
        if (!isValidMCPNameChars(separator)) {
          console.warn(
            `[MCPIframe] Invalid prefix-separator "${separator}". ` +
              'Only alphanumeric characters, underscores, and hyphens are allowed. ' +
              `Using sanitized value: "${sanitizeMCPNamePart(separator)}"`
          );
          this.#prefixSeparator = sanitizeMCPNamePart(separator);
        } else {
          this.#prefixSeparator = separator;
        }
        if (this.#ready) {
          this.#unregisterAll();
          this.#registerAllOnModelContext();
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
            void this.#reconnect();
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

  /** List of exposed resource URIs (with prefix) */
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
    if (!this.#client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    await this.#fetchAllFromIframe();
    this.#unregisterAll();
    this.#registerAllOnModelContext();

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

  /** @deprecated Use refresh() instead */
  async refreshTools(): Promise<void> {
    return this.refresh();
  }

  // ==================== Private Methods ====================

  #createIframe(): void {
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

    // Connect when iframe loads
    this.#iframe.addEventListener('load', () => void this.#connect());

    this.shadowRoot?.appendChild(this.#iframe);
  }

  async #connect(): Promise<void> {
    if (this.#connecting || !this.#iframe) return;
    this.#connecting = true;

    try {
      const targetOrigin = this.#getTargetOrigin();
      if (!targetOrigin) {
        console.warn('[MCPIframe] Cannot determine target origin. Set target-origin attribute.');
        return;
      }

      // Create transport and client
      this.#transport = new IframeParentTransport({
        iframe: this.#iframe,
        targetOrigin,
        channelId: this.#channelId,
      });

      this.#client = new Client({
        name: `MCPIframe:${this.id || 'anonymous'}`,
        version: '1.0.0',
      });

      // Connect to iframe's MCP server
      await this.#client.connect(this.#transport);
      this.#ready = true;

      // Fetch all items from iframe
      await this.#fetchAllFromIframe();

      // Register on parent's Model Context
      this.#registerAllOnModelContext();

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
      console.error('[MCPIframe] Failed to connect:', error);
      this.dispatchEvent(
        new CustomEvent<MCPIframeErrorEventDetail>('mcp-iframe-error', {
          detail: { error },
        })
      );
    } finally {
      this.#connecting = false;
    }
  }

  async #fetchAllFromIframe(): Promise<void> {
    if (!this.#client) return;

    // Fetch tools, resources, and prompts in parallel
    const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
      this.#client.listTools(),
      this.#client.listResources().catch(() => ({ resources: [] })),
      this.#client.listPrompts().catch(() => ({ prompts: [] })),
    ]);

    this.#mcpTools = toolsResult.tools;
    this.#mcpResources = resourcesResult.resources;
    this.#mcpPrompts = promptsResult.prompts;
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
      } catch {
        // Invalid URL
      }
    }

    // Default to same origin
    return window.location.origin;
  }

  #registerAllOnModelContext(): void {
    const modelContext = (navigator as NavigatorWithModelContext).modelContext;
    if (!modelContext) {
      console.warn('[MCPIframe] Model Context API not available on parent');
      return;
    }

    this.#registerToolsOnModelContext(modelContext);
    this.#registerResourcesOnModelContext(modelContext);
    this.#registerPromptsOnModelContext(modelContext);
  }

  #registerToolsOnModelContext(modelContext: ModelContext): void {
    for (const tool of this.#mcpTools) {
      const prefixedName = `${this.itemPrefix}${tool.name}`;

      // Validate the final tool name
      if (!isValidMCPName(prefixedName)) {
        if (prefixedName.length > MCP_NAME_MAX_LENGTH) {
          console.error(
            `[MCPIframe] Cannot register tool "${tool.name}": ` +
              `prefixed name "${prefixedName}" exceeds ${MCP_NAME_MAX_LENGTH} characters ` +
              `(${prefixedName.length} chars). Skipping registration.`
          );
        } else {
          console.error(
            `[MCPIframe] Cannot register tool "${tool.name}": ` +
              `prefixed name "${prefixedName}" contains invalid characters. ` +
              'Tool names must match pattern: ^[a-zA-Z0-9_-]{1,128}$. Skipping registration.'
          );
        }
        continue;
      }

      const registration = modelContext.registerTool({
        name: prefixedName,
        description: tool.description ?? `Tool from iframe: ${tool.name}`,
        inputSchema: tool.inputSchema,
        execute: (args) => this.#callIframeTool(tool.name, args),
      });

      this.#registeredTools.set(prefixedName, registration);
    }
  }

  #registerResourcesOnModelContext(modelContext: ModelContext): void {
    for (const resource of this.#mcpResources) {
      const prefixedUri = `${this.itemPrefix}${resource.uri}`;

      const resourceDescriptor: Parameters<ModelContext['registerResource']>[0] = {
        uri: prefixedUri,
        name: resource.name,
        read: (_uri, _params) => this.#readIframeResource(resource.uri),
      };
      if (resource.description !== undefined) {
        resourceDescriptor.description = resource.description;
      }
      if (resource.mimeType !== undefined) {
        resourceDescriptor.mimeType = resource.mimeType;
      }

      const registration = modelContext.registerResource(resourceDescriptor);
      this.#registeredResources.set(prefixedUri, registration);
    }
  }

  #registerPromptsOnModelContext(modelContext: ModelContext): void {
    for (const prompt of this.#mcpPrompts) {
      const prefixedName = `${this.itemPrefix}${prompt.name}`;

      // Validate the final prompt name
      if (!isValidMCPName(prefixedName)) {
        if (prefixedName.length > MCP_NAME_MAX_LENGTH) {
          console.error(
            `[MCPIframe] Cannot register prompt "${prompt.name}": ` +
              `prefixed name "${prefixedName}" exceeds ${MCP_NAME_MAX_LENGTH} characters ` +
              `(${prefixedName.length} chars). Skipping registration.`
          );
        } else {
          console.error(
            `[MCPIframe] Cannot register prompt "${prompt.name}": ` +
              `prefixed name "${prefixedName}" contains invalid characters. ` +
              'Prompt names must match pattern: ^[a-zA-Z0-9_-]{1,128}$. Skipping registration.'
          );
        }
        continue;
      }

      const promptDescriptor: Parameters<ModelContext['registerPrompt']>[0] = {
        name: prefixedName,
        get: (args) => this.#getIframePrompt(prompt.name, args),
      };
      if (prompt.description !== undefined) {
        promptDescriptor.description = prompt.description;
      }
      if (prompt.arguments && prompt.arguments.length > 0) {
        promptDescriptor.argsSchema = {
          type: 'object',
          properties: Object.fromEntries(
            prompt.arguments.map((arg) => [
              arg.name,
              { type: 'string', description: arg.description },
            ])
          ),
          required: prompt.arguments.filter((a) => a.required).map((a) => a.name),
        };
      }

      const registration = modelContext.registerPrompt(promptDescriptor);
      this.#registeredPrompts.set(prefixedName, registration);
    }
  }

  #unregisterAll(): void {
    for (const registration of this.#registeredTools.values()) {
      registration.unregister();
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

  async #callIframeTool(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (!this.#client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#callTimeout);

    try {
      const result = await this.#client.callTool({ name: toolName, arguments: args }, undefined, {
        signal: controller.signal,
      });
      return result as CallToolResult;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #readIframeResource(uri: string): Promise<ReadResourceResult> {
    if (!this.#client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#callTimeout);

    try {
      const result = await this.#client.readResource({ uri }, { signal: controller.signal });
      return result as ReadResourceResult;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #getIframePrompt(name: string, args: Record<string, unknown>): Promise<GetPromptResult> {
    if (!this.#client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#callTimeout);

    try {
      const result = await this.#client.getPrompt(
        { name, arguments: args as Record<string, string> },
        { signal: controller.signal }
      );
      return result as GetPromptResult;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #reconnect(): Promise<void> {
    await this.#disconnect();
    // Brief delay for iframe to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.#connect();
  }

  async #disconnect(): Promise<void> {
    this.#ready = false;
    this.#mcpTools = [];
    this.#mcpResources = [];
    this.#mcpPrompts = [];
    this.#unregisterAll();

    if (this.#client) {
      try {
        await this.#client.close();
      } catch {
        // Ignore
      }
      this.#client = null;
    }

    if (this.#transport) {
      try {
        await this.#transport.close();
      } catch {
        // Ignore
      }
      this.#transport = null;
    }
  }

  async #cleanup(): Promise<void> {
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
