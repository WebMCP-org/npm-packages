# @mcp-b/react-webmcp

Complete React hooks for the Model Context Protocol - register tools via `navigator.modelContext` and consume tools from MCP servers.

## Features

### Provider Hooks (Registering Tools)
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **State-Aware**: Track execution state (loading, success, error) for UI feedback
- **React-Native**: Designed for React's lifecycle, including StrictMode compatibility
- **Developer-Friendly**: Intuitive API with comprehensive examples

### Client Hooks (Consuming Tools)
- **MCP Client Provider**: Connect to MCP servers and consume their tools
- **Real-time Updates**: Listen for tool list changes via MCP notifications
- **Connection Management**: Automatic connection handling with reconnect support
- **Type-Safe Tool Calls**: Full TypeScript support for client operations

## Installation

```bash
pnpm add @mcp-b/react-webmcp zod
```

For client functionality, you'll also need:
```bash
pnpm add @mcp-b/transports @modelcontextprotocol/sdk
```

## Prerequisites

**For Provider Hooks:** Requires the global `navigator.modelContext` API. Install `@mcp-b/global` or use a browser that implements the Web Model Context API.

**For Client Hooks:** Requires an MCP server to connect to (e.g., one created with `@mcp-b/global` or the Model Context Protocol SDK).

---

# Part 1: Provider API (Registering Tools)

Use these hooks to expose tools from your React app that AI agents can discover and call.

## Quick Start - Provider

### Basic Tool Registration

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function PostsPage() {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID. Increments the like count.',
    inputSchema: {
      postId: z.string().uuid().describe('The post ID to like'),
    },
    annotations: {
      title: 'Like Post',
      readOnlyHint: false,
      idempotentHint: true,
    },
    handler: async (input) => {
      await api.posts.like(input.postId);
      return { success: true, postId: input.postId };
    },
    formatOutput: (result) => `Post ${result.postId} liked successfully!`,
  });

  return (
    <div>
      {likeTool.state.isExecuting && <Spinner />}
      {likeTool.state.error && <ErrorAlert error={likeTool.state.error} />}
      {/* Your UI */}
    </div>
  );
}
```

### Context Tool

Expose read-only context to AI:

```tsx
import { useWebMCPContext } from '@mcp-b/react-webmcp';

function PostDetailPage() {
  const { postId } = useParams();
  const { data: post } = useQuery(['post', postId], () => fetchPost(postId));

  useWebMCPContext(
    'context_current_post',
    'Get the currently viewed post ID and metadata',
    () => ({
      postId,
      title: post?.title,
      author: post?.author,
      tags: post?.tags,
    })
  );

  return <div>{/* Post UI */}</div>;
}
```

## Provider API Reference

### `useWebMCP`

Main hook for registering MCP tools with full control over behavior and state.

```tsx
function useWebMCP<
  TInputSchema extends Record<string, z.ZodTypeAny>,
  TOutput = string
>(config: WebMCPConfig<TInputSchema, TOutput>): WebMCPReturn<TOutput>
```

#### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | ✓ | Unique tool identifier (e.g., 'posts_like') |
| `description` | `string` | ✓ | Human-readable description for AI |
| `inputSchema` | `Record<string, ZodType>` | - | Input validation using Zod schemas |
| `outputSchema` | `Record<string, ZodType>` | - | Output validation (optional) |
| `annotations` | `ToolAnnotations` | - | Metadata hints for the AI |
| `elicitation` | `ElicitationConfig` | - | User confirmation settings |
| `handler` | `(input) => Promise<TOutput>` | ✓ | Function that executes the tool |
| `formatOutput` | `(output) => string` | - | Custom output formatter |
| `onError` | `(error, input) => void` | - | Error handler callback |

#### Return Value

```tsx
interface WebMCPReturn<TOutput> {
  state: {
    isExecuting: boolean;      // Currently running
    lastResult: TOutput | null; // Last successful result
    error: Error | null;        // Last error
    executionCount: number;     // Total executions
  };
  execute: (input: unknown) => Promise<TOutput>; // Manual execution
  reset: () => void;            // Reset state
}
```

### `useWebMCPContext`

Simplified hook for read-only context exposure:

```tsx
function useWebMCPContext<T>(
  name: string,
  description: string,
  getValue: () => T
): WebMCPReturn<T>
```

---

# Part 2: Client API (Consuming Tools)

Use these hooks to connect to MCP servers and call their tools from your React app.

## Quick Start - Client

### Connecting to an MCP Server

```tsx
import { McpClientProvider, useMcpClient } from '@mcp-b/react-webmcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TabClientTransport } from '@mcp-b/transports';

// Create client and transport
const client = new Client({ name: 'MyApp', version: '1.0.0' });
const transport = new TabClientTransport('mcp', { clientInstanceId: 'my-app' });

function App() {
  return (
    <McpClientProvider client={client} transport={transport}>
      <ToolConsumer />
    </McpClientProvider>
  );
}

function ToolConsumer() {
  const { client, tools, isConnected, capabilities } = useMcpClient();

  const handleCallTool = async () => {
    const result = await client.callTool({
      name: 'posts_like',
      arguments: { postId: '123' }
    });
    console.log('Result:', result.content[0].text);
  };

  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Available Tools: {tools.length}</p>
      <ul>
        {tools.map(tool => (
          <li key={tool.name}>{tool.name} - {tool.description}</li>
        ))}
      </ul>
      <button onClick={handleCallTool} disabled={!isConnected}>
        Call Tool
      </button>
    </div>
  );
}
```

### Listening for Tool List Changes

```tsx
function ToolList() {
  const { tools, isConnected, capabilities } = useMcpClient();

  // Tools automatically update when server sends notifications
  // if capabilities.tools.listChanged is true

  return (
    <div>
      <h3>Tools ({tools.length})</h3>
      {capabilities?.tools?.listChanged && (
        <p>✓ Server supports real-time tool updates</p>
      )}
      {tools.map(tool => (
        <div key={tool.name}>
          <h4>{tool.name}</h4>
          <p>{tool.description}</p>
        </div>
      ))}
    </div>
  );
}
```

## Client API Reference

### `McpClientProvider`

Provider component that manages an MCP client connection.

```tsx
interface McpClientProviderProps {
  children: ReactNode;
  client: Client;           // MCP client instance
  transport: Transport;      // Transport for connection
  opts?: RequestOptions;     // Optional connection options
}
```

#### Example Transports

```tsx
// Connect to same-page MCP server (via @mcp-b/global)
import { TabClientTransport } from '@mcp-b/transports';
const transport = new TabClientTransport('mcp', { clientInstanceId: 'my-app' });

// Connect to Chrome extension MCP server
import { ExtensionClientTransport } from '@mcp-b/transports';
const transport = new ExtensionClientTransport({ portName: 'mcp' });

// In-memory connection (for testing)
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
```

### `useMcpClient`

Hook to access the MCP client context. Must be used within `McpClientProvider`.

```tsx
interface McpClientContextValue {
  client: Client;                        // MCP client instance
  tools: Tool[];                         // Available tools from server
  resources: Resource[];                 // Available resources
  isConnected: boolean;                  // Connection status
  isLoading: boolean;                    // Currently connecting
  error: Error | null;                   // Connection error
  capabilities: ServerCapabilities | null; // Server capabilities
  reconnect: () => Promise<void>;        // Manual reconnection
}
```

#### Calling Tools

```tsx
function MyComponent() {
  const { client, isConnected } = useMcpClient();

  const callTool = async () => {
    if (!isConnected) return;

    try {
      const result = await client.callTool({
        name: 'my_tool',
        arguments: { foo: 'bar' }
      });

      // Extract text from result
      const text = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      console.log(text);
    } catch (error) {
      console.error('Tool call failed:', error);
    }
  };

  return <button onClick={callTool}>Call Tool</button>;
}
```

---

# Complete Example: Both Provider and Client

This example shows a React app that both exposes tools AND consumes tools from an MCP server.

```tsx
import '@mcp-b/global'; // Provides navigator.modelContext
import { McpClientProvider, useWebMCP, useMcpClient } from '@mcp-b/react-webmcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TabClientTransport } from '@mcp-b/transports';
import { z } from 'zod';

// Create client to consume tools
const client = new Client({ name: 'MyApp', version: '1.0.0' });
const transport = new TabClientTransport('mcp', { clientInstanceId: 'my-app' });

function App() {
  return (
    <McpClientProvider client={client} transport={transport}>
      <ToolProvider />
      <ToolConsumer />
    </McpClientProvider>
  );
}

// Component that REGISTERS tools
function ToolProvider() {
  const [count, setCount] = useState(0);

  // Expose a tool that increments the counter
  useWebMCP({
    name: 'increment_counter',
    description: 'Increment the counter',
    inputSchema: {
      amount: z.number().default(1)
    },
    handler: async ({ amount }) => {
      setCount(prev => prev + amount);
      return { newValue: count + amount };
    }
  });

  return <div>Counter: {count}</div>;
}

// Component that CONSUMES tools
function ToolConsumer() {
  const { client, tools, isConnected } = useMcpClient();
  const [result, setResult] = useState('');

  const callIncrementTool = async () => {
    const res = await client.callTool({
      name: 'increment_counter',
      arguments: { amount: 5 }
    });
    setResult(res.content[0].text);
  };

  return (
    <div>
      <p>Available Tools: {tools.map(t => t.name).join(', ')}</p>
      <button onClick={callIncrementTool} disabled={!isConnected}>
        Call increment_counter Tool
      </button>
      {result && <p>Result: {result}</p>}
    </div>
  );
}
```

---

# Migration from @mcp-b/mcp-react-hooks

If you're migrating from the deprecated `@mcp-b/mcp-react-hooks` package:

## What Changed

- **Server providers removed**: `McpServerProvider` and `McpMemoryProvider` are gone
- **Everything in one package**: Both client and provider hooks are now in `@mcp-b/react-webmcp`
- **Tool registration**: Use `useWebMCP` instead of server providers
- **Client unchanged**: `McpClientProvider` and `useMcpClient` work the same way

## Migration Guide

### Before (mcp-react-hooks)

```tsx
import { McpClientProvider, useMcpClient } from '@mcp-b/mcp-react-hooks';
import { McpServerProvider, useMcpServer } from '@mcp-b/mcp-react-hooks';
```

### After (react-webmcp)

```tsx
// Client hooks - same API
import { McpClientProvider, useMcpClient } from '@mcp-b/react-webmcp';

// For registering tools, use useWebMCP instead of server providers
import { useWebMCP } from '@mcp-b/react-webmcp';
```

### Converting Server to Provider

**Before:**
```tsx
function MyApp() {
  const { registerTool } = useMcpServer();

  useEffect(() => {
    const tool = registerTool('my_tool', { description: '...' }, handler);
    return () => tool.remove();
  }, []);
}
```

**After:**
```tsx
function MyApp() {
  useWebMCP({
    name: 'my_tool',
    description: '...',
    handler: handler
  });
  // Auto-registers and cleans up on unmount
}
```

---

# Best Practices

### Tool Naming
- Use verb-noun format: `posts_like`, `graph_navigate`, `table_filter`
- Prefix with domain: `posts_`, `comments_`, `graph_`
- Be specific and descriptive

### Annotations
- Always set `readOnlyHint` (true for queries, false for mutations)
- Set `idempotentHint` (true if repeated calls are safe)
- Set `destructiveHint` for delete/permanent operations

### Error Handling
- Throw descriptive errors from tool handlers
- Use `onError` callback for side effects (logging, toasts)
- Handle connection errors in client components

### Performance
- Tools automatically prevent duplicate registration in React StrictMode
- Use `useWebMCPContext` for lightweight read-only data exposure
- Client automatically manages reconnection and tool list updates

## License

MIT

## Contributing

See the [main repository](https://github.com/WebMCP-org/WebMCP) for contribution guidelines.
