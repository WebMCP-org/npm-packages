# WebMCP Setup Assistant - Claude Code Skill

A Claude Code skill that guides you through setting up WebMCP (Model Context Protocol for Web) in your web applications across different frameworks.

## What This Skill Does

Helps you integrate WebMCP into websites with:
- **Framework Detection** - Auto-detects React, Vue, Next.js, or vanilla HTML
- **Package Installation** - Installs correct packages for your framework
- **Code Generation** - Creates example tools and integration code
- **Setup Verification** - Tests that WebMCP is working correctly

## What is WebMCP?

WebMCP is a browser-native implementation of the Model Context Protocol that allows web applications to expose functionality to AI agents through:
- **React Hooks** (`@mcp-b/react-webmcp`) - Declarative tool registration with automatic re-registration
- **TypeScript SDK** (`@mcp-b/webmcp-ts-sdk`) - Imperative API for non-React frameworks
- **Global Bridge** (`@mcp-b/global`) - IIFE script for browser communication

## Installation

### Option 1: Via Claude Code (When Published)

```bash
# Install from plugin marketplace
/plugin marketplace add webmcp/webmcp-setup
/plugin install webmcp-setup
```

### Option 2: Manual Installation

```bash
# Clone or copy this directory to your Claude Code skills folder
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

> "Set up WebMCP in my app"

or

> "Add WebMCP tools to my React app"

The skill will:
1. Analyze your project structure
2. Detect your framework (React, Vue, Next.js, vanilla)
3. Install the appropriate packages
4. Add the global bridge script
5. Create example tools
6. Verify the setup

## Supported Frameworks

- ✅ **React** (17, 18, 19) - Uses `@mcp-b/react-webmcp` hooks
- ✅ **Next.js** (13+, App Router and Pages Router) - Uses SDK
- ✅ **Vue** (3+) - Uses `@mcp-b/webmcp-ts-sdk`
- ✅ **Vanilla HTML/JS** - Uses `@mcp-b/global` IIFE only
- ✅ **Angular** (14+) - Uses SDK
- ✅ **Svelte** (3+, SvelteKit) - Uses SDK

## What You Need

### Required
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- Node.js 16+ and npm/yarn/pnpm (for package-based setups)
- Existing web project or willingness to create one

### Optional (Recommended)
- **Chrome DevTools MCP Server** - For automated testing
- **WebMCP Docs MCP** - For documentation lookup

## Features

### Automatic Framework Detection

The skill analyzes your project to determine the best integration approach:

```
Analyzing project...
✓ Found package.json with React 19
✓ Using Vite build system
✓ TypeScript detected

Recommendation: @mcp-b/react-webmcp with hooks
```

### Package Installation

Automatically installs the correct packages:

```bash
# For React projects
pnpm add @mcp-b/react-webmcp @mcp-b/global zod

# For Vue/other frameworks
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/global zod
```

### Code Generation

Creates example tools tailored to your app:

**React Example:**
```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';

function MyComponent() {
  const [count, setCount] = useState(0);

  useWebMCP({
    name: 'increment_counter',
    description: 'Increment the counter',
    handler: async () => {
      setCount(c => c + 1);
      return { success: true, newCount: count + 1 };
    }
  });

  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>;
}
```

**Vue Example:**
```typescript
import { createWebMCPClient } from '@mcp-b/webmcp-ts-sdk';
import { ref } from 'vue';

const count = ref(0);
const client = await createWebMCPClient();

client.registerTool({
  name: 'increment_counter',
  description: 'Increment the counter',
  handler: async () => {
    count.value++;
    return { success: true, newCount: count.value };
  }
});
```

### Setup Verification

Tests your setup with Chrome DevTools MCP (if available):
- ✅ Global bridge loaded
- ✅ Tools registered correctly
- ✅ Tool calls succeed
- ✅ Responses match schemas

## Example Usage

### Add to Existing React App

```
User: Add WebMCP to my React app

Claude: I'll set up WebMCP for your React app.

        Detected:
        - React 19 with Vite
        - TypeScript enabled

        Installing @mcp-b/react-webmcp...
        [Installs packages]

        Adding global bridge to index.html...
        [Modifies index.html]

        Creating example component...
        [Generates MyWebMCPTools.tsx]

        Done! Your app now exposes MCP tools.
        Test with: npx @mcp-b/chrome-devtools-mcp
```

### Create Demo from Scratch

```
User: Create a WebMCP demo with vanilla JavaScript

Claude: Creating a minimal WebMCP demo page...

        [Creates demo.html with embedded tools]

        Demo created at: ./demo.html

        Tools available:
        - set_message: Change the displayed message
        - get_timestamp: Get current timestamp

        Open in browser to test!
```

## Files Included

```
skills/webmcp-setup/
├── SKILL.md                       # Main skill instructions
├── package.json                   # Skill package metadata
├── README.md                      # This file
├── references/
│   ├── REACT_SETUP.md            # Detailed React guide
│   ├── VUE_SETUP.md              # Vue 3 guide
│   ├── NEXTJS_SETUP.md           # Next.js guide
│   ├── VANILLA_SETUP.md          # Vanilla HTML guide
│   ├── ANGULAR_SETUP.md          # Angular guide
│   ├── SVELTE_SETUP.md           # Svelte guide
│   ├── TOOL_PATTERNS.md          # Common tool patterns
│   ├── TROUBLESHOOTING.md        # Common issues and solutions
│   ├── SECURITY.md               # Security best practices
│   ├── PERFORMANCE.md            # Performance optimization
│   ├── TESTING.md                # Testing strategies
│   └── PRODUCTION.md             # Production deployment
├── assets/
│   └── templates/
│       ├── react-demo.tsx        # React demo component
│       ├── vue-demo.vue          # Vue demo component
│       └── vanilla-demo.html     # Vanilla HTML demo
└── scripts/
    └── verify-setup.js           # Setup verification script
```

## How It Works

1. **Project Analysis**: Checks for package.json, framework dependencies, build config
2. **Framework Selection**: Chooses the best integration approach
3. **Package Installation**: Installs required npm packages
4. **Code Generation**: Creates example tools and integration code
5. **HTML Modification**: Adds global bridge script tag
6. **Verification**: Tests setup with Chrome DevTools MCP (if available)

## Testing

### With Chrome DevTools MCP (Recommended)

```bash
# Start your dev server
npm run dev

# In another terminal, connect Chrome DevTools MCP
npx @mcp-b/chrome-devtools-mcp

# The skill will automatically run verification tests
```

### Manual Testing

```bash
# Start your dev server
npm run dev

# Open browser to http://localhost:3000
# Open DevTools console
# Look for: "WebMCP bridge initialized"

# Try calling a tool (example varies by framework)
```

## Troubleshooting

Common issues:

**"@mcp-b/global not found"**
- Make sure the script tag is in your HTML
- Check the CDN URL is correct
- Try using a specific version instead of `@latest`

**"Tools not appearing"**
- Verify the global bridge script loaded (check console)
- Ensure tools are registered after the bridge initializes
- Check for JavaScript errors in console

**"Chrome DevTools MCP can't connect"**
- Make sure your page is served over HTTP/HTTPS (not `file://`)
- Check that the page is on localhost or HTTPS
- Verify Chrome DevTools MCP is running

See [TROUBLESHOOTING.md](skills/webmcp-setup/references/TROUBLESHOOTING.md) for more details.

## Contributing

This skill is part of the WebMCP project. Contributions welcome!

## License

MIT

## Links

- **WebMCP Documentation**: https://docs.mcp-b.ai
- **NPM Packages**: https://www.npmjs.com/org/mcp-b
- **GitHub**: https://github.com/WebMCP-org/npm-packages
- **Model Context Protocol**: https://modelcontextprotocol.io

## Related Skills

- `char-setup` - Set up Char embedded agent widgets
- `playwright-skill` - Full Playwright browser automation
- `webapp-testing` - Anthropic's webapp testing skill
