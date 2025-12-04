/**
 * MCPIframe Custom Element
 *
 * A custom element that wraps an iframe and automatically exposes tools
 * registered in the iframe to the parent page's Model Context API.
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
 * // Access the element programmatically
 * const mcpIframe = document.querySelector('mcp-iframe');
 * console.log(mcpIframe.exposedTools); // ['my-app:calculate', ...]
 * ```
 */

/** Tool definition from iframe */
export interface IframeTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Message types for parent-child communication */
export type MCPIframeMessageType =
  | 'mcp-iframe-ping'
  | 'mcp-iframe-ready'
  | 'mcp-iframe-tools-changed'
  | 'mcp-iframe-call-tool'
  | 'mcp-iframe-tool-result'
  | 'mcp-iframe-tool-error';

/** Base message structure */
export interface MCPIframeMessage {
  type: MCPIframeMessageType;
  channel: string;
}

/** Ping message from parent to check if child is ready */
export interface MCPIframePingMessage extends MCPIframeMessage {
  type: 'mcp-iframe-ping';
}

/** Ready message from child with initial tools */
export interface MCPIframeReadyMessage extends MCPIframeMessage {
  type: 'mcp-iframe-ready';
  tools: IframeTool[];
}

/** Tools changed notification from child */
export interface MCPIframeToolsChangedMessage extends MCPIframeMessage {
  type: 'mcp-iframe-tools-changed';
  tools: IframeTool[];
}

/** Tool call request from parent */
export interface MCPIframeCallToolMessage extends MCPIframeMessage {
  type: 'mcp-iframe-call-tool';
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** Tool result from child */
export interface MCPIframeToolResultMessage extends MCPIframeMessage {
  type: 'mcp-iframe-tool-result';
  callId: string;
  result: unknown;
}

/** Tool error from child */
export interface MCPIframeToolErrorMessage extends MCPIframeMessage {
  type: 'mcp-iframe-tool-error';
  callId: string;
  error: string;
}

/** Union of all message types */
export type MCPIframeMessages =
  | MCPIframePingMessage
  | MCPIframeReadyMessage
  | MCPIframeToolsChangedMessage
  | MCPIframeCallToolMessage
  | MCPIframeToolResultMessage
  | MCPIframeToolErrorMessage;

/** Pending tool call tracker */
interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Options for MCPIframe element */
export interface MCPIframeOptions {
  /** Channel ID for message filtering (default: 'mcp-iframe-tools') */
  channelId?: string;
  /** Timeout for tool calls in ms (default: 30000) */
  callTimeout?: number;
  /** Interval for ping retries in ms (default: 250) */
  pingInterval?: number;
  /** Prefix separator for tool names (default: ':') */
  prefixSeparator?: string;
}

const DEFAULT_CHANNEL = 'mcp-iframe-tools';
const DEFAULT_CALL_TIMEOUT = 30000;
const DEFAULT_PING_INTERVAL = 250;
const DEFAULT_PREFIX_SEPARATOR = ':';

/**
 * MCPIframe Custom Element
 *
 * Wraps an iframe and exposes its tools to the parent's Model Context API.
 */
export class MCPIframeElement extends HTMLElement {
  private _iframe: HTMLIFrameElement | null = null;
  private _channelId: string = DEFAULT_CHANNEL;
  private _callTimeout: number = DEFAULT_CALL_TIMEOUT;
  private _pingInterval: number = DEFAULT_PING_INTERVAL;
  private _prefixSeparator: string = DEFAULT_PREFIX_SEPARATOR;
  private _ready = false;
  private _iframeTools: IframeTool[] = [];
  private _registeredTools: Map<string, { unregister: () => void }> = new Map();
  private _pendingCalls: Map<string, PendingCall> = new Map();
  private _pingTimeout: ReturnType<typeof setTimeout> | null = null;
  private _messageHandler: ((event: MessageEvent) => void) | null = null;
  private _iframeOrigin: string | null = null;

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
    return [...MCPIframeElement.IFRAME_ATTRIBUTES, 'channel', 'call-timeout', 'prefix-separator'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._createIframe();
    this._setupMessageListener();
    this._startPinging();
  }

  disconnectedCallback(): void {
    this._cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    // Handle custom attributes
    if (name === 'channel') {
      this._channelId = newValue || DEFAULT_CHANNEL;
      return;
    }
    if (name === 'call-timeout') {
      this._callTimeout = newValue ? Number.parseInt(newValue, 10) : DEFAULT_CALL_TIMEOUT;
      return;
    }
    if (name === 'prefix-separator') {
      this._prefixSeparator = newValue || DEFAULT_PREFIX_SEPARATOR;
      // Re-register tools with new prefix if already connected
      if (this._ready) {
        this._unregisterAllTools();
        this._registerTools(this._iframeTools);
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

      // Reset connection when src changes
      if (name === 'src' || name === 'srcdoc') {
        this._resetConnection();
      }
    }
  }

  /** Get the wrapped iframe element */
  get iframe(): HTMLIFrameElement | null {
    return this._iframe;
  }

  /** Check if the iframe is connected and ready */
  get ready(): boolean {
    return this._ready;
  }

  /** Get list of exposed tool names (with prefix) */
  get exposedTools(): string[] {
    return Array.from(this._registeredTools.keys());
  }

  /** Get the raw tools from the iframe (without prefix) */
  get iframeTools(): IframeTool[] {
    return [...this._iframeTools];
  }

  /** Get the tool name prefix */
  get toolPrefix(): string {
    const id = this.id || this.getAttribute('name') || 'iframe';
    return `${id}${this._prefixSeparator}`;
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

    // Add to shadow DOM
    if (this.shadowRoot) {
      this.shadowRoot.appendChild(this._iframe);
    }
  }

  /** Setup the message listener for iframe communication */
  private _setupMessageListener(): void {
    this._messageHandler = (event: MessageEvent) => {
      const data = event.data as MCPIframeMessages;

      // Validate message
      if (!data || data.channel !== this._channelId) return;

      // Store origin on first valid message
      if (!this._iframeOrigin && this._iframe?.contentWindow === event.source) {
        this._iframeOrigin = event.origin;
      }

      // Verify origin
      if (event.origin !== this._iframeOrigin) return;

      switch (data.type) {
        case 'mcp-iframe-ready':
          this._handleReady(data);
          break;
        case 'mcp-iframe-tools-changed':
          this._handleToolsChanged(data);
          break;
        case 'mcp-iframe-tool-result':
          this._handleToolResult(data);
          break;
        case 'mcp-iframe-tool-error':
          this._handleToolError(data);
          break;
      }
    };

    window.addEventListener('message', this._messageHandler);
  }

  /** Start pinging the iframe to establish connection */
  private _startPinging(): void {
    const ping = () => {
      if (this._ready) return;

      if (this._iframe?.contentWindow) {
        this._iframe.contentWindow.postMessage(
          {
            type: 'mcp-iframe-ping',
            channel: this._channelId,
          } satisfies MCPIframePingMessage,
          '*'
        );
      }

      this._pingTimeout = setTimeout(ping, this._pingInterval);
    };

    ping();
  }

  /** Stop pinging */
  private _stopPinging(): void {
    if (this._pingTimeout) {
      clearTimeout(this._pingTimeout);
      this._pingTimeout = null;
    }
  }

  /** Handle ready message from iframe */
  private _handleReady(message: MCPIframeReadyMessage): void {
    this._stopPinging();
    this._ready = true;
    this._iframeTools = message.tools;
    this._registerTools(message.tools);

    this.dispatchEvent(
      new CustomEvent('mcp-iframe-ready', {
        detail: { tools: this.exposedTools },
      })
    );
  }

  /** Handle tools changed message from iframe */
  private _handleToolsChanged(message: MCPIframeToolsChangedMessage): void {
    this._iframeTools = message.tools;
    this._unregisterAllTools();
    this._registerTools(message.tools);

    this.dispatchEvent(
      new CustomEvent('mcp-iframe-tools-changed', {
        detail: { tools: this.exposedTools },
      })
    );
  }

  /** Handle tool result from iframe */
  private _handleToolResult(message: MCPIframeToolResultMessage): void {
    const pending = this._pendingCalls.get(message.callId);
    if (pending) {
      clearTimeout(pending.timeout);
      this._pendingCalls.delete(message.callId);
      pending.resolve(message.result);
    }
  }

  /** Handle tool error from iframe */
  private _handleToolError(message: MCPIframeToolErrorMessage): void {
    const pending = this._pendingCalls.get(message.callId);
    if (pending) {
      clearTimeout(pending.timeout);
      this._pendingCalls.delete(message.callId);
      pending.reject(new Error(message.error));
    }
  }

  /** Register tools in the parent's Model Context */
  private _registerTools(tools: IframeTool[]): void {
    // Check if Model Context API is available
    const modelContext = (navigator as { modelContext?: ModelContextAPI }).modelContext;
    if (!modelContext) {
      console.warn('[MCPIframe] Model Context API not available');
      return;
    }

    for (const tool of tools) {
      const prefixedName = `${this.toolPrefix}${tool.name}`;

      // Create a wrapper tool that routes calls to the iframe
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

  /** Call a tool in the iframe and wait for result */
  private _callIframeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._ready || !this._iframe?.contentWindow || !this._iframeOrigin) {
        reject(new Error('Iframe not ready'));
        return;
      }

      const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const timeout = setTimeout(() => {
        this._pendingCalls.delete(callId);
        reject(new Error(`Tool call timed out: ${toolName}`));
      }, this._callTimeout);

      this._pendingCalls.set(callId, { resolve, reject, timeout });

      this._iframe.contentWindow.postMessage(
        {
          type: 'mcp-iframe-call-tool',
          channel: this._channelId,
          callId,
          toolName,
          args,
        } satisfies MCPIframeCallToolMessage,
        this._iframeOrigin
      );
    });
  }

  /** Reset connection state when iframe source changes */
  private _resetConnection(): void {
    this._ready = false;
    this._iframeOrigin = null;
    this._iframeTools = [];
    this._unregisterAllTools();

    // Cancel pending calls
    for (const pending of this._pendingCalls.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection reset'));
    }
    this._pendingCalls.clear();

    // Start pinging again
    this._startPinging();
  }

  /** Clean up all resources */
  private _cleanup(): void {
    this._stopPinging();

    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }

    this._unregisterAllTools();

    // Cancel pending calls
    for (const pending of this._pendingCalls.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Element disconnected'));
    }
    this._pendingCalls.clear();
  }
}

/** Model Context API interface (subset) */
interface ModelContextAPI {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }): { unregister: () => void };
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
