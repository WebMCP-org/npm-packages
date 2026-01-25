# Advanced WebMCP Patterns

Non-obvious but critical details that significantly impact tool design quality. **Always search WebMCP Docs for specifics** when implementing: `mcp__docs__SearchWebMcpDocumentation("your question")`

## Tool Naming Conventions

Use **verb-noun format with domain prefix** for clarity:

```tsx
// ✅ Good naming - clear and scoped
useWebMCP({ name: 'shopping_cart_add_item', ... });
useWebMCP({ name: 'posts_like', ... });
useWebMCP({ name: 'graph_navigate', ... });
useWebMCP({ name: 'table_filter', ... });

// ❌ Bad naming - ambiguous
useWebMCP({ name: 'add', ... });  // Add what?
useWebMCP({ name: 'like', ... }); // Like what? Multiple features could use this
useWebMCP({ name: 'navigate', ... }); // Where? How?
```

**Why?** With 10+ tools registered, generic names cause confusion. Domain prefixes prevent collisions and make intent clear.

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("tool naming conventions")`

## Complete Annotation System

Beyond `destructiveHint`, use all three annotations:

```tsx
// Read-only tool
useWebMCP({
  name: 'list_products',
  annotations: {
    readOnlyHint: true,      // No side effects
    idempotentHint: true,    // Safe to retry
    destructiveHint: false   // Not destructive (default)
  },
  handler: async () => ({ products: await getProducts() })
});

// Read-write tool (fills form)
useWebMCP({
  name: 'fill_checkout_form',
  annotations: {
    readOnlyHint: false,     // Modifies UI state
    idempotentHint: true,    // Can call multiple times safely
    destructiveHint: false   // Not destructive - just filling fields
  },
  handler: async ({ address, payment }) => {
    setFormData({ address, payment });
    return { success: true };
  }
});

// Destructive tool (actually submits)
useWebMCP({
  name: 'complete_purchase',
  annotations: {
    readOnlyHint: false,     // Changes state
    idempotentHint: false,   // Should only be called once
    destructiveHint: true    // Charges money - irreversible!
  },
  handler: async () => {
    await chargeCreditCard();
    return { orderId: '...' };
  }
});
```

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("tool annotations readOnlyHint idempotentHint")`

## Avoid Tool Overload (>50 tools)

**Problem**: Registering too many tools overwhelms AI agents and slows discovery.

**Solutions**:

### 1. Progressive Disclosure - Show tools based on current page/state

```tsx
// Only show cart tools on cart page
function CartPage() {
  useWebMCP({ name: 'cart_add_item', ... });
  useWebMCP({ name: 'cart_remove_item', ... });
  useWebMCP({ name: 'cart_update_quantity', ... });
  // These auto-unregister when component unmounts
}
```

### 2. Role-Based Tools - Different tools for different users

```tsx
function AdminTools({ user }) {
  // Customer tools (everyone)
  useWebMCP({ name: 'view_products', ... });

  // Moderator tools
  if (user?.role === 'moderator' || user?.role === 'admin') {
    useWebMCP({ name: 'hide_comment', ... });
  }

  // Admin-only tools
  if (user?.role === 'admin') {
    useWebMCP({ name: 'delete_user', ... });
    useWebMCP({ name: 'update_pricing', ... });
  }
}
```

### 3. Conditional Registration with `enabled` prop

```tsx
const [cartOpen, setCartOpen] = useState(false);

// Only register when cart is open
useWebMCP({
  name: 'apply_coupon',
  enabled: cartOpen, // ← Conditional without breaking hooks rules
  handler: async ({ code }) => { ... }
});
```

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("enabled prop conditional tools")`

## outputSchema vs formatOutput

**Two different things**:

```tsx
useWebMCP({
  name: 'get_cart',
  // outputSchema: Defines the STRUCTURE (for type safety and validation)
  outputSchema: useMemo(() => ({
    items: z.array(z.object({
      name: z.string(),
      price: z.number(),
      quantity: z.number()
    })),
    total: z.number(),
    itemCount: z.number()
  }), []),

  handler: async () => {
    const cart = await getCart();

    // Return structured data (matches outputSchema)
    return {
      items: cart.items,
      total: cart.total,
      itemCount: cart.items.length
    };
  },

  // formatOutput: TEXT representation (for display/logging)
  formatOutput: (output) => {
    return `Cart has ${output.itemCount} items (total: $${output.total})`;
  }
});
```

**When to use each**:
- **outputSchema**: Always. Provides type safety and structure.
- **formatOutput**: Optional. Provides human-readable text summary.

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("outputSchema formatOutput structured content")`

## Tool Descriptions Should Include Return Format

Help AI understand what to expect:

```tsx
// ✅ Good - describes return format
useWebMCP({
  name: 'get_cart',
  description: 'Get shopping cart contents. Returns {items: Array<{name, price, sku, quantity}>, total: number, itemCount: number}',
  handler: async () => { ... }
});

// ❌ Bad - vague
useWebMCP({
  name: 'get_cart',
  description: 'Get cart',
  handler: async () => { ... }
});
```

## Error Handling with onError

Don't just throw errors - use the `onError` callback:

```tsx
useWebMCP({
  name: 'add_to_cart',
  inputSchema: {
    productId: z.string(),
    quantity: z.number().positive()
  },
  handler: async ({ productId, quantity }) => {
    // Validation error - return structured error
    if (quantity > 10) {
      return {
        success: false,
        error: 'Maximum quantity is 10'
      };
    }

    // Network error - will trigger onError
    const result = await addToCart(productId, quantity);
    return { success: true, cart: result };
  },

  // Handle errors (logging, toasts, etc.)
  onError: (error, input) => {
    console.error('Add to cart failed:', error);
    showToast(`Failed to add ${input.productId}: ${error.message}`);
  }
});
```

**Pattern**: Return structured errors for validation, throw for unexpected errors. Use `onError` for side effects (logging, UI updates).

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("onError error handling")`

## Confirmation Dialogs for Destructive Actions

**CRITICAL for security**: Use browser confirmation dialogs:

```tsx
useWebMCP({
  name: 'delete_account',
  description: 'Permanently delete user account (irreversible)',
  annotations: {
    destructiveHint: true,
    idempotentHint: false
  },
  inputSchema: {
    // Require explicit confirmation parameter
    confirmation: z.literal('DELETE_MY_ACCOUNT').describe('Must be exact string DELETE_MY_ACCOUNT')
  },
  handler: async ({ confirmation }) => {
    // Double confirmation with browser dialog
    const userConfirmed = window.confirm(
      '⚠️ Delete your account permanently?\n\n' +
      'This action cannot be undone.\n\n' +
      'All data will be lost.'
    );

    if (!userConfirmed) {
      return { success: false, error: 'User denied permission' };
    }

    // Optional: Rate limiting
    if (await isRateLimited('delete_account')) {
      return { success: false, error: 'Please wait before retrying' };
    }

    // Optional: Security event logging
    await logSecurityEvent('ACCOUNT_DELETION', user.id);

    await deleteAccount();
    return { success: true, message: 'Account deleted' };
  }
});
```

**Layers of protection**:
1. Literal string in schema (`z.literal('DELETE_MY_ACCOUNT')`)
2. Browser confirmation dialog (`window.confirm`)
3. Rate limiting (optional)
4. Security logging (optional)

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("security confirmation destructive")`

## Performance: Fast Execution

Tools should execute quickly (< 1 second):

```tsx
// ✅ Good - fast operation
useWebMCP({
  name: 'update_cart',
  handler: async (input) => {
    updateCartUI(input); // Fast UI update
    return { success: true };
  }
});

// ❌ Bad - slow operation blocks UI
useWebMCP({
  name: 'process_order',
  handler: async (input) => {
    await longRunningTask(); // Blocks for seconds
    return { done: true };
  }
});

// ✅ Better - delegate heavy work
useWebMCP({
  name: 'process_order',
  handler: async (input) => {
    // Queue work, return immediately
    const jobId = await queueBackgroundJob(input);
    return { queued: true, jobId };
  }
});

// Provide status check tool
useWebMCP({
  name: 'check_job_status',
  inputSchema: { jobId: z.string() },
  handler: async ({ jobId }) => {
    const status = await getJobStatus(jobId);
    return { status, progress: status.progress };
  }
});
```

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("performance fast execution")`

## Tool Cleanup (Memory Leaks)

Always unregister tools when done:

```tsx
// ✅ React - automatic cleanup with useWebMCP
function MyComponent() {
  useWebMCP({
    name: 'my_tool',
    handler: async () => ({ ... })
  });
  // Auto-unregisters when component unmounts
}

// ❌ Manual registration without cleanup
useEffect(() => {
  navigator.modelContext.registerTool({ ... });
  // No cleanup - memory leak!
}, []);

// ✅ Manual registration with cleanup
useEffect(() => {
  const registration = navigator.modelContext.registerTool({ ... });

  return () => {
    registration.unregister(); // Clean up
  };
}, []);
```

## Import Order Matters

**CRITICAL**: Import `@mcp-b/global` FIRST in client components:

```tsx
// ✅ Correct order
'use client';

import '@mcp-b/global';  // FIRST - initializes polyfill
import { useWebMCP } from '@mcp-b/react-webmcp';  // AFTER

export function MyTools() {
  useWebMCP({ ... });
}
```

**Why?** The polyfill must initialize before any tools try to register.

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("import order initialization")`

## React StrictMode Handling

React 18+ StrictMode causes double-mounting in development. **useWebMCP handles this automatically** - no action needed.

```tsx
// ✅ Works correctly in StrictMode
function MyComponent() {
  useWebMCP({
    name: 'my_tool',
    handler: async () => ({ ... })
  });
  // Tool registered once even though component mounts twice
}
```

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("React StrictMode double mounting")`

## Hot Module Replacement (HMR)

Development servers with HMR (Vite, Next.js) work seamlessly:

```tsx
// ✅ Automatic HMR handling
function MyTools() {
  useWebMCP({
    name: 'my_tool',
    handler: async () => ({ ... })
  });
  // Tool re-registers automatically when code changes
}
```

When you edit the code and save, the dev server hot-reloads and tools re-register instantly.

**Search docs**: `mcp__docs__SearchWebMcpDocumentation("HMR hot module replacement")`

## Key Takeaways

1. **Naming**: Use `domain_verb_noun` format
2. **Annotations**: Set all three (readOnlyHint, idempotentHint, destructiveHint)
3. **Tool Limits**: Keep under 50 tools per page, use progressive disclosure
4. **Output**: Use outputSchema + formatOutput for structure + text
5. **Descriptions**: Include return format in description
6. **Errors**: Use onError callback for side effects
7. **Destructive**: Multiple confirmation layers for safety
8. **Performance**: Execute quickly, delegate heavy work
9. **Cleanup**: Always unregister tools (useWebMCP does this automatically)
10. **Import Order**: @mcp-b/global must come first
11. **StrictMode**: useWebMCP handles it automatically
12. **HMR**: Tools re-register automatically on code changes

**When in doubt, search the docs**: `mcp__docs__SearchWebMcpDocumentation("your question here")`
