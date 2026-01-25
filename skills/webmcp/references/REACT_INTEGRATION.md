# React Integration Guide

For React, Vue, Next.js, and other modern frameworks, use the official `@mcp-b/react-webmcp` hooks.

## When to Use This

- You control the source code
- Building a React/Vue/Next.js/Remix app
- Want permanent MCP tools (not injection-based)
- Need type safety and proper integration

## Installation

```bash
npm install @mcp-b/react-webmcp @mcp-b/global
# or
pnpm add @mcp-b/react-webmcp @mcp-b/global
```

## Basic Setup

### 1. Initialize WebMCP (Root Layout)

```tsx
// app/layout.tsx or App.tsx
import '@mcp-b/global';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

### 2. Register Tools (Components)

```tsx
// components/UserProfile.tsx
import { useWebMCP } from '@mcp-b/react-webmcp';

export function UserProfile({ user }) {
  useWebMCP({
    name: 'get_user_profile',
    description: `Get current user profile. User: ${user.name}`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: JSON.stringify(user) }]
    })
  });

  return <div>{user.name}</div>;
}
```

## Hooks Reference

### useWebMCP

Register a single tool:

```tsx
useWebMCP({
  name: 'tool_name',
  description: 'What the tool does',
  inputSchema: { type: 'object', properties: {} },
  execute: async (params) => ({
    content: [{ type: 'text', text: 'Result' }]
  })
});
```

### useWebMCPTools (Multiple Tools)

Register multiple tools at once:

```tsx
useWebMCPTools([
  {
    name: 'get_items',
    description: 'Get all items',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ content: [{ type: 'text', text: JSON.stringify(items) }] })
  },
  {
    name: 'add_item',
    description: 'Add new item',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    },
    execute: async ({ name }) => {
      addItem(name);
      return { content: [{ type: 'text', text: `Added ${name}` }] };
    }
  }
]);
```

## Dynamic Descriptions

Update descriptions based on state:

```tsx
function TodoList({ todos }) {
  useWebMCP({
    name: 'get_todos',
    // Description updates when todos change
    description: `Get todos. Currently ${todos.length} items.`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: JSON.stringify(todos) }]
    })
  });

  return <ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul>;
}
```

## With React State

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  useWebMCPTools([
    {
      name: 'get_count',
      description: `Get current count. Value: ${count}`,
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: String(count) }]
      })
    },
    {
      name: 'increment',
      description: 'Increment the counter',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        setCount(c => c + 1);
        return { content: [{ type: 'text', text: 'Incremented' }] };
      }
    }
  ]);

  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

## With React Hook Form

```tsx
import { useForm } from 'react-hook-form';
import { useWebMCPForm } from '@mcp-b/mcp-react-hook-form';

function ContactForm() {
  const form = useForm({
    defaultValues: { name: '', email: '', message: '' }
  });

  useWebMCPForm({
    name: 'contact_form',
    description: 'Fill and submit the contact form',
    form
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register('name')} />
      <input {...form.register('email')} />
      <textarea {...form.register('message')} />
      <button type="submit">Send</button>
    </form>
  );
}
```

## Route-Aware Tools

Tools scoped to specific routes:

```tsx
// pages/products/[id].tsx
function ProductPage({ product }) {
  useWebMCP({
    name: 'get_product',
    description: `Get product details for "${product.name}"`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: JSON.stringify(product) }]
    })
  });

  // This tool only exists while on this page
  return <div>{product.name}</div>;
}
```

## Best Practices

### 1. Tool Lifecycle

Tools are automatically registered when component mounts and unregistered when it unmounts.

```tsx
// Tool exists only while component is mounted
function Dashboard() {
  useWebMCP({ name: 'dashboard_stats', ... });
  return <div>...</div>;
}
```

### 2. Avoid Stale Closures

Use refs or callbacks for latest values:

```tsx
function ItemList({ items }) {
  // items in handler will always be current
  useWebMCP({
    name: 'get_items',
    description: `Get items (${items.length} total)`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: JSON.stringify(items) }]
    })
  }, [items]); // Re-register when items change
}
```

### 3. Error Boundaries

Wrap MCP-enabled components:

```tsx
function App() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <MCPEnabledComponent />
    </ErrorBoundary>
  );
}
```

## Comparison: Hooks vs Injection

| Aspect | useWebMCP Hooks | inject_webmcp_script |
|--------|-----------------|----------------------|
| **Setup** | Add to source code | No code changes |
| **Persistence** | Permanent | Lost on navigation |
| **Type Safety** | Full TypeScript | None |
| **State Access** | Direct React state | DOM scraping |
| **Best For** | Your own apps | External sites |

## Testing with inject_webmcp_script

Even with hooks-based apps, you can use injection for rapid prototyping:

1. Build your app with react-webmcp
2. Run locally (localhost:3000)
3. Navigate to page
4. Use `inject_webmcp_script` to test NEW tools before adding to code
5. Once working, add proper useWebMCP hook

## Search Documentation

For more details:
```
mcp__docs__SearchWebMcpDocumentation("useWebMCP hook")
mcp__docs__SearchWebMcpDocumentation("react-webmcp")
```
