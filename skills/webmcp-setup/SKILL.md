---
name: webmcp-setup
version: 1.0.0
description: Strategic guidance for adding WebMCP to web applications. Use when the user wants to make their web app AI-accessible, create LLM tools for their UI, or enable browser automation through MCP. Focuses on design principles, tool architecture, and testing workflow.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - mcp__docs__SearchWebMcpDocumentation
  - mcp__chrome-devtools__*
---

# WebMCP Setup - Creating an LLM UI

**Core Philosophy**: WebMCP is about creating a **user interface for LLMs**. Just as humans use buttons, forms, and navigation, LLMs use tools. Your goal is **UI parity** - enable everything a human can do, in a way that makes sense for LLMs.

## Quick Start

1. **Understand the app** - What actions can humans take?
2. **Plan tools** - List needed tools by category (read/write/destructive)
3. **Phase 1: Read** - Build read-only tools, test with Chrome DevTools MCP
4. **Phase 2: Modify** - Build read-write tools, test with Chrome DevTools MCP
5. **Phase 3: Act** - Build destructive tools, test with Chrome DevTools MCP
6. **Iterate** - Use the tools, find gaps, improve

**For installation**: See [references/INSTALLATION.md](references/INSTALLATION.md) or `mcp__docs__SearchWebMcpDocumentation("setup guide")`

## Quick Reference

| Phase | What You're Building | Tools to Use |
|-------|---------------------|--------------|
| **Understanding** | Learn WebMCP patterns | `mcp__docs__SearchWebMcpDocumentation` |
| **Planning** | Design tool architecture | This skill (you're reading it) |
| **Implementing** | Write tool code | `mcp__docs__SearchWebMcpDocumentation` for APIs |
| **Testing** | Dogfood every tool | `mcp__chrome-devtools__*` tools (requires Chrome Dev 145+ for auth testing) |
| **Iterating** | Refine based on usage | Chrome DevTools MCP + dogfooding |

## Success Criteria

✅ **Every major UI action has a corresponding tool**
- If a human can do it, the LLM should be able to do it
- UI parity achieved

✅ **Tools are categorized by safety**
- Read-only, read-write, and destructive tools clearly separated
- Annotations properly set

✅ **Forms use two-tool pattern**
- `fill_*_form` (read-write) + `submit_*_form` (destructive)
- User can see what's being submitted

✅ **All tools tested with Chrome DevTools MCP**
- Every tool has been called and verified
- Edge cases tested
- Return values validated

✅ **Tools are powerful, not granular**
- One tool does a complete task
- Minimizes number of tool calls needed

## Tool Design Principles

### 1. Categorize by Safety

Organize tools into three categories:

#### Read-Only Tools (`readOnlyHint: true`)
**Purpose**: Let the LLM understand the current state

**Characteristics**:
- No side effects
- Safe to call repeatedly
- Idempotent

**Examples**:
- `list_todos` - Get all todos with filtering
- `get_user_profile` - Get current user data
- `search_products` - Search product catalog
- `get_cart_contents` - See what's in cart

#### Read-Write Tools (default)
**Purpose**: Modify UI state in a non-destructive way

**Characteristics**:
- Changes what user sees on screen
- Reversible (user can undo)
- Does NOT commit/submit/save permanently
- User sees changes in real-time

**Examples**:
- `fill_contact_form` - Populate form fields (but don't submit)
- `set_search_query` - Change search box text (but don't search yet)
- `apply_filters` - Update filter selection (but don't reload data yet)
- `navigate_to_page` - Change page/tab (reversible with back button)

#### Destructive Tools (`destructiveHint: true`)
**Purpose**: Take permanent, irreversible actions

**Characteristics**:
- Commits changes permanently
- Submits forms, deletes data, makes purchases
- Requires careful use
- Should be separate from filling/preparation

**Examples**:
- `submit_order` - Actually place the order
- `delete_item` - Permanently remove item
- `send_message` - Send email/message
- `create_account` - Register new user

### 2. The Two-Tool Pattern for Forms

**CRITICAL PRINCIPLE**: Separate filling from submission

#### Bad Approach (Single Tool)
```tsx
// ❌ Don't do this
useWebMCP({
  name: 'submit_contact_form',
  destructiveHint: true, // Destructive from the start!
  inputSchema: {
    name: z.string(),
    email: z.string(),
    message: z.string()
  },
  handler: async ({ name, email, message }) => {
    // Fill AND submit in one go
    setName(name);
    setEmail(email);
    setMessage(message);
    await submitForm(); // User never sees what's being submitted!
    return { success: true };
  }
});
```

**Problems**:
- User doesn't see what's being submitted
- No chance to review or correct
- Single atomic action = risky

#### Good Approach (Two Tools)

```tsx
// ✅ Tool 1: Fill the form (read-write)
useWebMCP({
  name: 'fill_contact_form',
  description: 'Fill out the contact form fields',
  inputSchema: {
    name: z.string().optional(),
    email: z.string().optional(),
    message: z.string().optional()
  },
  handler: async ({ name, email, message }) => {
    // Only fill the fields, don't submit
    if (name) setName(name);
    if (email) setEmail(email);
    if (message) setMessage(message);
    return { success: true, filledFields: { name, email, message } };
  }
});

// ✅ Tool 2: Submit the form (destructive)
useWebMCP({
  name: 'submit_contact_form',
  destructiveHint: true,
  description: 'Submit the contact form',
  handler: async () => {
    if (!name || !email) {
      return { success: false, error: 'Name and email required' };
    }
    await submitForm();
    return { success: true, message: 'Form submitted' };
  }
});
```

**Benefits**:
- User sees form get filled on screen
- Separate tool call = explicit intent
- Can fill, review, then submit
- If submission fails, form is already filled

### 3. UI Parity - Match Human Capabilities

**Mental Model**: For every major action a human can take in your UI, create a corresponding tool.

**Audit Process**:
1. Open your app as a human user
2. List all major actions you can take
3. For each action, create a tool

**Example Audit - Todo App**:
- Human can: View todos → Tool: `list_todos`
- Human can: Add todo → Tools: `fill_todo_form`, `create_todo`
- Human can: Mark complete → Tool: `mark_todo_complete`
- Human can: Delete todo → Tool: `delete_todo`
- Human can: Filter todos → Tool: `set_filter`

**UI Parity Achieved**: LLM can do everything a human can do.

### 4. Make Tools Powerful, Not Granular

**Principle**: One tool should accomplish a complete task, not just one tiny piece.

#### Too Granular (Bad)
```tsx
// ❌ User needs 3 tool calls to fill a form
useWebMCP({ name: 'set_name', ... });
useWebMCP({ name: 'set_email', ... });
useWebMCP({ name: 'set_message', ... });
```

**Problems**: 3 tool calls instead of 1, inefficient, poor UX

#### Powerful (Good)
```tsx
// ✅ One tool call fills entire form
useWebMCP({
  name: 'fill_contact_form',
  inputSchema: {
    name: z.string().optional(),
    email: z.string().optional(),
    message: z.string().optional()
  },
  handler: async ({ name, email, message }) => {
    // Fill all fields at once
    if (name) setName(name);
    if (email) setEmail(email);
    if (message) setMessage(message);
    return { success: true };
  }
});
```

**Benefits**: 1 tool call, faster execution, better UX

## Advanced Patterns & Best Practices

For detailed patterns that significantly impact tool quality, see:

**[references/ADVANCED_PATTERNS.md](references/ADVANCED_PATTERNS.md)** - Covers:
- Tool naming conventions (`domain_verb_noun`)
- Complete annotation system (readOnlyHint, idempotentHint, destructiveHint)
- Avoiding tool overload (>50 tools)
- outputSchema vs formatOutput
- Error handling with onError
- Confirmation dialogs for destructive actions
- Performance optimization
- Tool cleanup and memory management
- Import order requirements
- React StrictMode handling
- Hot Module Replacement (HMR) support

**When to read**: After understanding core principles, before implementing complex tools.

**Always search docs for specifics**: `mcp__docs__SearchWebMcpDocumentation("your question")`

## React WebMCP Hooks - Best Practices

When using `@mcp-b/react-webmcp` hooks, follow these patterns for optimal performance and reliability.

### The Three Hooks

**`useWebMCP`** - Main hook for registering tools with full control
```tsx
const tool = useWebMCP({
  name: 'posts_like',
  description: 'Like a post by ID',
  inputSchema: { postId: z.string().uuid() },
  outputSchema: { success: z.boolean(), likeCount: z.number() },
  handler: async ({ postId }) => {
    await api.posts.like(postId);
    return { success: true, likeCount: 42 };
  }
});
```

**`useWebMCPContext`** - Simplified hook for read-only context exposure
```tsx
useWebMCPContext(
  'context_current_post',
  'Get the currently viewed post ID and metadata',
  () => ({ postId, title: post?.title, author: post?.author })
);
```

**`useWebMCPResource`** - Hook for exposing MCP resources (files, data streams)
```tsx
const { isRegistered } = useWebMCPResource({
  uri: 'user://{userId}/profile',
  name: 'User Profile',
  description: 'User profile data by ID',
  mimeType: 'application/json',
  read: async (uri, params) => {
    const profile = await fetchUserProfile(params?.userId);
    return { contents: [{ uri: uri.href, text: JSON.stringify(profile) }] };
  }
});
```

### Critical: Always Use Output Schemas

**Output schemas are MANDATORY for modern WebMCP integrations**. They enable:
- AI providers to compile schemas to TypeScript
- Type-safe code generation by AI
- Structured responses that AI can reason about
- Better validation and error handling

```tsx
// ❌ BAD: No output schema (AI gets untyped text)
useWebMCP({
  name: 'get_users',
  description: 'List users',
  handler: async () => {
    return { users: [...] };  // AI receives text blob
  }
});

// ✅ GOOD: With output schema (AI gets typed structure)
const OUTPUT_SCHEMA = {
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email()
  })),
  total: z.number()
};

useWebMCP({
  name: 'get_users',
  description: 'List users',
  outputSchema: OUTPUT_SCHEMA,  // AI receives structuredContent
  handler: async () => ({
    users: await api.users.list(),
    total: 10
  })
});
```

**Why this matters**:
- Without `outputSchema`: AI receives `CallToolResult.content[0].text` (string)
- With `outputSchema`: AI receives `CallToolResult.structuredContent` (typed object)
- Modern AI models expect structured data for code generation

### Performance: Memoize Schemas

**Schemas must be stable references** or tools will re-register on every render.

```tsx
// ❌ BAD: New object every render → re-registers constantly
useWebMCP({
  name: 'get_count',
  outputSchema: { count: z.number() },  // New object!
  handler: async () => ({ count: 10 })
});

// ✅ GOOD: Memoized schema → stable reference
const OUTPUT_SCHEMA = useMemo(() => ({
  count: z.number(),
  items: z.array(z.string())
}), []);

useWebMCP({
  name: 'get_count',
  outputSchema: OUTPUT_SCHEMA,  // Stable reference
  handler: async () => ({ count: 10, items: [] })
});

// ✅ BEST: Static schema outside component
const OUTPUT_SCHEMA = {
  count: z.number(),
  items: z.array(z.string())
};

function MyComponent() {
  useWebMCP({
    name: 'get_count',
    outputSchema: OUTPUT_SCHEMA,  // Always stable
    handler: async () => ({ count: 10, items: [] })
  });
}
```

**What gets memoized**:
- `inputSchema` - Always memoize or define outside component
- `outputSchema` - Always memoize or define outside component
- `annotations` - Always memoize or define outside component

**What does NOT need memoization**:
- `handler` - Stored in a ref, changes don't trigger re-registration
- `onSuccess` / `onError` - Stored in refs
- `formatOutput` - Stored in a ref

### The deps Array

Use the second parameter to control when tools re-register:

```tsx
function TodoList({ todos }: { todos: Todo[] }) {
  const todoCount = todos.length;
  const todoIds = todos.map(t => t.id).join(',');

  // Re-register when count or IDs change
  useWebMCP(
    {
      name: 'list_todos',
      description: `List all todos (${todoCount} items)`,
      outputSchema: OUTPUT_SCHEMA,
      handler: async () => ({ todos, count: todoCount })
    },
    [todoCount, todoIds]  // ← deps array
  );
}
```

**Best practices for deps**:
- Use **primitive values**: `[count, id]` not `[{ count, id }]`
- **Derive stable values**: `items.map(i => i.id).join(',')` not `[items]`
- **Don't include callbacks**: Handler changes don't need re-registration
- **Memoize objects/arrays**: Use `useMemo` if you must include them

```tsx
// ✅ GOOD: Primitive values
useWebMCP({ ... }, [count, userId]);

// ✅ GOOD: Derived primitive
const itemIds = items.map(i => i.id).join(',');
useWebMCP({ ... }, [items.length, itemIds]);

// ❌ BAD: New object every render
useWebMCP({ ... }, [{ count }]);  // Re-registers every render!

// ❌ BAD: Array reference changes
useWebMCP({ ... }, [items]);  // Re-registers when array changes
```

### React Forms: The Two-Tool Pattern

Follow the same two-tool pattern (fill + submit) with React state:

```tsx
function ContactForm() {
  const [formData, setFormData] = useState({
    name: '', email: '', message: ''
  });

  // Tool 1: Fill form (read-write, user sees changes)
  const FILL_SCHEMA = useMemo(() => ({
    name: z.string().optional(),
    email: z.string().email().optional(),
    message: z.string().optional()
  }), []);

  useWebMCP({
    name: 'fill_contact_form',
    description: 'Fill out contact form fields',
    inputSchema: FILL_SCHEMA,
    annotations: {
      title: 'Fill Contact Form',
      readOnlyHint: false,
      destructiveHint: false
    },
    handler: async ({ name, email, message }) => {
      setFormData(prev => ({
        name: name ?? prev.name,
        email: email ?? prev.email,
        message: message ?? prev.message
      }));
      return { success: true };
    }
  });

  // Tool 2: Submit form (destructive, permanent action)
  const SUBMIT_OUTPUT_SCHEMA = useMemo(() => ({
    success: z.boolean(),
    error: z.string().optional()
  }), []);

  useWebMCP({
    name: 'submit_contact_form',
    description: 'Submit the contact form',
    outputSchema: SUBMIT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Submit Contact Form',
      destructiveHint: true
    },
    handler: async () => {
      if (!formData.name || !formData.email) {
        return { success: false, error: 'Name and email required' };
      }
      await submitForm(formData);
      return { success: true };
    }
  });

  // Tool 3: Read current form state (read-only)
  const READ_OUTPUT_SCHEMA = useMemo(() => ({
    formData: z.object({
      name: z.string(),
      email: z.string(),
      message: z.string()
    }),
    isValid: z.boolean()
  }), []);

  useWebMCP({
    name: 'get_form_data',
    description: 'Get current contact form data',
    outputSchema: READ_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true },
    handler: async () => ({
      formData,
      isValid: !!(formData.name && formData.email)
    })
  }, [formData.name, formData.email, formData.message]);

  return <form>{/* UI */}</form>;
}
```

### Context Exposure with useWebMCPContext

Use `useWebMCPContext` for lightweight read-only data:

```tsx
function PostDetailPage() {
  const { postId } = useParams();
  const { data: post } = useQuery(['post', postId], () => fetchPost(postId));

  // Expose current context to AI
  useWebMCPContext(
    'context_current_post',
    'Get the currently viewed post ID and metadata',
    () => ({
      postId,
      title: post?.title,
      author: post?.author,
      tags: post?.tags,
      createdAt: post?.createdAt
    })
  );

  return <PostContent post={post} />;
}
```

**When to use `useWebMCPContext` vs `useWebMCP`**:
- Use `useWebMCPContext` for simple read-only context (current page, user session)
- Use `useWebMCP` when you need `outputSchema` for structured responses
- Use `useWebMCP` when you need execution state tracking or callbacks

### Tool Execution State

`useWebMCP` returns execution state for UI feedback:

```tsx
function LikeButton({ postId }: { postId: string }) {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post',
    inputSchema: { postId: z.string() },
    outputSchema: {
      success: z.boolean(),
      likeCount: z.number()
    },
    handler: async ({ postId }) => {
      const result = await api.posts.like(postId);
      return { success: true, likeCount: result.likes };
    },
    onSuccess: () => {
      toast.success('Post liked!');
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    }
  });

  return (
    <button onClick={() => likeTool.execute({ postId })}>
      {likeTool.state.isExecuting && <Spinner />}
      {likeTool.state.lastResult && (
        <span>♥ {likeTool.state.lastResult.likeCount}</span>
      )}
      {likeTool.state.error && <span>Error</span>}
    </button>
  );
}
```

### Testing React Tools with Chrome DevTools MCP

See the Chrome DevTools MCP setup section below for how to test React tools with auto-connect to preserve authentication.

**Key workflow**:
1. Start your React dev server (`npm run dev`)
2. Open Chrome Dev browser
3. Log into your app (create account, navigate to test page, etc.)
4. Launch Chrome DevTools MCP with auto-connect (preserves cookies/auth)
5. Call tools via MCP client to test them
6. Verify UI updates in browser
7. Check return values match `outputSchema`

**Why this matters for React**:
- React hooks register tools on component mount
- Chrome DevTools MCP can call those tools from outside the browser
- Auto-connect preserves your authenticated session
- Perfect for testing authenticated React apps

### Common React Patterns

**Pattern 1: Todo List with Filtering**
```tsx
function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      if (filter === 'all') return true;
      if (filter === 'active') return !t.completed;
      return t.completed;
    });
  }, [todos, filter]);

  // Phase 1: Read tools
  const LIST_OUTPUT_SCHEMA = useMemo(() => ({
    todos: z.array(z.object({
      id: z.string(),
      text: z.string(),
      completed: z.boolean()
    })),
    count: z.number(),
    filter: z.enum(['all', 'active', 'completed'])
  }), []);

  useWebMCP({
    name: 'list_todos',
    description: `List todos (${filteredTodos.length} of ${todos.length})`,
    outputSchema: LIST_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true },
    handler: async () => ({
      todos: filteredTodos,
      count: todos.length,
      filter
    })
  }, [filteredTodos.length, todos.length, filter]);

  // Phase 2: Write tools
  useWebMCP({
    name: 'set_filter',
    description: 'Change todo filter',
    inputSchema: {
      filter: z.enum(['all', 'active', 'completed'])
    },
    handler: async ({ filter }) => {
      setFilter(filter);
      return { success: true };
    }
  });

  // Phase 3: Destructive tools
  const CREATE_OUTPUT_SCHEMA = useMemo(() => ({
    success: z.boolean(),
    todo: z.object({
      id: z.string(),
      text: z.string(),
      completed: z.boolean()
    })
  }), []);

  useWebMCP({
    name: 'create_todo',
    description: 'Create a new todo',
    inputSchema: { text: z.string().min(1) },
    outputSchema: CREATE_OUTPUT_SCHEMA,
    annotations: { destructiveHint: true },
    handler: async ({ text }) => {
      const newTodo = { id: crypto.randomUUID(), text, completed: false };
      setTodos(prev => [...prev, newTodo]);
      return { success: true, todo: newTodo };
    }
  });

  useWebMCP({
    name: 'toggle_todo',
    description: 'Toggle todo completion status',
    inputSchema: { todoId: z.string() },
    annotations: { destructiveHint: true },
    handler: async ({ todoId }) => {
      setTodos(prev => prev.map(t =>
        t.id === todoId ? { ...t, completed: !t.completed } : t
      ));
      return { success: true };
    }
  });

  return <div>{/* UI */}</div>;
}
```

**Pattern 2: Search with Debouncing**
```tsx
function ProductSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        api.products.search(query).then(setResults);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const SEARCH_OUTPUT_SCHEMA = useMemo(() => ({
    products: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number()
    })),
    total: z.number()
  }), []);

  useWebMCP({
    name: 'search_products',
    description: 'Search for products',
    inputSchema: { query: z.string() },
    outputSchema: SEARCH_OUTPUT_SCHEMA,
    handler: async ({ query }) => {
      setQuery(query);
      // Results update via useEffect debouncing
      return { products: results, total: results.length };
    }
  });

  return <div>{/* UI */}</div>;
}
```

### React-Specific Gotchas

**1. StrictMode Double Rendering**
- React hooks handle StrictMode automatically
- Tools only register once even with double render
- No manual deduplication needed

**2. Hot Module Replacement (HMR)**
- Tools automatically unregister on component unmount
- New tool versions register on remount
- Works seamlessly with Vite, Webpack, etc.

**3. Async State Updates**
- React state updates are async
- Handler returns immediately after `setState`
- Don't wait for state to update before returning

```tsx
// ❌ BAD: Trying to read updated state
useWebMCP({
  name: 'increment',
  handler: async () => {
    setCount(c => c + 1);
    return { newCount: count };  // Returns OLD value!
  }
});

// ✅ GOOD: Calculate new value directly
useWebMCP({
  name: 'increment',
  handler: async () => {
    const newCount = count + 1;
    setCount(newCount);
    return { newCount };  // Returns correct value
  }
});
```

**4. Memory Leaks**
- React hooks auto-cleanup on unmount
- State updates after unmount are prevented
- No manual cleanup needed

### Framework Integration

**Next.js App Router**
```tsx
// app/components/Tools.tsx
'use client';
import { useWebMCP } from '@mcp-b/react-webmcp';

export function WebMCPTools() {
  useWebMCP({ /* ... */ });
  return null;  // Can be invisible component
}

// app/layout.tsx
import { WebMCPTools } from './components/Tools';

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

**Remix**
```tsx
// app/root.tsx
import { useWebMCP } from '@mcp-b/react-webmcp';

export default function App() {
  useWebMCP({ /* ... */ });

  return (
    <html>
      <head>
        <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js" />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}
```

### Quick Checklist for React Tools

Before testing with Chrome DevTools MCP:

✅ **Output schemas defined** for all tools (use `useMemo` or static const)
✅ **Schemas are memoized** or static (not inline objects)
✅ **deps array used correctly** (primitives, no objects/functions)
✅ **Forms use two-tool pattern** (fill + submit separated)
✅ **Annotations set properly** (readOnlyHint, destructiveHint)
✅ **State updates are sync** (don't wait for async setState)
✅ **Error handling in place** (try/catch in handlers)

For detailed React setup: `mcp__docs__SearchWebMcpDocumentation("react setup")`

## Common App Patterns

See **[examples/COMMON_APPS.md](examples/COMMON_APPS.md)** for complete tool structures for:
- Todo List App
- E-Commerce Site
- Admin Dashboard
- Social Media Platform
- Project Management Tool

Each pattern shows the full tool hierarchy (read → write → destructive) with specific examples.

## Implementation Strategy

### Phase 1: Read the World (Read-Only Tools)

**Goal**: Give the LLM eyes. Let it understand what's on screen.

**What to build**:
1. **List tools** - Get collections of items
   - `list_todos`, `list_products`, `list_users`

2. **Get tools** - Get specific item details
   - `get_todo_by_id`, `get_product_details`, `get_user_profile`

3. **Search tools** - Find specific information
   - `search_products`, `search_logs`, `search_messages`

4. **Status tools** - Get current application state
   - `get_cart_contents`, `get_current_filters`, `get_theme`

**Why first?**:
- LLM needs context before taking actions
- Safest to implement and test
- Builds your confidence with WebMCP
- No risk of breaking anything

**Testing**:
```bash
# For each read-only tool:
1. Call the tool
2. Verify returned data matches what's on screen
3. Call again - should get same data (idempotent)
4. Try different parameters (filters, IDs)
5. Check edge cases (empty lists, invalid IDs)
```

### Phase 2: Modify UI (Read-Write Tools)

**Goal**: Let the LLM interact with the UI without permanent consequences.

**What to build**:
1. **Fill tools** - Populate forms (but don't submit)
   - `fill_contact_form`, `fill_checkout_form`, `fill_profile_form`

2. **Set tools** - Change UI state
   - `set_filter`, `set_search_query`, `set_theme`, `set_language`

3. **Navigate tools** - Move between pages
   - `navigate_to_page`, `open_modal`, `switch_tab`

**Why second?**:
- Gives LLM agency without risk
- User sees changes in real-time
- Reversible (user can undo)
- Builds trust

**Testing**:
```bash
# For each read-write tool:
1. Call the tool with test data
2. Verify changes appear on screen immediately
3. Check that nothing permanent happened
4. Try edge cases (empty values, invalid values)
5. Verify error handling works
```

**Dogfooding**: Actually use these tools yourself via Chrome DevTools MCP. If it's tedious or confusing for you, it'll be worse for the LLM.

### Phase 3: Take Action (Destructive Tools)

**Goal**: Let the LLM make permanent changes and complete workflows.

**What to build**:
1. **Submit tools** - Actually commit forms
   - `submit_contact_form`, `submit_order`, `submit_profile_update`

2. **Create tools** - Add new records
   - `create_todo`, `create_user`, `create_post`

3. **Delete tools** - Remove items permanently
   - `delete_todo`, `delete_user`, `delete_post`

4. **Action tools** - Other permanent state changes
   - `mark_complete`, `send_message`, `publish_post`

**Why last?**:
- Most risky
- Requires phases 1-2 to be solid
- Build confidence first
- Easier to test when you can inspect state

**Testing**:
```bash
# For each destructive tool:
1. Use Phase 2 tools to set up state (fill forms, etc.)
2. Call the destructive tool
3. Verify action completed successfully
4. Check for confirmation dialogs (if any)
5. Use Phase 1 tools to verify new state
6. Test error cases (invalid IDs, missing data)
7. Test what happens when user cancels/rejects
```

## Critical: Dogfooding with Chrome DevTools MCP

**MOST IMPORTANT PART**: You MUST test every tool with Chrome DevTools MCP.

### Why Dogfooding Matters

**You are building an interface**. Just like you'd manually test a button to see if it works, you must manually test each tool.

**If you don't test**:
- Tools might not work at all
- Return values might be wrong
- Edge cases will be broken
- User experience will be poor

**If you DO test**:
- You'll catch bugs immediately
- You'll see what the LLM experiences
- You'll find confusing APIs and fix them
- You'll build intuition for good tool design

### Dogfooding Workflow

**Prerequisites**: Set up Chrome DevTools MCP with Chrome Dev 145+ for best testing experience. See [Setting Up Chrome DevTools MCP for Testing](#setting-up-chrome-devtools-mcp-for-testing) below for configuration details.

For **EVERY tool you create**:

1. **Register the tool** in your app code
2. **Start your dev server** (`npm run dev`)
3. **Open Chrome DevTools MCP** (if not already running)
4. **Navigate to your app** in Chrome DevTools MCP
5. **Call the tool** via Chrome DevTools MCP
6. **Verify the behavior** in the actual browser
7. **Check the return value** from the tool
8. **Try edge cases** (empty inputs, invalid IDs, etc.)
9. **Iterate** - fix issues and test again

**Repeat this for every single tool**. No exceptions.

### The Build-Test-Iterate Loop

**This is TDD (Test-Driven Development) for AI tools**. The tight feedback cycle with Chrome DevTools MCP enables rapid iteration:

```
AI writes tool code
      ↓
Dev server hot-reloads (instant)
      ↓
AI navigates to page via Chrome DevTools MCP
      ↓
AI calls list_webmcp_tools (discovers new tool)
      ↓
AI calls the tool with test inputs
      ↓
Does it work correctly?
  ├─ Yes → Done! Move to next tool
  └─ No → Fix the code, loop back to top
```

**Why this is powerful**:
- **Instant feedback**: HMR means changes appear immediately
- **Real testing**: Tools are called in actual browser context
- **Self-verification**: AI can verify its own work
- **Rapid iteration**: Fix → test → verify in seconds

**Example workflow**:
```bash
Agent: "I'll create a search_products tool"
1. Agent writes tool code using useWebMCP
2. Vite dev server hot-reloads (< 1 second)
3. Agent: mcp__chrome-devtools__navigate("http://localhost:3000")
4. Agent: mcp__chrome-devtools__list_webmcp_tools
   → Sees "search_products" in the list ✓
5. Agent: mcp__chrome-devtools__call_webmcp_tool("search_products", { query: "laptop" })
   → Returns: { products: [...], count: 5 } ✓
6. Agent verifies results match expectation
7. Tool works! Move on.
```

**If something breaks**:
```bash
Agent: "The tool returned undefined instead of products array"
1. Agent examines the code
2. Agent: "I see the issue - missing return statement"
3. Agent fixes the code
4. Dev server reloads automatically
5. Agent calls the tool again
6. Now it works! ✓
```

This **build-test-iterate loop** is why Chrome DevTools MCP integration is so critical. It turns tool development into an interactive, self-correcting process.

### Example Dogfooding Session

Let's say you're building a todo app. Here's what testing looks like:

```bash
# You've just added the 'create_todo' tool
# Now test it:

1. Start dev server: npm run dev
2. Chrome DevTools MCP is already connected to localhost:3000
3. Call the tool:
   mcp__chrome-devtools__* → call tool 'create_todo'
   Input: { "text": "Test todo", "priority": "high" }

4. Look at browser → New todo appears on screen ✅
5. Check return value → { success: true, id: "abc123" } ✅
6. Call list_todos → New todo is in the list ✅

7. Try edge case: { "text": "", "priority": "invalid" }
8. Check error handling → Got clear error message ✅

9. Todo works! Move to next tool.
```

**This is NOT optional**. Every tool must be dogfooded.

### Common Issues Found During Dogfooding

You'll discover:
- "This tool should return the new todo, not just success:true"
- "The description doesn't match what the tool actually does"
- "I need a get_todo_by_id tool to verify the create worked"
- "This should be two tools - one to fill, one to submit"
- "The error message is confusing"
- "This tool is too granular, I need to call it 5 times"

**Fix these immediately**. Dogfooding gives you this feedback.

### Setting Up Chrome DevTools MCP for Testing

To dogfood WebMCP tools effectively, you need Chrome DevTools MCP properly configured. Here's how to set it up for optimal testing workflow:

#### Chrome Version Requirements

**Auto-Connect Feature Requires Chrome 145+**

The auto-connect feature (connects to running Chrome with your cookies/auth) requires:
- ✅ **Chrome Dev** (v145+) - Available NOW, recommended for testing
- ✅ **Chrome Canary** (v146+) - Bleeding edge, may be unstable
- ❌ **Chrome Stable** (v143) - Does NOT support auto-connect yet (coming Feb 2026)
- ❌ **Chrome Beta** (v144) - Does NOT support auto-connect yet

**Check your Chrome version:**
```bash
# Mac
/Applications/Google\ Chrome\ Dev.app/Contents/MacOS/Google\ Chrome\ Dev --version

# Should show: Google Chrome 145.x.x.x dev
```

#### Configuration for Testing (Recommended)

**Option 1: Auto-Connect to Running Chrome (Best for Testing)**

Use this when:
- ✅ Testing with authenticated sessions (logged-in user)
- ✅ Need browser cookies/localStorage from your dev session
- ✅ Want to reuse existing browser profile with extensions
- ✅ Testing WebMCP tools that require auth

**MCP Config:**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest"]
    }
  }
}
```

**What it does:**
1. Tries to connect to running Chrome Dev with your profile
2. Falls back to launching new Chrome Dev if not running
3. Preserves cookies, auth tokens, localStorage
4. Perfect for testing authenticated apps

**Option 2: Always Launch Fresh Instance (Headless Testing)**

Use this when:
- Testing without auth requirements
- CI/CD pipelines
- Clean slate needed for each test

**MCP Config:**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--no-auto-connect",
        "--isolated"
      ]
    }
  }
}
```

**Option 3: Chrome Stable (No Auto-Connect)**

If you don't have Chrome Dev/Canary installed:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--channel=stable",
        "--no-auto-connect"
      ]
    }
  }
}
```

**Note:** This launches fresh Chrome Stable each time (no preserved auth).

#### Typical Testing Workflow

**For apps requiring authentication:**

1. **Start your dev server**
   ```bash
   npm run dev  # Your app runs on localhost:3000
   ```

2. **Open Chrome Dev manually**
   - Navigate to localhost:3000
   - Log in to your app
   - Chrome DevTools MCP auto-connects to this session

3. **Test tools with your auth session**
   ```bash
   # In your MCP client (Claude, Cursor, etc.)
   "List the WebMCP tools on localhost:3000"
   → Uses your logged-in session
   → Tools see your cookies/auth
   → Can test authenticated endpoints
   ```

**For apps without auth:**
- Just use default config
- Chrome DevTools MCP will launch Chrome Dev automatically
- Navigate to your app and test

#### Why Auto-Connect Matters for Testing

**Without auto-connect (old way):**
- Chrome DevTools MCP launches new browser instance
- No cookies, no auth, no browser state
- Can't test authenticated features
- Have to log in manually every time

**With auto-connect (Chrome 145+):**
- Uses your existing Chrome Dev session
- Preserves cookies, localStorage, auth tokens
- Test authenticated tools immediately
- Reuses browser profile with extensions

**Example: Testing a Todo App with Auth**
```bash
# Your workflow:
1. Open Chrome Dev, navigate to localhost:3000
2. Log in to your todo app
3. Add a todo manually (now you have data)

# Now test tools:
4. "List all WebMCP tools on this page"
   → list_webmcp_tools shows your todos tools
5. "Call the list_todos tool"
   → Returns todos from your logged-in session
6. "Create a new todo with text 'Test from AI'"
   → create_todo works with your auth session
7. Verify todo appears on screen
```

Without auto-connect, step 2 wouldn't work - you'd have to re-authenticate every time.

## Using Available Resources

You have powerful tools at your disposal:

### WebMCP Docs MCP (`mcp__docs__SearchWebMcpDocumentation`)

**Use this for**:
- API syntax: "How do I use outputSchema in useWebMCP?"
- Best practices: "WebMCP tool naming conventions"
- Examples: "WebMCP form filling example"
- Troubleshooting: "Why is my tool not re-registering?"

**Example queries**:
```bash
mcp__docs__SearchWebMcpDocumentation("useWebMCP deps array")
mcp__docs__SearchWebMcpDocumentation("outputSchema with Zod")
mcp__docs__SearchWebMcpDocumentation("tool annotations destructiveHint")
```

### Chrome DevTools MCP (`mcp__chrome-devtools__*`)

**Use this for**:
- Testing tools: Call them and verify behavior
- Inspecting state: Read the page to see what's there
- Debugging: Take screenshots, check console logs
- Verification: Make sure tools work end-to-end

**This is your testing environment**. Use it constantly.

### This Skill (Strategic Guidance)

**Use this for**:
- Tool design principles
- Implementation phases
- Testing workflow
- Strategic decisions

**Don't use this for**:
- Specific API syntax (use WebMCP Docs MCP)
- Debugging (use Chrome DevTools MCP)
- Implementation details (use WebMCP Docs MCP)

## Workflow Summary

1. **Understand the app** - What can humans do?
2. **Plan tools** - List all needed tools by category
3. **Phase 1: Read** - Build read-only tools
   - Test each with Chrome DevTools MCP
4. **Phase 2: Modify** - Build read-write tools
   - Test each with Chrome DevTools MCP
   - Dogfood the experience
5. **Phase 3: Act** - Build destructive tools
   - Test each with Chrome DevTools MCP
   - Extra careful validation
6. **Iterate** - Use the tools, find gaps, improve

## Remember

- **UI Parity**: LLMs should be able to do everything humans can
- **Safety First**: Categorize tools by read-only/read-write/destructive
- **Two-Tool Pattern**: Separate filling from submission
- **Powerful Tools**: One tool per complete task
- **Dogfood Everything**: Test every tool with Chrome DevTools MCP
- **Iterate**: The first version won't be perfect

You're not just adding tools - you're creating an interface for AI. Make it good.
