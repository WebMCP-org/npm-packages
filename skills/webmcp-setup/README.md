# WebMCP Setup Assistant - Claude Code Skill

A Claude Code skill that provides **strategic guidance** for adding WebMCP (Model Context Protocol for Web) to web applications. Focuses on tool design principles, testing workflow, and creating an effective "LLM UI."

## What This Skill Does

This skill teaches agents how to:
- **Think of WebMCP as creating an LLM UI** - not just installing packages
- **Design powerful tools** using the three-category system (read-only, read-write, destructive)
- **Implement the two-tool pattern** for forms (fill + submit)
- **Test rigorously** using Chrome DevTools MCP (dogfooding)
- **Achieve UI parity** - LLMs can do everything humans can do

## Core Philosophy

WebMCP is about creating a user interface for LLMs. Just as humans use buttons, forms, and navigation, LLMs use tools. The goal is **UI parity** - enable everything a human can do, in a way that makes sense for LLMs.

## Key Principles

### 1. Categorize by Safety
- **Read-only** (`readOnlyHint: true`) - Get data, no side effects
- **Read-write** (default) - Modify UI state, user sees changes, reversible
- **Destructive** (`destructiveHint: true`) - Permanent actions, requires care

### 2. Two-Tool Pattern for Forms
**Critical**: Separate filling from submission
- Tool 1: `fill_*_form` (read-write) - Populate fields, user sees it
- Tool 2: `submit_*_form` (destructive) - Actually submit

**Why?** User can review what's being submitted before it happens.

### 3. UI Parity
For every major action a human can take, create a corresponding tool.

### 4. Powerful, Not Granular
One tool per complete task. Not `set_name`, `set_email`, `set_message` - instead `fill_contact_form` with all fields.

### 5. Dogfood Everything
Test every tool with Chrome DevTools MCP. No exceptions.

## Installation

### Option 1: Via Claude Code (When Published)

```bash
/plugin marketplace add webmcp/webmcp-setup
/plugin install webmcp-setup
```

### Option 2: Manual Installation

```bash
# Copy to your Claude Code skills folder
cp -r skills/webmcp-setup ~/.claude/skills/
```

### Option 3: Project-Specific

```bash
# Add to your project's .claude/skills/ directory
mkdir -p .claude/skills
cp -r skills/webmcp-setup .claude/skills/
```

## Quick Start

Once installed, just ask Claude:

> "Add WebMCP to my website"

or

> "Set up WebMCP tools for my app"

The skill will guide you through:
1. Understanding your app's UI capabilities
2. Designing tools by category (read, write, act)
3. Implementing tools with proper separation
4. Testing every tool with Chrome DevTools MCP
5. Iterating based on dogfooding feedback

## What Makes This Skill Different

**Not a package installer** - This skill provides strategic guidance, not mechanical "run this command" instructions.

**Leverages existing tools**:
- **WebMCP Docs MCP** - For API syntax and implementation details
- **Chrome DevTools MCP** - For testing and dogfooding tools
- **This skill** - For design principles and strategy

**Emphasizes dogfooding**: Every tool must be tested with Chrome DevTools MCP. This catches bugs early and builds intuition for good tool design.

## Example Usage

### User asks: "Add WebMCP to my todo app"

The skill will guide the agent to:

1. **Understand the UI** - What can humans do?
   - View todos, add todos, mark complete, delete, filter, search

2. **Plan tools by category**:
   ```
   Phase 1 - Read-Only:
   ✓ list_todos (readOnlyHint: true)
   ✓ get_todo_by_id (readOnlyHint: true)

   Phase 2 - Read-Write:
   ✓ fill_todo_form (populate form fields)
   ✓ set_filter (change visible todos)

   Phase 3 - Destructive:
   ✓ create_todo (destructiveHint: true)
   ✓ delete_todo (destructiveHint: true)
   ✓ mark_complete (destructiveHint: true)
   ```

3. **Implement Phase 1 tools**:
   - Search WebMCP Docs for API syntax
   - Write the tools
   - Test with Chrome DevTools MCP

4. **Dogfood the tools**:
   - Call `list_todos` via Chrome DevTools MCP
   - Verify data matches screen
   - Test edge cases

5. **Iterate through phases 2-3**:
   - Build read-write tools, test each
   - Build destructive tools, test carefully
   - Refine based on testing

## Implementation Phases

### Phase 1: Read the World (Read-Only Tools)
Give the LLM eyes. Build tools that let it understand current state.
- Safe to implement
- No risk of breaking anything
- Builds confidence

### Phase 2: Modify UI (Read-Write Tools)
Let the LLM interact with the UI without permanent consequences.
- User sees changes in real-time
- Reversible
- Builds trust

### Phase 3: Take Action (Destructive Tools)
Let the LLM make permanent changes.
- Most risky
- Requires phases 1-2 to be solid
- Extra careful testing

## Testing Workflow

For **every tool**:
1. Register the tool in your code
2. Start dev server
3. Open Chrome DevTools MCP
4. Call the tool
5. Verify behavior in browser
6. Check return value
7. Try edge cases
8. Iterate

**This is mandatory**. Tools that aren't dogfooded will have bugs.

## Common Patterns

### Todo App
- Read: `list_todos`, `get_todo_by_id`
- Write: `fill_todo_form`, `set_filter`
- Act: `create_todo`, `delete_todo`, `mark_complete`

### E-Commerce
- Read: `search_products`, `get_cart_contents`
- Write: `fill_checkout_form`, `apply_filters`
- Act: `add_to_cart`, `submit_order`

### Admin Dashboard
- Read: `list_users`, `get_analytics`
- Write: `fill_user_form`, `set_date_range`
- Act: `create_user`, `delete_user`, `ban_user`

## Files Included

```
skills/webmcp-setup/
├── SKILL.md                       # Strategic guidance (main file)
├── README.md                      # This file
├── package.json                   # Skill metadata
├── CHANGELOG.md                   # Version history
├── CONTRIBUTING.md                # Contribution guidelines
├── references/
│   ├── REACT_SETUP.md            # React-specific examples
│   ├── TOOL_PATTERNS.md          # Tool design patterns
│   └── TROUBLESHOOTING.md        # Common issues
├── assets/
│   └── templates/
│       └── vanilla-demo.html     # Working demo
└── scripts/
    └── verify-setup.js           # Environment check
```

## How It Works

The skill provides **strategic guidance** in three areas:

1. **Design Principles**
   - Three-category system (read/write/act)
   - Two-tool pattern for forms
   - UI parity concept
   - Powerful vs granular tools

2. **Implementation Strategy**
   - Phase 1: Read-only tools first
   - Phase 2: Read-write tools second
   - Phase 3: Destructive tools last
   - Why this order matters

3. **Testing Workflow**
   - Dogfooding with Chrome DevTools MCP
   - What to test for each tool type
   - Common issues found during testing
   - Iteration based on feedback

**The skill does NOT**:
- Install packages (agents can figure this out)
- Provide boilerplate code (use WebMCP Docs MCP)
- Debug implementation issues (use Chrome DevTools MCP)

**The skill DOES**:
- Teach strategic thinking about tool design
- Emphasize testing and dogfooding
- Provide design principles and patterns
- Guide the implementation process

## Resources Used

The skill teaches agents to leverage:

1. **WebMCP Docs MCP** (`mcp__docs__SearchWebMcpDocumentation`)
   - API syntax and implementation details
   - Code examples
   - Troubleshooting

2. **Chrome DevTools MCP** (`mcp__chrome-devtools__*`)
   - Testing tools
   - Verifying behavior
   - Debugging

3. **This Skill** (strategic guidance)
   - Tool design principles
   - Implementation phases
   - Testing workflow

## Success Metrics

A successful WebMCP integration has:

✅ UI parity - Every major UI action has a tool
✅ Clear safety categories - Read/write/act properly separated
✅ Two-tool forms - Fill and submit are separate
✅ All tools tested - Dogfooded with Chrome DevTools MCP
✅ Powerful tools - One tool per complete task

## Troubleshooting

**"The skill doesn't install packages"**
- Correct. Use WebMCP Docs MCP for API syntax: `mcp__docs__SearchWebMcpDocumentation("react setup")`

**"How do I test tools?"**
- Use Chrome DevTools MCP to call tools and verify behavior
- See the "Critical: Dogfooding" section in SKILL.md

**"Should I make one tool per form field?"**
- No. Make one powerful tool that fills the entire form
- See "Make Tools Powerful, Not Granular" principle

**"When should I use destructiveHint?"**
- For permanent, irreversible actions (submit, delete, purchase)
- NOT for filling forms or changing UI state

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Adding framework-specific patterns
- Improving testing workflows
- Expanding design principles
- Adding real-world examples

## License

MIT

## Links

- **WebMCP Documentation**: https://docs.mcp-b.ai
- **NPM Packages**: https://www.npmjs.com/org/mcp-b
- **GitHub**: https://github.com/WebMCP-org/npm-packages
- **Model Context Protocol**: https://modelcontextprotocol.io

## Philosophy

> "You're not just adding tools - you're creating an interface for AI. Make it good."

This skill helps you build that interface thoughtfully, systematically, and with the right testing discipline.
