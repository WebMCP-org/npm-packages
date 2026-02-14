# @mcp-b/react-webmcp - Advanced Guide

This guide covers advanced usage of `@mcp-b/react-webmcp`. For installation and quick start, see the [package README](../packages/react-webmcp/README.md).

## Table of Contents

- [Provider API Reference](#provider-api-reference)
- [Client API Reference](#client-api-reference)
- [Complete Example](#complete-example-both-provider-and-client)
- [Migration Guide](#migration-from-mcp-bmcp-react-hooks)
- [Best Practices](#best-practices)
- [FAQ](#frequently-asked-questions)
- [Comparison with Alternatives](#comparison-with-alternatives)

## Provider API Reference

### `useWebMCP`

Main hook for registering MCP tools with full control over behavior and state.

```tsx
function useWebMCP<
  TInputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
  TOutputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>
>(
  config: WebMCPConfig<TInputSchema, TOutputSchema>,
  deps?: DependencyList
): WebMCPReturn<TOutputSchema>
```

`InferOutput<TOutputSchema>` is the output type inferred from `outputSchema`.

#### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | Yes | Unique tool identifier (e.g., 'posts_like') |
| `description` | `string` | Yes | Human-readable description for AI |
| `inputSchema` | `Record<string, ZodType>` | - | Input validation using Zod schemas |
| `outputSchema` | `Record<string, ZodType>` | - | Output schema for structured responses (recommended) |
| `annotations` | `ToolAnnotations` | - | Metadata hints for the AI |
| `handler` | `(input) => Promise<TOutput>` | Yes | Function that executes the tool |
| `formatOutput` | `(output) => string` | - | Custom output formatter |
| `onSuccess` | `(result, input) => void` | - | Success callback |
| `onError` | `(error, input) => void` | - | Error handler callback |

#### Memoization and `deps` (important)

`useWebMCP` uses reference equality to decide when to re-register a tool. Inline objects/arrays/functions can cause constant re-registration.

Bad:
```tsx
useWebMCP({
  name: 'counter',
  description: `Count: ${count}`,
  outputSchema: { count: z.number() },
  handler: async () => ({ count }),
});
```

Good:
```tsx
const OUTPUT_SCHEMA = { count: z.number() };
const description = useMemo(() => `Count: ${count}`, [count]);

useWebMCP(
  {
    name: 'counter',
    description,
    outputSchema: OUTPUT_SCHEMA,
    handler: async () => ({ count }),
  },
  [count]
);
```

`deps` behaves like `useEffect` dependencies (reference comparison). Prefer primitive values or memoized objects to avoid unnecessary re-registrations.

`handler` is stored in a ref to avoid re-registration when it changes. If you memoize `handler` with stale dependencies, you'll still capture stale values.

#### Return Value

```tsx
interface WebMCPReturn<TOutputSchema> {
  state: {
    isExecuting: boolean;
    lastResult: InferOutput<TOutputSchema> | null;
    error: Error | null;
    executionCount: number;
  };
  execute: (input: unknown) => Promise<InferOutput<TOutputSchema>>;
  reset: () => void;
}
```

### `useWebMCPContext`

Simplified hook for read-only context exposure:

```tsx
function useWebMCPContext<T>(
  name: string,
  description: string,
  getValue: () => T
): WebMCPReturn
```

### Tool with Output Schema

Output schemas enable AI agents to return structured, type-safe responses:

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function ProductSearch() {
  const searchTool = useWebMCP({
    name: 'products_search',
    description: 'Search for products in the catalog',
    inputSchema: {
      query: z.string().describe('Search query'),
      maxResults: z.number().min(1).max(50).default(10),
      category: z.enum(['electronics', 'clothing', 'books']).optional(),
    },
    outputSchema: {
      products: z.array(z.object({
        id: z.string(), name: z.string(), price: z.number(), inStock: z.boolean(),
      })),
      total: z.number().describe('Total matching products'),
      hasMore: z.boolean(),
    },
    handler: async ({ query, maxResults, category }) => {
      const results = await api.products.search({ query, maxResults, category });
      return { products: results.items, total: results.totalCount, hasMore: results.totalCount > maxResults };
    },
    formatOutput: (result) => `Found ${result.total} products`,
  });

  return (
    <div>
      {searchTool.state.isExecuting && <Spinner />}
      {searchTool.state.lastResult && <p>Found {searchTool.state.lastResult.total} products</p>}
    </div>
  );
}
```

### Context Tool Example

Expose read-only context to AI:

```tsx
import { useWebMCPContext } from '@mcp-b/react-webmcp';

function PostDetailPage() {
  const { postId } = useParams();
  const { data: post } = useQuery(['post', postId], () => fetchPost(postId));

  useWebMCPContext(
    'context_current_post',
    'Get the currently viewed post ID and metadata',
    () => ({ postId, title: post?.title, author: post?.author, tags: post?.tags })
  );

  return <div>{/* Post UI */}</div>;
}
```

## Client API Reference

### `McpClientProvider`

Provider component that manages an MCP client connection.

```tsx
interface McpClientProviderProps {
  children: ReactNode;
  client: Client;
  transport: Transport;
  opts?: RequestOptions;
}
```

#### Example Transports

```tsx
// Same-page MCP server (via @mcp-b/global)
import { TabClientTransport } from '@mcp-b/transports';
const transport = new TabClientTransport('mcp', { clientInstanceId: 'my-app' });

// Chrome extension MCP server
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
  client: Client;
  tools: Tool[];
  resources: Resource[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  capabilities: ServerCapabilities | null;
  reconnect: () => Promise<void>;
}
```

#### Calling Tools

```tsx
function MyComponent() {
  const { client, isConnected } = useMcpClient();

  const callTool = async () => {
    if (!isConnected) return;
    try {
      const result = await client.callTool({ name: 'my_tool', arguments: { foo: 'bar' } });
      const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      console.log(text);
    } catch (error) {
      console.error('Tool call failed:', error);
    }
  };

  return <button onClick={callTool}>Call Tool</button>;
}
```

## Complete Example: Both Provider and Client

```tsx
import '@mcp-b/global';
import { McpClientProvider, useWebMCP, useMcpClient } from '@mcp-b/react-webmcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TabClientTransport } from '@mcp-b/transports';
import { z } from 'zod';

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

function ToolProvider() {
  const [count, setCount] = useState(0);

  useWebMCP({
    name: 'increment_counter',
    description: 'Increment the counter',
    inputSchema: { amount: z.number().default(1) },
    handler: async ({ amount }) => {
      setCount(prev => prev + amount);
      return { newValue: count + amount };
    }
  });

  return <div>Counter: {count}</div>;
}

function ToolConsumer() {
  const { client, tools, isConnected } = useMcpClient();
  const [result, setResult] = useState('');

  const callIncrementTool = async () => {
    const res = await client.callTool({ name: 'increment_counter', arguments: { amount: 5 } });
    setResult(res.content[0].text);
  };

  return (
    <div>
      <p>Available Tools: {tools.map(t => t.name).join(', ')}</p>
      <button onClick={callIncrementTool} disabled={!isConnected}>Call increment_counter</button>
      {result && <p>Result: {result}</p>}
    </div>
  );
}
```

## Migration from @mcp-b/mcp-react-hooks

### What Changed

- **Server providers removed**: `McpServerProvider` and `McpMemoryProvider` are gone
- **Everything in one package**: Both client and provider hooks are now in `@mcp-b/react-webmcp`
- **Tool registration**: Use `useWebMCP` instead of server providers
- **Client unchanged**: `McpClientProvider` and `useMcpClient` work the same way

### Before (mcp-react-hooks)

```tsx
import { McpClientProvider, useMcpClient } from '@mcp-b/mcp-react-hooks';
import { McpServerProvider, useMcpServer } from '@mcp-b/mcp-react-hooks';
```

### After (react-webmcp)

```tsx
import { McpClientProvider, useMcpClient } from '@mcp-b/react-webmcp';
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

## Best Practices

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

## Frequently Asked Questions

### What AI agents can use my React tools?

Any MCP-compatible client: Claude Desktop, ChatGPT (via plugins/GPTs), Cursor, VS Code Copilot, Gemini, Windsurf, Cline, and other MCP clients.

### How do AI agents connect to my React app?

Via browser extensions or the `@mcp-b/chrome-devtools-mcp` server, which bridges desktop AI clients to browser-based MCP tools.

### Can I use this with Next.js / Remix / Gatsby?

Yes. These hooks work with any React framework. Ensure `@mcp-b/global` is loaded on the client side.

### Can tools access React state?

Yes. Tool handlers have access to component state via closures. State updates trigger re-renders as expected.

## Comparison with Alternatives

| Feature | @mcp-b/react-webmcp | Raw MCP SDK | Custom Implementation |
|---------|---------------------|-------------|----------------------|
| React Lifecycle Integration | Automatic | Manual | Manual |
| StrictMode Support | Yes | N/A | Manual |
| Zod Schema Validation | Built-in | Manual | Manual |
| Execution State Tracking | Built-in | Manual | Manual |
| TypeScript Support | Full | Partial | Varies |
