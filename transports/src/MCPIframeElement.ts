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
import { IframeParentTransport } from './IframeParentTransport.js';

/** Tool info from MCP server */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** Options for MCPIframe element */
export interface MCPIframeElementOptions {
  /** Timeout for tool calls in ms (default: 30000) */
  callTimeout?: number;
  /** Prefix separator for tool names (default: ':') */
  prefixSeparator?: string;
  /** MCP channel ID (default: 'mcp-iframe') */
  channelId?: string;
}

const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PREFIX_SEPARATOR = ':';
const DEFAULT_CHANNEL_ID = 'mcp-iframe';

/**
 * MCPIframe Custom Element
 *
 * Wraps an iframe and exposes its MCP tools to the parent's Model Context API.
 */
export class MCPIframeElement extends HTMLElement {
  private _iframe: HTMLIFrameElement | null = null;
  private _client: Client | null = null;
  private _transport: IframeParentTransport | null = null;
  private _callTimeout: number = DEFAULT_CALL_TIMEOUT;
  private _prefixSeparator: string = DEFAULT_PREFIX_SEPARATOR;
  private _channelId: string = DEFAULT_CHANNEL_ID;
  private _ready = false;
  private _mcpTools: MCPTool[] = [];
  private _registeredTools: Map<string, { unregister: () => void }> = new Map();
  private _connecting = false;
  private _targetOrigin: string | null = null;

  /** List of standard iframe attributes to mirror */
  static readonly IFRAME_ATTRIBUTES = [
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
  ];

  /** Observed attributes for the custom element */
  static get observedAttributes(): string[] {
    return [
      ...MCPIframeElement.IFRAME_ATTRIBUTES,
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

  connectedCallback(): void {
    this._createIframe();
  }

  disconnectedCallback(): void {
    this._cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    // Handle custom attributes
    switch (name) {
      case 'target-origin':
        this._targetOrigin = newValue;
        if (this._ready) {
          this._reconnect();
        }
        return;
      case 'channel':
        this._channelId = newValue || DEFAULT_CHANNEL_ID;
        if (this._ready) {
          this._reconnect();
        }
        return;
      case 'call-timeout':
        this._callTimeout = newValue ? Number.parseInt(newValue, 10) : DEFAULT_CALL_TIMEOUT;
        return;
      case 'prefix-separator':
        this._prefixSeparator = newValue || DEFAULT_PREFIX_SEPARATOR;
        // Re-register tools with new prefix if already connected
        if (this._ready) {
          this._unregisterAllTools();
          this._registerToolsOnModelContext(this._mcpTools);
        }
        return;
    }

    // Mirror iframe attributes
    if (this._iframe && MCPIframeElement.IFRAME_ATTRIBUTES.includes(name)) {
      if (newValue === null) {
        this._iframe.removeAttribute(name);
      } else {
        this._iframe.setAttribute(name, newValue);
      }

      // Reconnect when src changes
      if (name === 'src' || name === 'srcdoc') {
        this._reconnect();
      }
    }
  }

  /** Get the wrapped iframe element */
  get iframe(): HTMLIFrameElement | null {
    return this._iframe;
  }

  /** Get the MCP client (if connected) */
  get client(): Client | null {
    return this._client;
  }

  /** Check if connected to the iframe's MCP server */
  get ready(): boolean {
    return this._ready;
  }

  /** Get list of exposed tool names (with prefix) */
  get exposedTools(): string[] {
    return Array.from(this._registeredTools.keys());
  }

  /** Get the raw tools from the iframe's MCP server (without prefix) */
  get mcpTools(): MCPTool[] {
    return [...this._mcpTools];
  }

  /** Get the tool name prefix */
  get toolPrefix(): string {
    const id = this.id || this.getAttribute('name') || 'iframe';
    return `${id}${this._prefixSeparator}`;
  }

  /** Manually refresh tools from the iframe */
  async refreshTools(): Promise<void> {
    if (!this._client || !this._ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    const response = await this._client.listTools();
    this._mcpTools = response.tools as MCPTool[];
    this._unregisterAllTools();
    this._registerToolsOnModelContext(this._mcpTools);

    this.dispatchEvent(
      new CustomEvent('mcp-iframe-tools-changed', {
        detail: { tools: this.exposedTools },
      })
    );
  }

  /** Create the internal iframe element */
  private _createIframe(): void {
    this._iframe = document.createElement('iframe');

    // Copy all iframe attributes
    for (const attr of MCPIframeElement.IFRAME_ATTRIBUTES) {
      const value = this.getAttribute(attr);
      if (value !== null) {
        this._iframe.setAttribute(attr, value);
      }
    }

    // Default styling to fill container
    this._iframe.style.border = 'none';
    this._iframe.style.width = this.getAttribute('width') || '100%';
    this._iframe.style.height = this.getAttribute('height') || '100%';

    // Connect when iframe loads
    this._iframe.addEventListener('load', () => {
      this._connect();
    });

    // Add to shadow DOM
    if (this.shadowRoot) {
      this.shadowRoot.appendChild(this._iframe);
    }
  }

  /** Connect to the iframe's MCP server */
  private async _connect(): Promise<void> {
    if (this._connecting || !this._iframe) return;
    this._connecting = true;

    try {
      // Determine target origin
      const targetOrigin = this._getTargetOrigin();
      if (!targetOrigin) {
        console.warn('[MCPIframe] Cannot determine target origin. Set target-origin attribute.');
        return;
      }

      // Create transport
      this._transport = new IframeParentTransport({
        iframe: this._iframe,
        targetOrigin,
        channelId: this._channelId,
      });

      // Create MCP client
      this._client = new Client({
        name: `MCPIframe:${this.id || 'anonymous'}`,
        version: '1.0.0',
      });

      // Connect
      await this._client.connect(this._transport);
      this._ready = true;

      // Get tools from iframe
      const response = await this._client.listTools();
      this._mcpTools = response.tools as MCPTool[];

      // Register tools on parent's Model Context
      this._registerToolsOnModelContext(this._mcpTools);

      this.dispatchEvent(
        new CustomEvent('mcp-iframe-ready', {
          detail: { tools: this.exposedTools },
        })
      );
    } catch (error) {
      console.error('[MCPIframe] Failed to connect:', error);
      this.dispatchEvent(
        new CustomEvent('mcp-iframe-error', {
          detail: { error },
        })
      );
    } finally {
      this._connecting = false;
    }
  }

  /** Get the target origin for the iframe */
  private _getTargetOrigin(): string | null {
    // Use explicit attribute if set
    if (this._targetOrigin) {
      return this._targetOrigin;
    }

    // Try to infer from src attribute
    const src = this.getAttribute('src');
    if (src) {
      try {
        const url = new URL(src, window.location.href);
        return url.origin;
      } catch {
        // Invalid URL, fall through
      }
    }

    // For same-origin iframes
    return window.location.origin;
  }

  /** Register tools from iframe on parent's Model Context */
  private _registerToolsOnModelContext(tools: MCPTool[]): void {
    // Check if Model Context API is available
    const modelContext = (navigator as NavigatorWithModelContext).modelContext;
    if (!modelContext) {
      console.warn('[MCPIframe] Model Context API not available on parent');
      return;
    }

    for (const tool of tools) {
      const prefixedName = `${this.toolPrefix}${tool.name}`;

      // Create a wrapper tool that routes calls to the iframe via MCP
      const registration = modelContext.registerTool({
        name: prefixedName,
        description: tool.description || `Tool from iframe: ${tool.name}`,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        execute: async (args: Record<string, unknown>) => {
          return this._callIframeTool(tool.name, args);
        },
      });

      this._registeredTools.set(prefixedName, registration);
    }
  }

  /** Unregister all tools from the parent's Model Context */
  private _unregisterAllTools(): void {
    for (const registration of this._registeredTools.values()) {
      registration.unregister();
    }
    this._registeredTools.clear();
  }

  /** Call a tool in the iframe via MCP */
  private async _callIframeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this._client || !this._ready) {
      throw new Error('Not connected to iframe MCP server');
    }

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool call timed out: ${toolName}`));
      }, this._callTimeout);
    });

    // Race the tool call against the timeout
    const result = await Promise.race([
      this._client.callTool({
        name: toolName,
        arguments: args,
      }),
      timeoutPromise,
    ]);

    // Extract the result from MCP response
    const mcpResult = result as { content?: Array<{ type: string; text?: string }> };
    const firstContent = mcpResult.content?.[0];
    if (firstContent && firstContent.type === 'text' && firstContent.text) {
      // Try to parse as JSON, otherwise return as string
      try {
        return JSON.parse(firstContent.text);
      } catch {
        return firstContent.text;
      }
    }

    return result;
  }

  /** Reconnect to the iframe's MCP server */
  private async _reconnect(): Promise<void> {
    await this._disconnect();
    // Small delay to ensure iframe is ready
    setTimeout(() => {
      this._connect();
    }, 100);
  }

  /** Disconnect from the iframe's MCP server */
  private async _disconnect(): Promise<void> {
    this._ready = false;
    this._mcpTools = [];
    this._unregisterAllTools();

    if (this._client) {
      try {
        await this._client.close();
      } catch {
        // Ignore close errors
      }
      this._client = null;
    }

    if (this._transport) {
      try {
        await this._transport.close();
      } catch {
        // Ignore close errors
      }
      this._transport = null;
    }
  }

  /** Clean up all resources */
  private async _cleanup(): Promise<void> {
    await this._disconnect();
  }
}

/** Navigator with Model Context API */
interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool(tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => Promise<unknown>;
    }): { unregister: () => void };
  };
}

/** Register the custom element */
export function registerMCPIframeElement(tagName = 'mcp-iframe'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, MCPIframeElement);
  }
}

// Auto-register if in browser environment
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  registerMCPIframeElement();
}
