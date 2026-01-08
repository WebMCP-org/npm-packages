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
| **Testing** | Dogfood every tool | `mcp__chrome-devtools__*` tools |
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
