# Chat UI with MCP Integration

A modern chat interface built with React, TypeScript, and Vite that integrates with MCP (Model Context Protocol) servers.

## Features

- 💬 Real-time chat interface with AI assistant
- 🔌 MCP server integration with dynamic tool registration
- 🎨 Modern UI built with Tailwind CSS and Shadcn components
- 🔄 Support for MCP UI resources (iframes, raw HTML, remote DOM)
- 📱 Responsive design
- ⚡ Fast development with Vite HMR

## Quick Start

### Prerequisites

- Node.js 22.12+
- pnpm (or npm/yarn)
- An MCP server running (e.g., `remote-mcp-with-ui-starter`)

### Installation

```bash
# Install dependencies
pnpm install
```

### Development

```bash
# Start development server
pnpm dev
```

The app will be available at http://localhost:5173

### Building

```bash
# Build for production
pnpm build
```

## Environment Configuration

This app uses Vite's environment-specific `.env` files:

- **`.env.development`**: Development environment (loaded in `pnpm dev`)
- **`.env.production`**: Production environment (loaded in `pnpm build`)

Both files are committed to git since they don't contain secrets - just public URLs. API keys and other secrets should never be added to these files.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_MCP_SERVER_URL` | Yes | URL of the MCP server endpoint |
| `VITE_ANTHROPIC_API_KEY` | No | Anthropic API key (development fallback only) |

**About API Keys:**
- Users enter their API key via the **Settings UI** (stored in browser localStorage)
- The `VITE_ANTHROPIC_API_KEY` env var serves as a fallback if no key is in localStorage
- **For development:** Optionally set in `.env.development.local` (gitignored) for convenience
- **For production:** **NEVER set in `.env.production`** - that file is committed to git!

### Configuration for Development

The development environment (`.env.development`) is pre-configured to connect to the local MCP server:

```env
VITE_MCP_SERVER_URL=http://localhost:8888/mcp
```

Make sure to start the `remote-mcp-with-ui-starter` server before running the chat UI in development.

### Configuration for Production

**⚠️ IMPORTANT: If you fork this template**, update the production URL in `.env.production`:

```env
VITE_MCP_SERVER_URL=https://your-worker-name.your-username.workers.dev/mcp
```

Replace with your actual deployed MCP server URL.

### Local Overrides

You can create `.env.development.local` or `.env.production.local` for personal overrides (gitignored):

```env
# Override MCP server URL
VITE_MCP_SERVER_URL=http://localhost:3000/mcp

# Optional: Set your Anthropic API key for development convenience
# (Saves you from entering it in the Settings UI every time)
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**Security Note:** Never commit these `.local` files to git - they're automatically ignored and may contain your personal API keys.

## Project Structure

```
chat-ui/
├── src/
│   ├── components/       # React components
│   │   ├── ui/          # Shadcn UI components
│   │   └── ...          # Feature components
│   ├── lib/             # Utility functions
│   └── main.tsx         # App entry point
├── .env.development     # Development environment variables
├── .env.production      # Production environment variables
├── vite.config.ts       # Vite configuration
└── package.json         # Dependencies & scripts
```

## MCP Integration

The chat UI connects to an MCP server and:

1. Lists available tools from the server
2. Allows the AI to call tools dynamically
3. Displays MCP UI resources (iframes, HTML) in the side panel
4. Supports WebMCP for dynamic tool registration from embedded apps

## Development Workflow

### Running with Local MCP Server

1. Start the MCP server:
   ```bash
   cd ../remote-mcp-with-ui-starter
   pnpm dev
   ```

2. In a new terminal, start the chat UI:
   ```bash
   cd ../chat-ui
   pnpm dev
   ```

3. Open http://localhost:5173 in your browser

### Testing MCP Tools

The chat UI will automatically discover and display all tools available from the connected MCP server. You can test tools by asking the AI to use them.

## Deployment

### Option 1: Static Deployment (Recommended)

Build and deploy the static files to any hosting service (Vercel, Netlify, Cloudflare Pages):

```bash
pnpm build
# Upload dist/ folder to your hosting service
```

Make sure to set the `VITE_MCP_SERVER_URL` environment variable in your hosting service's settings to point to your production MCP server.

### Option 2: Cloudflare Workers Deployment

You can also deploy to Cloudflare Workers (already configured):

```bash
pnpm deploy
```

This uses the Cloudflare Vite plugin for serverless deployment.

## Troubleshooting

### MCP Server Connection Issues

1. Check that the MCP server is running:
   ```bash
   curl http://localhost:8888/mcp
   ```

2. Verify the `VITE_MCP_SERVER_URL` in your environment file

3. Check browser console for CORS errors

### Build Errors

```bash
# Clean and rebuild
rm -rf dist/ node_modules/.vite/
pnpm install
pnpm build
```

## Contributing

This chat UI is part of the [WebMCP-org monorepo](https://github.com/WebMCP-org/npm-packages).

## License

MIT - See the repository root for license information.
