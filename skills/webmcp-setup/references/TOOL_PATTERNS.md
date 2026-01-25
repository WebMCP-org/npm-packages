# WebMCP Tool Patterns

Common patterns and best practices for creating WebMCP tools.

## Basic Tool Structure

### Minimal Tool (React)

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';

function MyComponent() {
  useWebMCP({
    name: 'simple_action',
    description: 'Perform a simple action',
    handler: async () => {
      // Do something
      return { success: true };
    }
  });
}
```

### Tool with Input Validation (React)

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useMemo } from 'react';
import { z } from 'zod';

function MyComponent() {
  const inputSchema = useMemo(() => ({
    message: z.string().min(1).max(100).describe('Message to display'),
    priority: z.enum(['low', 'medium', 'high']).describe('Message priority')
  }), []);

  useWebMCP({
    name: 'show_message',
    description: 'Display a message with priority',
    inputSchema,
    handler: async ({ message, priority }) => {
      // TypeScript knows the types!
      showNotification(message, priority);
      return { success: true };
    }
  });
}
```

### Tool with Output Schema (React)

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useMemo } from 'react';
import { z } from 'zod';

function MyComponent() {
  const outputSchema = useMemo(() => ({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email()
    }),
    status: z.enum(['active', 'inactive'])
  }), []);

  useWebMCP({
    name: 'get_user_profile',
    description: 'Get current user profile',
    outputSchema,
    handler: async () => {
      const user = getCurrentUser();
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        status: user.isActive ? 'active' : 'inactive'
      };
    }
  });
}
```

## UI Interaction Patterns

### Form Filling

```tsx
function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useWebMCP({
    name: 'fill_contact_form',
    description: 'Fill out the contact form',
    inputSchema: useMemo(() => ({
      name: z.string().describe('Full name'),
      email: z.string().email().describe('Email address'),
      message: z.string().optional().describe('Optional message')
    }), []),
    handler: async ({ name, email, message }) => {
      setName(name);
      setEmail(email);
      if (message) setMessage(message);
      return { success: true };
    }
  });

  return (
    <form>
      <input value={name} onChange={e => setName(e.target.value)} />
      <input value={email} onChange={e => setEmail(e.target.value)} />
    </form>
  );
}
```

### Button Clicking

```tsx
function ActionButton() {
  const handleClick = () => {
    console.log('Button clicked!');
  };

  useWebMCP({
    name: 'click_action_button',
    description: 'Click the action button',
    handler: async () => {
      handleClick();
      return { success: true, message: 'Button clicked' };
    }
  });

  return <button onClick={handleClick}>Action</button>;
}
```

### Navigation

```tsx
import { useNavigate } from 'react-router-dom';

function Navigation() {
  const navigate = useNavigate();

  useWebMCP({
    name: 'navigate_to_page',
    description: 'Navigate to a different page',
    inputSchema: useMemo(() => ({
      path: z.enum(['/home', '/about', '/contact']).describe('Page to navigate to')
    }), []),
    handler: async ({ path }) => {
      navigate(path);
      return { success: true, navigatedTo: path };
    }
  });
}
```

## Data Access Patterns

### Reading State

```tsx
function DataDisplay() {
  const [items, setItems] = useState<Item[]>([]);
  const itemCount = items.length;

  useWebMCP({
    name: 'get_items',
    description: `Get all items (currently ${itemCount} items)`,
    outputSchema: useMemo(() => ({
      items: z.array(z.object({
        id: z.string(),
        name: z.string(),
        quantity: z.number()
      })),
      totalCount: z.number()
    }), []),
    handler: async () => ({
      items,
      totalCount: items.length
    })
  }, [itemCount]); // Re-register when count changes
}
```

### Filtering/Searching

```tsx
function SearchableList() {
  const [items] = useState<Item[]>(initialItems);

  useWebMCP({
    name: 'search_items',
    description: 'Search through items',
    inputSchema: useMemo(() => ({
      query: z.string().describe('Search query'),
      maxResults: z.number().optional().describe('Max results to return')
    }), []),
    outputSchema: useMemo(() => ({
      results: z.array(z.object({
        id: z.string(),
        name: z.string(),
        score: z.number()
      }))
    }), []),
    handler: async ({ query, maxResults = 10 }) => {
      const results = items
        .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, maxResults)
        .map(item => ({
          id: item.id,
          name: item.name,
          score: calculateRelevance(item, query)
        }));

      return { results };
    }
  });
}
```

## Mutation Patterns

### Creating Items

```tsx
function ItemCreator() {
  const [items, setItems] = useState<Item[]>([]);

  useWebMCP({
    name: 'create_item',
    description: 'Create a new item',
    inputSchema: useMemo(() => ({
      name: z.string().min(1).describe('Item name'),
      quantity: z.number().int().positive().describe('Quantity')
    }), []),
    outputSchema: useMemo(() => ({
      success: z.boolean(),
      item: z.object({
        id: z.string(),
        name: z.string(),
        quantity: z.number()
      })
    }), []),
    handler: async ({ name, quantity }) => {
      const newItem = {
        id: crypto.randomUUID(),
        name,
        quantity
      };

      setItems(prev => [...prev, newItem]);

      return { success: true, item: newItem };
    }
  });
}
```

### Updating Items

```tsx
function ItemUpdater() {
  const [items, setItems] = useState<Item[]>([]);

  useWebMCP({
    name: 'update_item',
    description: 'Update an existing item',
    inputSchema: useMemo(() => ({
      id: z.string().describe('Item ID'),
      name: z.string().optional().describe('New name'),
      quantity: z.number().optional().describe('New quantity')
    }), []),
    outputSchema: useMemo(() => ({
      success: z.boolean(),
      item: z.object({
        id: z.string(),
        name: z.string(),
        quantity: z.number()
      }).optional()
    }), []),
    handler: async ({ id, name, quantity }) => {
      const itemIndex = items.findIndex(item => item.id === id);

      if (itemIndex === -1) {
        return { success: false };
      }

      const updatedItem = {
        ...items[itemIndex],
        ...(name && { name }),
        ...(quantity && { quantity })
      };

      setItems(prev => [
        ...prev.slice(0, itemIndex),
        updatedItem,
        ...prev.slice(itemIndex + 1)
      ]);

      return { success: true, item: updatedItem };
    }
  });
}
```

### Deleting Items

```tsx
function ItemDeleter() {
  const [items, setItems] = useState<Item[]>([]);

  useWebMCP({
    name: 'delete_item',
    description: 'Delete an item by ID',
    inputSchema: useMemo(() => ({
      id: z.string().describe('Item ID to delete')
    }), []),
    outputSchema: useMemo(() => ({
      success: z.boolean(),
      deletedId: z.string().optional()
    }), []),
    handler: async ({ id }) => {
      const exists = items.some(item => item.id === id);

      if (!exists) {
        return { success: false };
      }

      setItems(prev => prev.filter(item => item.id !== id));

      return { success: true, deletedId: id };
    }
  });
}
```

## Advanced Patterns

### Multi-Step Operations

```tsx
function MultiStepProcess() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({});

  useWebMCP({
    name: 'process_checkout',
    description: 'Complete the checkout process',
    inputSchema: useMemo(() => ({
      shippingInfo: z.object({
        address: z.string(),
        city: z.string(),
        zip: z.string()
      }),
      paymentInfo: z.object({
        cardNumber: z.string(),
        expiryDate: z.string()
      })
    }), []),
    handler: async ({ shippingInfo, paymentInfo }) => {
      // Step 1: Fill shipping
      setStep(1);
      setData({ shipping: shippingInfo });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 2: Fill payment
      setStep(2);
      setData(prev => ({ ...prev, payment: paymentInfo }));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Submit
      setStep(3);
      await submitOrder(data);

      return { success: true, orderId: '12345' };
    }
  });
}
```

### Conditional Tools

```tsx
function ConditionalTools() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Login tool - only when not logged in
  useWebMCP(
    isLoggedIn ? null : {
      name: 'login',
      description: 'Log in to the application',
      inputSchema: useMemo(() => ({
        username: z.string(),
        password: z.string()
      }), []),
      handler: async ({ username, password }) => {
        const user = await authenticate(username, password);
        setUser(user);
        setIsLoggedIn(true);
        return { success: true, user };
      }
    }
  );

  // Logout tool - only when logged in
  useWebMCP(
    !isLoggedIn ? null : {
      name: 'logout',
      description: 'Log out of the application',
      handler: async () => {
        setUser(null);
        setIsLoggedIn(false);
        return { success: true };
      }
    }
  );
}
```

### Error Handling

```tsx
function ErrorHandlingTool() {
  useWebMCP({
    name: 'risky_operation',
    description: 'Perform an operation that might fail',
    inputSchema: useMemo(() => ({
      data: z.string()
    }), []),
    outputSchema: useMemo(() => ({
      success: z.boolean(),
      result: z.string().optional(),
      error: z.string().optional()
    }), []),
    handler: async ({ data }) => {
      try {
        const result = await riskyOperation(data);
        return { success: true, result };
      } catch (error) {
        console.error('Operation failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });
}
```

## Best Practices

1. **Use descriptive names**: `user_profile_update` not `update`
2. **Include state in descriptions**: `Get items (${count} available)`
3. **Validate inputs with Zod**: Type-safe and clear schemas
4. **Return structured outputs**: Use outputSchema for consistency
5. **Handle errors gracefully**: Return error info, don't throw
6. **Use deps array**: Re-register when state changes (React)
7. **Memoize schemas**: Prevent unnecessary re-renders (React)
8. **Keep handlers simple**: Complex logic should be in separate functions
9. **Test thoroughly**: Verify tools work with real MCP clients
10. **Document behavior**: Clear descriptions help AI understand tools

## Anti-Patterns to Avoid

1. ❌ **Inline schemas**: Creates new objects every render
   ```tsx
   // Bad
   useWebMCP({
     outputSchema: { count: z.number() } // New object every time!
   });
   ```

2. ❌ **Missing deps**: Tools won't update
   ```tsx
   // Bad - description won't update
   useWebMCP({
     description: `Count: ${count}`
   }); // Missing [count]
   ```

3. ❌ **Complex handlers**: Hard to test and maintain
   ```tsx
   // Bad
   handler: async () => {
     // 100 lines of complex logic
   }
   ```

4. ❌ **Throwing errors**: MCP expects error responses
   ```tsx
   // Bad
   handler: async () => {
     throw new Error('Failed'); // Client won't get useful info
   };

   // Good
   handler: async () => {
     return { success: false, error: 'Failed' };
   };
   ```

5. ❌ **Non-unique names**: Causes conflicts
   ```tsx
   // Bad - two tools named 'update'
   useWebMCP({ name: 'update', ... });
   useWebMCP({ name: 'update', ... }); // Conflict!
   ```
