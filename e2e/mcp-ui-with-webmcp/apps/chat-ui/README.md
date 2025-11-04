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
| `VITE_SENTRY_DSN` | No | Sentry DSN for error tracking and performance monitoring |
| `VITE_SENTRY_ENVIRONMENT` | No | Sentry environment name (defaults to `development` or `production`) |

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

## Error Tracking with Sentry

This app integrates [Sentry](https://sentry.io) for error tracking, performance monitoring, and session replay.

### Sentry Configuration

The Sentry DSN is already configured in the environment files:

```env
VITE_SENTRY_DSN=https://b4a37dbe30b24a22f410053f163d9d59@o4510053563891712.ingest.us.sentry.io/4510303954796544
```

### Features Enabled

- **Error Tracking**: Automatic capture of JavaScript errors and React component errors
- **Performance Monitoring**: Track page load times and API request performance
- **Session Replay**: Record user sessions when errors occur (10% sample rate normally, 100% on errors)
- **Source Maps**: Automatically uploaded in production builds for better stack traces

### Source Map Upload (Production)

To upload source maps to Sentry during production builds, set these environment variables:

```bash
export SENTRY_ORG=your-organization-slug
export SENTRY_PROJECT=your-project-name
export SENTRY_AUTH_TOKEN=your-auth-token
```

Then build:

```bash
pnpm build  # Source maps will be uploaded automatically
```

**Note:** Source maps are only uploaded when:
1. Building in production mode (`pnpm build`)
2. `SENTRY_AUTH_TOKEN` is set

Without these environment variables, the app will still work but source maps won't be uploaded to Sentry.

### Testing Sentry Integration

To verify Sentry is working, you can add a test error button to your UI:

```tsx
import * as Sentry from '@sentry/react';

function TestErrorButton() {
  return (
    <button
      onClick={() => {
        Sentry.captureMessage('Test message from chat UI');
        throw new Error('This is a test error!');
      }}
    >
      Test Sentry
    </button>
  );
}
```

The error should appear in your Sentry dashboard at https://sentry.io

### Privacy Considerations

- **PII Data**: Sentry is configured to send default PII (e.g., IP addresses)
- **API Keys**: API keys are NOT sent to Sentry (filtered out automatically)
- **Session Replay**: Only 10% of sessions are recorded (100% when errors occur)
- **Environment Detection**: Errors are tagged with `development` or `production` environment

To disable Sentry, simply remove or comment out `VITE_SENTRY_DSN` from your environment files.

### Cloudflare Worker Integration

The Cloudflare Worker (API endpoint) is also instrumented with Sentry for backend error tracking.

**Worker Environment Variables:**

To configure Sentry for your Cloudflare Worker, set these secrets using Wrangler:

```bash
# Set Sentry DSN for the worker (optional - uses default if not set)
wrangler secret put SENTRY_DSN

# Set environment name (optional - defaults to 'production')
wrangler secret put ENVIRONMENT
```

The worker automatically:
- Captures all uncaught exceptions in the `/api/chat` endpoint
- Tracks performance of API requests
- Sends structured logs to Sentry
- Uses different trace sample rates (100% in dev, 20% in production)

**Default Configuration:**
- If `SENTRY_DSN` is not set, uses the default DSN
- If `ENVIRONMENT` is not set, defaults to `production`
- Errors in the chat route are automatically caught and reported

### CORS Configuration

The worker implements strict CORS (Cross-Origin Resource Sharing) to protect your API endpoint from unauthorized access.

**Allowed Origins:**

By default, the worker only allows requests from:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:8788` (Wrangler dev server)

**For Production Deployments:**

Set the `ALLOWED_ORIGINS` environment variable to include your production URLs:

```bash
# Set allowed origins for production
wrangler secret put ALLOWED_ORIGINS
# Enter comma-separated URLs: https://your-chat-ui.pages.dev,https://your-custom-domain.com
```

**For Local Development:**

Create a `.dev.vars` file (gitignored) with:

```bash
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8788,http://localhost:3000
```

Then regenerate types:

```bash
pnpm cf-typegen
```

**Security Features:**
- Rejects requests from unlisted origins
- Restricts allowed HTTP methods to GET, POST, OPTIONS
- Restricts allowed headers to Content-Type and X-Anthropic-API-Key
- Enables credentials for secure cookie/auth handling

### AI Agent Monitoring

The worker includes comprehensive AI agent monitoring through Sentry's Vercel AI SDK integration. This provides deep visibility into your AI workflows.

**What's Tracked:**

The Vercel AI integration automatically captures detailed telemetry for every AI interaction:

- **Model Calls**: Track which models are invoked (e.g., `claude-haiku-4-5`)
- **Prompts & Responses**: Record full conversation context (inputs/outputs)
- **Tool Executions**: Monitor tool calls and their results
- **Performance Metrics**: Measure latency for each AI operation
- **Token Usage**: Track token consumption per request
- **Error Traces**: Capture detailed stack traces when AI calls fail

**Configuration:**

AI monitoring is enabled by default in the worker with these settings:

```typescript
experimental_telemetry: {
  isEnabled: true,
  functionId: 'chat-api-endpoint',
  recordInputs: true,   // Capture user messages
  recordOutputs: true,  // Capture AI responses
}
```

**Viewing AI Traces:**

In your Sentry dashboard, navigate to:
1. **Performance** → **AI Monitoring** to see:
   - AI pipeline traces with complete workflows
   - Token usage over time
   - Model performance metrics
   - Tool execution statistics

2. **Issues** → Filter by AI operations to see:
   - AI-specific errors and failures
   - Context about failed prompts/responses
   - Performance degradation alerts

**Privacy Note:**
- All prompts and responses are sent to Sentry (PII enabled)
- User messages and AI responses are recorded for debugging
- To disable input/output recording, set `recordInputs: false` and `recordOutputs: false` in the telemetry config
- API keys are automatically filtered and never sent to Sentry

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
