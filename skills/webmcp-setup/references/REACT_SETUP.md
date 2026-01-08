# React Setup Guide

Complete guide for integrating WebMCP into React applications using the `@mcp-b/react-webmcp` hooks.

## Prerequisites

- React 17, 18, or 19
- Node.js 16+
- npm, yarn, or pnpm

## Installation

### Step 1: Install Packages

```bash
# Using pnpm (recommended)
pnpm add @mcp-b/react-webmcp @mcp-b/global zod

# Using npm
npm install @mcp-b/react-webmcp @mcp-b/global zod

# Using yarn
yarn add @mcp-b/react-webmcp @mcp-b/global zod
```

### Step 2: Add Global Bridge Script

Add the global bridge script to your HTML file (usually `index.html` or `public/index.html`):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My React App</title>
  </head>
  <body>
    <div id="root"></div>

    <!-- Add this before closing </body> tag -->
    <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
  </body>
</html>
```

**Production tip**: Use a specific version instead of `@latest`:
```html
<script src="https://unpkg.com/@mcp-b/global@1.2.0/dist/index.global.js"></script>
```

## Basic Usage

### Minimal Example

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState } from 'react';

function App() {
  const [message, setMessage] = useState('Hello, WebMCP!');

  // Register a simple tool
  useWebMCP({
    name: 'set_message',
    description: 'Change the displayed message',
    inputSchema: {
      message: z.string().min(1).describe('New message to display')
    },
    handler: async ({ message }) => {
      setMessage(message);
      return { success: true };
    }
  });

  return <h1>{message}</h1>;
}
```

### With State Dependencies

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState, useMemo } from 'react';
import { z } from 'zod';

function Counter() {
  const [count, setCount] = useState(0);

  // Tool re-registers when count changes
  useWebMCP({
    name: 'get_count',
    description: `Get current count (currently: ${count})`,
    outputSchema: useMemo(() => ({
      count: z.number().describe('Current count value')
    }), []),
    handler: async () => ({ count })
  }, [count]); // <-- deps array

  useWebMCP({
    name: 'increment',
    description: 'Increment the counter',
    handler: async () => {
      setCount(c => c + 1);
      return { success: true, newCount: count + 1 };
    }
  });

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
```

## Input and Output Schemas

### Input Schema with Zod

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useMemo } from 'react';
import { z } from 'zod';

function UserForm() {
  const [user, setUser] = useState({ name: '', email: '' });

  const inputSchema = useMemo(() => ({
    name: z.string().min(1).max(50).describe('User full name'),
    email: z.string().email().describe('User email address'),
    age: z.number().int().positive().optional().describe('User age')
  }), []);

  useWebMCP({
    name: 'update_user',
    description: 'Update user information',
    inputSchema,
    handler: async ({ name, email, age }) => {
      // TypeScript knows the types!
      setUser({ name, email, age });
      return { success: true };
    }
  });
}
```

### Output Schema with Zod

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useMemo } from 'react';
import { z } from 'zod';

function UserProfile() {
  const [user] = useState({
    id: '123',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin'
  });

  const outputSchema = useMemo(() => ({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
      role: z.enum(['admin', 'user', 'guest'])
    }),
    lastUpdated: z.string()
  }), []);

  useWebMCP({
    name: 'get_user_profile',
    description: 'Get current user profile',
    outputSchema,
    handler: async () => ({
      user,
      lastUpdated: new Date().toISOString()
    })
  });
}
```

## The deps Array

The second parameter to `useWebMCP` is a dependency array (like `useEffect`). The tool re-registers when any dependency changes.

### When to Use Deps

```tsx
function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const todoCount = todos.length;
  const todoIds = todos.map(t => t.id).join(',');

  // Re-register when count or IDs change
  useWebMCP({
    name: 'list_todos',
    description: `List all todos (${todoCount} items)`,
    handler: async () => ({ todos, count: todoCount })
  }, [todoCount, todoIds]); // <-- deps array

  // Re-register when todos array changes
  useWebMCP({
    name: 'get_first_todo',
    description: 'Get the first todo item',
    handler: async () => ({
      todo: todos[0] || null
    })
  }, [todos]); // <-- deps array
}
```

### Best Practices for Deps

1. **Use primitive values**: `[count, id]` instead of `[{ count, id }]`
2. **Derive stable values**: `todoIds.join(',')` instead of `[todoIds]`
3. **Memoize objects**: Use `useMemo` for object deps
4. **Don't include callbacks**: Handler changes don't trigger re-registration

```tsx
// Good - primitive values
useWebMCP({ ... }, [count, userId]);

// Good - derived primitive
const itemIds = items.map(i => i.id).join(',');
useWebMCP({ ... }, [items.length, itemIds]);

// Bad - new object every render
useWebMCP({ ... }, [{ count }]); // Re-registers every render!

// Bad - array reference changes
useWebMCP({ ... }, [items]); // Re-registers when array changes
```

## Performance Optimization

### Memoize Schemas

**Always** memoize schemas to prevent unnecessary re-registrations:

```tsx
// ✅ Good: Memoized schema
const outputSchema = useMemo(() => ({
  count: z.number(),
  items: z.array(z.string())
}), []);

useWebMCP({
  name: 'get_data',
  outputSchema, // Stable reference
  handler: async () => ({ count: 10, items: [] })
});

// ❌ Bad: Inline schema (new object every render)
useWebMCP({
  name: 'get_data',
  outputSchema: {
    count: z.number(), // New object every render!
  },
  handler: async () => ({ count: 10 })
});
```

### Static Schemas Outside Component

Even better, define schemas outside the component:

```tsx
const OUTPUT_SCHEMA = {
  count: z.number(),
  items: z.array(z.string())
};

function MyComponent() {
  useWebMCP({
    name: 'get_data',
    outputSchema: OUTPUT_SCHEMA, // Always stable
    handler: async () => ({ count: 10, items: [] })
  });
}
```

### Stable Callbacks with useCallback

```tsx
function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const addTodo = useCallback((text: string) => {
    setTodos(prev => [...prev, { id: crypto.randomUUID(), text }]);
  }, []);

  const inputSchema = useMemo(() => ({
    text: z.string().min(1)
  }), []);

  useWebMCP({
    name: 'add_todo',
    description: 'Add a new todo item',
    inputSchema,
    handler: async ({ text }) => {
      addTodo(text);
      return { success: true };
    }
  });
}
```

## Real-World Examples

### Form Management

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState, useMemo } from 'react';
import { z } from 'zod';

function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const fillInputSchema = useMemo(() => ({
    name: z.string().optional(),
    email: z.string().email().optional(),
    message: z.string().optional()
  }), []);

  useWebMCP({
    name: 'fill_contact_form',
    description: 'Fill out the contact form fields',
    inputSchema: fillInputSchema,
    handler: async ({ name, email, message }) => {
      setFormData(prev => ({
        name: name ?? prev.name,
        email: email ?? prev.email,
        message: message ?? prev.message
      }));
      return { success: true };
    }
  });

  useWebMCP({
    name: 'submit_contact_form',
    description: 'Submit the contact form',
    handler: async () => {
      // Validate
      if (!formData.name || !formData.email) {
        return { success: false, error: 'Name and email required' };
      }

      // Submit
      await submitForm(formData);
      setSubmitted(true);

      return { success: true };
    }
  });

  const getFormOutputSchema = useMemo(() => ({
    formData: z.object({
      name: z.string(),
      email: z.string(),
      message: z.string()
    }),
    isValid: z.boolean()
  }), []);

  useWebMCP({
    name: 'get_form_data',
    description: 'Get current form data',
    outputSchema: getFormOutputSchema,
    handler: async () => ({
      formData,
      isValid: !!(formData.name && formData.email)
    })
  }, [formData.name, formData.email, formData.message]);

  return (
    <form onSubmit={e => { e.preventDefault(); submitForm(formData); }}>
      <input
        value={formData.name}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Name"
      />
      <input
        value={formData.email}
        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
        placeholder="Email"
      />
      <textarea
        value={formData.message}
        onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
        placeholder="Message"
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Data Table with Search

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState, useMemo } from 'react';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

function UserTable() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(u =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const listOutputSchema = useMemo(() => ({
    users: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string()
    })),
    totalCount: z.number()
  }), []);

  useWebMCP({
    name: 'list_users',
    description: `List users (${filteredUsers.length} of ${users.length})`,
    outputSchema: listOutputSchema,
    handler: async () => ({
      users: filteredUsers,
      totalCount: users.length
    })
  }, [filteredUsers.length, users.length]);

  const searchInputSchema = useMemo(() => ({
    query: z.string().describe('Search query')
  }), []);

  useWebMCP({
    name: 'search_users',
    description: 'Search for users by name',
    inputSchema: searchInputSchema,
    handler: async ({ query }) => {
      setSearchQuery(query);
      return { success: true, resultCount: filteredUsers.length };
    }
  });

  const updateUserInputSchema = useMemo(() => ({
    userId: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    role: z.string().optional()
  }), []);

  useWebMCP({
    name: 'update_user',
    description: 'Update user information',
    inputSchema: updateUserInputSchema,
    handler: async ({ userId, name, email, role }) => {
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, ...(name && { name }), ...(email && { email }), ...(role && { role }) }
          : u
      ));
      return { success: true };
    }
  });

  return (
    <div>
      <input
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search users..."
      />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Next.js Integration

### App Router (Next.js 13+)

Create a client component:

```tsx
// app/components/WebMCPTools.tsx
'use client';

import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState } from 'react';

export function WebMCPTools() {
  const [data, setData] = useState('');

  useWebMCP({
    name: 'update_data',
    description: 'Update the data',
    inputSchema: { data: z.string() },
    handler: async ({ data }) => {
      setData(data);
      return { success: true };
    }
  });

  return <div>{data}</div>;
}
```

Add to your layout:

```tsx
// app/layout.tsx
import { WebMCPTools } from './components/WebMCPTools';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js" />
      </head>
      <body>
        <WebMCPTools />
        {children}
      </body>
    </html>
  );
}
```

### Pages Router (Next.js 12 and earlier)

Add global bridge to `_document.tsx`:

```tsx
// pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```

Use tools in pages:

```tsx
// pages/index.tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState } from 'react';

export default function HomePage() {
  const [message, setMessage] = useState('');

  useWebMCP({
    name: 'set_message',
    description: 'Set the message',
    inputSchema: { message: z.string() },
    handler: async ({ message }) => {
      setMessage(message);
      return { success: true };
    }
  });

  return <h1>{message}</h1>;
}
```

## Testing

### Unit Testing Tools

```tsx
import { renderHook } from '@testing-library/react';
import { useWebMCP } from '@mcp-b/react-webmcp';

describe('useWebMCP', () => {
  it('registers a tool', () => {
    const { result } = renderHook(() =>
      useWebMCP({
        name: 'test_tool',
        description: 'Test tool',
        handler: async () => ({ success: true })
      })
    );

    // Tool is registered
    expect(window.webMCP.tools).toHaveProperty('test_tool');
  });

  it('calls handler', async () => {
    const handler = jest.fn().mockResolvedValue({ success: true });

    renderHook(() =>
      useWebMCP({
        name: 'test_tool',
        description: 'Test tool',
        handler
      })
    );

    await window.webMCP.tools.test_tool.handler({});

    expect(handler).toHaveBeenCalled();
  });
});
```

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions specific to React.

## Next Steps

- Explore [Tool Patterns](./TOOL_PATTERNS.md) for more examples
- Review [Performance](./PERFORMANCE.md) for optimization tips
- Check [Security](./SECURITY.md) for best practices
