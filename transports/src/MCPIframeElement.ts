/**
 * MCPIframe Custom Element
 *
 * A custom element that wraps an iframe and automatically exposes tools
 * registered in the iframe's MCP server to the parent page's Model Context API.
 *
 * The iframe should have the MCP polyfill installed, which creates an MCP server
 * that exposes tools registered via `navigator.modelContext.registerTool()`.
 *
 * @example
 * ```html
 * <mcp-iframe src="./child-app.html" id="my-app"></mcp-iframe>
 * ```
 *
 * Tools from the iframe will be exposed with the element's ID as prefix:
 * - Child registers "calculate" -> Parent sees "my-app:calculate"
 *
 * @example
 * ```typescript
 * const mcpIframe = document.querySelector('mcp-iframe');
 * mcpIframe.addEventListener('mcp-iframe-ready', (e) => {
 *   console.log('Tools:', e.detail.tools);
 * });
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { IframeParentTransport } from './IframeParentTransport.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PREFIX_SEPARATOR = ':';
const DEFAULT_CHANNEL_ID = 'mcp-iframe';

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

/** Registration handle returned by navigator.modelContext.registerTool() */
interface RegistrationHandle {
  unregister: () => void;
}

/** Minimal ModelContext interface for tool registration */
interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: Tool['inputSchema'];
    execute: (args: Record<string, unknown>) => Promise<CallToolResult>;
  }): RegistrationHandle;
}

/** Navigator with optional modelContext */
interface NavigatorWithModelContext extends Navigator {
  modelContext?: ModelContext;
}

/** Custom event detail for mcp-iframe-ready */
export interface MCPIframeReadyEventDetail {
  tools: string[];
}

/** Custom event detail for mcp-iframe-error */
export interface MCPIframeErrorEventDetail {
  error: unknown;
}

/** Custom event detail for mcp-iframe-tools-changed */
export interface MCPIframeToolsChangedEventDetail {
  tools: string[];
}

// ============================================================================
// MCPIframeElement
// ============================================================================

/**
 * MCPIframe Custom Element
 *
 * Wraps an iframe and exposes its MCP tools to the parent's Model Context API.
 *
 * @fires mcp-iframe-ready - When connected to iframe's MCP server
 * @fires mcp-iframe-error - When connection fails
 * @fires mcp-iframe-tools-changed - When tools are refreshed
 */
export class MCPIframeElement extends HTMLElement {
  // Internal state
  #iframe: HTMLIFrameElement | null = null;
  #client: Client | null = null;
  #transport: IframeParentTransport | null = null;
  #ready = false;
  #connecting = false;
  #mcpTools: Tool[] = [];
  #registeredTools = new Map<string, RegistrationHandle>();

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

      case 'prefix-separator':
        this.#prefixSeparator = newValue ?? DEFAULT_PREFIX_SEPARATOR;
        if (this.#ready) {
          this.#unregisterAllTools();
          this.#registerToolsOnModelContext(this.#mcpTools);
        }
        break;

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

  /** Raw tools from the iframe's MCP server (without prefix) */
  get mcpTools(): Tool[] {
    return [...this.#mcpTools];
  }

  /** The tool name prefix (id + separator) */
  get toolPrefix(): string {
    const id = this.id || this.getAttribute('name') || 'iframe';
    return `${id}${this.#prefixSeparator}`;
  }

  /** Manually refresh tools from the iframe */
  async refreshTools(): Promise<void> {
    if (!this.#client || !this.#ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    const response = await this.#client.listTools();
    this.#mcpTools = response.tools;
    this.#unregisterAllTools();
    this.#registerToolsOnModelContext(this.#mcpTools);

    this.dispatchEvent(
      new CustomEvent<MCPIframeToolsChangedEventDetail>('mcp-iframe-tools-changed', {
        detail: { tools: this.exposedTools },
      })
    );
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

      // Fetch and register tools
      const response = await this.#client.listTools();
      this.#mcpTools = response.tools;
      this.#registerToolsOnModelContext(this.#mcpTools);

      this.dispatchEvent(
        new CustomEvent<MCPIframeReadyEventDetail>('mcp-iframe-ready', {
          detail: { tools: this.exposedTools },
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

  #registerToolsOnModelContext(tools: Tool[]): void {
    const modelContext = (navigator as NavigatorWithModelContext).modelContext;
    if (!modelContext) {
      console.warn('[MCPIframe] Model Context API not available on parent');
      return;
    }

    for (const tool of tools) {
      const prefixedName = `${this.toolPrefix}${tool.name}`;

      const registration = modelContext.registerTool({
        name: prefixedName,
        description: tool.description ?? `Tool from iframe: ${tool.name}`,
        inputSchema: tool.inputSchema,
        execute: (args) => this.#callIframeTool(tool.name, args),
      });

      this.#registeredTools.set(prefixedName, registration);
    }
  }

  #unregisterAllTools(): void {
    for (const registration of this.#registeredTools.values()) {
      registration.unregister();
    }
    this.#registeredTools.clear();
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
      // The SDK returns a union type; MCP protocol guarantees content field
      return result as CallToolResult;
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
    this.#unregisterAllTools();

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
