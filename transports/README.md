# @mcp-b/transports

> Browser transport implementations for Model Context Protocol (MCP) - Connect AI agents like Claude, ChatGPT, and Gemini to web applications

[![npm version](https://img.shields.io/npm/v/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/package/@mcp-b/transports)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/transports?style=flat-square)](https://www.npmjs.com/package/@mcp-b/transports)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@mcp-b/transports?style=flat-square)](https://bundlephobia.com/package/@mcp-b/transports)

📖 **[Full Documentation](https://docs.mcp-b.ai/packages/transports)** | 🚀 **[Quick Start](https://docs.mcp-b.ai/quickstart)** | 🔌 **[Transport Concepts](https://docs.mcp-b.ai/concepts/transports)**

**@mcp-b/transports** provides browser-native MCP transport implementations that enable AI agents and LLMs to communicate with web applications. Whether you're building Chrome extensions, embedded iframes, or in-page AI integrations, this library provides the secure messaging layer you need.

## Why Use @mcp-b/transports?

| Feature | Benefit |
|---------|---------|
| **Multiple Transport Types** | Choose the right transport for your architecture - Tab, Iframe, or Extension |
| **Secure by Default** | Origin validation, CORS configuration, and Chrome's secure messaging APIs |
| **AI-Agent Ready** | Built specifically for MCP, the standard protocol for AI tool integration |
| **TypeScript First** | Full type safety with comprehensive type definitions |
| **Zero Dependencies** | Only requires `zod` for schema validation |
| **Works Everywhere** | Chrome, Firefox, Edge, and any Chromium-based browser |

## Use Cases

- **Browser Extensions**: Build AI-powered extensions that interact with any webpage
- **Embedded AI Widgets**: Add AI capabilities to existing web applications via iframes
- **In-Page AI Assistants**: Create AI tools that work directly within your web app
- **Cross-Extension Communication**: Let extensions share AI tools with each other
- **Enterprise AI Portals**: Connect internal AI agents to web-based tools

## Installation

```bash
npm install @mcp-b/transports
```

## Transport Types

### Tab Transports (In-Page Communication)

Use `TabServerTransport` and `TabClientTransport` when your MCP server and client are running in the same browser tab. The transport uses `window.postMessage` for secure communication with origin validation.

### Extension Transports (Cross-Context Communication)

Use `ExtensionClientTransport` and `ExtensionServerTransport` for communication between browser extension components (sidebar, popup, background) and web pages with MCP servers.

### Extension External Transports (Cross-Extension Communication)

Use `ExtensionExternalClientTransport` and `ExtensionExternalServerTransport` for communication between different browser extensions, enabling one extension to access MCP servers hosted by another extension.

## Tab Transport Examples

### Server Setup (Web Page)

Create an MCP server in your web page and expose it via `TabServerTransport`:

```typescript
import { TabServerTransport } from "@mcp-b/transports";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Create MCP server with tools
const server = new McpServer(
  {
    name: "TODO-APP",
    version: "1.0.0",
  },
  {
    instructions:
      "You are a helpful assistant that can create, update, and delete todos.",
  }
);

// Register a tool
server.tool(
  "createTodo",
  "Creates a new todo item for the current user",
  {
    todoText: z.string().describe("The content of the todo item."),
  },
  async (args) => {
    // Implementation here
    return {
      content: [
        {
          type: "text",
          text: `Todo created: "${args.todoText}"`,
        },
      ],
    };
  }
);

// Connect to transport with CORS configuration
const transport = new TabServerTransport({
  allowedOrigins: ["*"], // Configure based on your security needs
});
await server.connect(transport);
```

### Client Setup (Same Page)

Connect to the server from within the same page or from an extension content script:

```typescript
import { TabClientTransport } from "@mcp-b/transports";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Create transport with target origin
const transport = new TabClientTransport({
  targetOrigin: window.location.origin,
});

// Discover available servers
const availableServers = await transport.discover();
if (availableServers.length > 0) {
  console.log(`Found server: ${availableServers[0].implementation.name}`);
}

// Create and connect client
const client = new Client({
  name: "ExtensionProxyClient",
  version: "1.0.0",
});

await client.connect(transport);

// Use the client
const result = await client.callTool({
  name: "createTodo",
  arguments: { todoText: "Buy groceries" },
});
```

### Tab Transport Configuration

#### TabClientTransport Options

- `targetOrigin` (required): Origin expected from the server window (for security).
- `channelId`: Override the default channel identifier (default: `mcp-default`).

#### TabServerTransport Options

- `allowedOrigins` (required): Whitelist of origins allowed to connect (for security).
- `channelId`: Override the default channel identifier (default: `mcp-default`).

## Iframe Transports (Parent-Child Communication)

Use `IframeParentTransport` and `IframeChildTransport` for cross-origin communication between a parent page and an iframe. These transports are specifically designed for iframe scenarios and support cross-origin messaging.

### Iframe Server Setup (Inside Iframe)

Create an MCP server inside an iframe that can be accessed by the parent page:

```typescript
import { IframeChildTransport } from "@mcp-b/transports";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

// Create MCP server
const server = new Server(
  {
    name: "IframeApp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.tool(
  "getIframeData",
  "Get data from the iframe application",
  {
    key: z.string().describe("Data key to retrieve"),
  },
  async (args) => {
    return {
      content: [
        {
          type: "text",
          text: `Retrieved: ${args.key}`,
        },
      ],
    };
  }
);

// Connect to iframe transport
const transport = new IframeChildTransport({
  allowedOrigins: ["https://parent-app.com"], // Parent page origin
  // or use ['*'] to allow any origin (less secure)
});

await server.connect(transport);
```

### Iframe Client Setup (Parent Page)

Connect from the parent page to the iframe's MCP server:

```typescript
import { IframeParentTransport } from "@mcp-b/transports";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Get reference to iframe element
const iframe = document.querySelector('iframe');

// Wait for iframe to load
iframe.addEventListener('load', async () => {
  // Create transport targeting the iframe
  const transport = new IframeParentTransport({
    iframe: iframe,
    targetOrigin: 'https://iframe-app.com', // Iframe page origin
  });

  // Create MCP client
  const client = new Client({
    name: "ParentPage",
    version: "1.0.0",
  });

  // Connect and use
  await client.connect(transport);

  // List available tools from iframe
  const tools = await client.listTools();
  console.log("Tools from iframe:", tools.tools);

  // Call a tool from the iframe
  const result = await client.callTool({
    name: "getIframeData",
    arguments: { key: "user-preferences" },
  });
});
```

### Iframe Transport Configuration

#### IframeParentTransport Options

- `iframe` (required): Reference to the HTMLIFrameElement
- `targetOrigin` (required): Expected origin of the iframe (for security)
- `channelId`: Override the default channel identifier (default: `mcp-iframe`)
- `checkReadyRetryMs`: Interval to retry the ready handshake if iframe isn't ready yet (default: 250ms)

#### IframeChildTransport Options

- `allowedOrigins` (required): Whitelist of parent origins allowed to connect (for security)
- `channelId`: Override the default channel identifier (default: `mcp-iframe`)
- `serverReadyRetryMs`: Interval to retry broadcasting ready signal to parent (default: 250ms)

### Cross-Origin Support

Iframe transports are designed for cross-origin communication:
- Parent and iframe can be on different domains
- Origin validation is performed on both sides
- Uses secure `postMessage` API
- Retry mechanisms handle iframe loading timing issues

## Extension Transport Examples

### Background Script Setup

The extension background script acts as a hub, aggregating tools from multiple tabs:

```typescript
import { ExtensionServerTransport } from "@mcp-b/transports";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

class McpHub {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "Extension-Hub",
      version: "1.0.0",
    });

    this.setupConnections();
  }

  private setupConnections() {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === "mcp") {
        this.handleUiConnection(port);
      } else if (port.name === "mcp-content-script-proxy") {
        this.handleContentScriptConnection(port);
      }
    });
  }

  private async handleUiConnection(port: chrome.runtime.Port) {
    const transport = new ExtensionServerTransport(port);
    await this.server.connect(transport);
  }
}
```

### Content Script Bridge

Content scripts act as a bridge between the page's MCP server and the extension:

```typescript
import { TabClientTransport } from "@mcp-b/transports";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Connect to the page's MCP server
const transport = new TabClientTransport({
  targetOrigin: window.location.origin,
});

const client = new Client({
  name: "ExtensionProxyClient",
  version: "1.0.0",
});

// Connect to extension background
const backgroundPort = chrome.runtime.connect({
  name: "mcp-content-script-proxy",
});

// Discover and connect to page server
await client.connect(transport);
const pageTools = await client.listTools();

// Register tools with background hub
backgroundPort.postMessage({
  type: "register-tools",
  tools: pageTools.tools,
});

// Handle tool execution requests from background
backgroundPort.onMessage.addListener(async (message) => {
  if (message.type === "execute-tool") {
    const result = await client.callTool({
      name: message.toolName,
      arguments: message.args || {},
    });

    backgroundPort.postMessage({
      type: "tool-result",
      requestId: message.requestId,
      data: { success: true, payload: result },
    });
  }
});
```

### Extension UI Client

Connect from the extension's sidebar or popup to use tools from all connected pages:

```typescript
import { ExtensionClientTransport } from "@mcp-b/transports";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Create transport - connects to the extension's background script
const transport = new ExtensionClientTransport({
  portName: "mcp",
});

// Create MCP client
const client = new Client({
  name: "Extension Sidepanel",
  version: "1.0.0",
});

// Connect and use
await client.connect(transport);

// List all available tools from all connected tabs
const tools = await client.listTools();

// Call a tool from a specific website
const result = await client.callTool({
  name: "website_tool_example_com_createTodo",
  arguments: { todoText: "Review PR" },
});
```

## Extension External Transport Examples

### Server Extension Setup (Extension 1)

Create an MCP server in Extension 1 that can be accessed by other extensions:

```typescript
import { ExtensionExternalServerTransport } from "@mcp-b/transports";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Create MCP server with tools
const server = new McpServer(
  {
    name: "MyExtensionAPI",
    version: "1.0.0",
  },
  {
    instructions: "Extension API for cross-extension communication",
  }
);

// Register tools
server.tool("getBookmarks", "Retrieves user bookmarks", {}, async () => {
  const bookmarks = await chrome.bookmarks.getTree();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(bookmarks, null, 2),
      },
    ],
  };
});

// Set up external connection listener in background script
chrome.runtime.onConnectExternal.addListener(async (port) => {
  if (port.name === "mcp") {
    // Optional: Add connection validation here
    if (port.sender?.id !== "allowed-extension-id") {
      port.disconnect();
      return;
    }

    const transport = new ExtensionServerTransport(port);
    await server.connect(transport);
  }
});
```

### Client Extension Setup (Extension 2)

Connect from Extension 2 to use Extension 1's MCP server:

```typescript
import { ExtensionExternalClientTransport } from "@mcp-b/transports";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Create transport targeting Extension 1
const transport = new ExtensionClientTransport({
  extensionId: "server-extension-id",
  portName: "mcp",
});

// Create MCP client
const client = new Client({
  name: "ClientExtension",
  version: "1.0.0",
});

// Connect and use
await client.connect(transport);

// List available tools from Extension 1
const tools = await client.listTools();
console.log("Available tools:", tools.tools);

// Call a tool from Extension 1
const result = await client.callTool({
  name: "getBookmarks",
  arguments: {},
});
```

### Extension External Transport Features

- **Cross-Extension Access**: Extensions can expose MCP servers to other extensions
- **Secure Communication**: Uses Chrome's `runtime.onConnectExternal` API
- **Connection Validation**: Server extension can validate incoming connections
- **Single Client**: Each server transport handles one client connection at a time

## Architecture Overview

### Tab Transport Flow

1. Server creates `TabServerTransport` and listens for messages via `window.postMessage`
2. Client creates `TabClientTransport` to connect to the server using the same channel
3. Communication happens securely with origin validation and message direction tracking

### Extension Transport Flow

1. Web pages run MCP servers with `TabServerTransport`
2. Content scripts discover these servers and relay to background script
3. Background script aggregates tools from all tabs using `ExtensionServerTransport`
4. Extension UI connects via `ExtensionClientTransport` to access all tools

### Extension External Transport Flow

1. Extension 1 creates `ExtensionExternalServerTransport` and listens on `chrome.runtime.onConnectExternal`
2. Extension 2 creates `ExtensionExternalClientTransport` targeting Extension 1's ID
3. Communication happens through Chrome's secure cross-extension messaging
4. Server extension can validate connections and control access

## Key Features

- **Automatic Server Discovery**: Tab clients can discover available servers
- **Cross-Origin Support**: Configure CORS for tab transports
- **Cross-Extension Communication**: Extensions can expose APIs to other extensions
- **Tool Namespacing**: Extension hub prefixes tools to avoid conflicts
- **Connection Management**: Automatic cleanup when tabs close
- **Type Safety**: Full TypeScript support with proper typing

## Security Considerations

- Tab transports respect origin restrictions
- Extension transports use Chrome's secure message passing
- External extension transports require `externally_connectable` manifest configuration
- Server extensions should validate incoming connections from other extensions
- Configure `allowedOrigins` appropriately for your use case
- Tools execute in their original context (web page or extension)

## Frequently Asked Questions

### What is MCP (Model Context Protocol)?

MCP is an open protocol that standardizes how AI applications connect to external tools and data sources. It's used by AI agents like Claude, ChatGPT, Cursor, and Copilot to interact with external systems. Learn more at [modelcontextprotocol.io](https://modelcontextprotocol.io).

### Which transport should I use?

| Scenario | Recommended Transport |
|----------|----------------------|
| Same-page communication | `TabServerTransport` / `TabClientTransport` |
| Parent page to iframe | `IframeParentTransport` / `IframeChildTransport` |
| Browser extension to webpage | `ExtensionClientTransport` / `ExtensionServerTransport` |
| Extension to extension | `ExtensionExternalClientTransport` / `ExtensionExternalServerTransport` |

### Is this compatible with Claude Desktop, Cursor, or VS Code Copilot?

Yes! These transports implement the MCP standard, making them compatible with any MCP client. Use `@mcp-b/chrome-devtools-mcp` to connect desktop AI agents to browser-based tools.

### How do I handle cross-origin communication?

All transports support origin validation. Configure `allowedOrigins` on server transports and `targetOrigin` on client transports to control which origins can communicate.

### Can I use this without a browser extension?

Yes! `TabServerTransport` and `TabClientTransport` work entirely within a web page using `window.postMessage`. No extension required.

## Comparison with Alternatives

| Feature | @mcp-b/transports | Raw postMessage | WebSocket |
|---------|------------------|-----------------|-----------|
| MCP Protocol Support | Yes | No | Manual |
| Type Safety | Full TypeScript | Manual | Manual |
| Origin Validation | Built-in | Manual | N/A |
| Extension Support | Native | Limited | Complex |
| Server Discovery | Automatic | Manual | Manual |

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill for registering tools
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp) - React hooks for MCP tool registration
- [`@mcp-b/extension-tools`](https://docs.mcp-b.ai/packages/extension-tools) - 62+ Chrome Extension API tools for MCP
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser tools
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Transport Concepts](https://docs.mcp-b.ai/concepts/transports)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol)

## License

MIT - see [LICENSE](../../LICENSE) for details

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
- [Discord Community](https://discord.gg/a9fBR6Bw)
