<div align="center">
  <img src="./public/mcp-b-logo.png" alt="MCP-B Logo" width="120" />

  # Chat UI with MCP Integration

  A production-ready chat interface with Model Context Protocol server integration

  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-19+-61dafb.svg)](https://react.dev/)
  [![Vite](https://img.shields.io/badge/Vite-6+-646cff.svg)](https://vitejs.dev/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

</div>

---

## Overview

Modern chat interface built with React, TypeScript, and Vite that integrates with Model Context Protocol (MCP) servers. Supports dynamic tool registration, real-time messaging, and embedded UI resources.

### Key Features

- Real-time chat interface with AI assistant integration
- MCP server integration with dynamic tool registration
- Support for MCP UI resources (iframes, HTML, remote DOM)
- Modern UI built with Tailwind CSS and Shadcn components
- Responsive design optimized for desktop and mobile
- Production monitoring with Sentry error tracking
- Progressive Web App (PWA) capabilities

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development](#development)
- [Deployment](#deployment)
- [MCP Integration](#mcp-integration)
- [Monitoring](#monitoring)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Prerequisites

- Node.js 22.12 or higher
- pnpm (recommended) or npm
- Running MCP server (e.g., `remote-mcp-with-ui-starter`)

## Installation

```bash
# Install dependencies
pnpm install
```

## Configuration

### Environment Variables

The application uses environment-specific configuration files:

| File | Purpose | Committed |
|------|---------|-----------|
| `.env.development` | Development configuration | Yes (no secrets) |
| `.env.production` | Production configuration | Yes (no secrets) |
| `.env.*.local` | Local overrides | No (gitignored) |

#### Required Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VITE_MCP_SERVER_URL` | Yes | MCP server endpoint URL | `http://localhost:8888/mcp` (dev) |
| `VITE_ANTHROPIC_API_KEY` | No | Anthropic API key (fallback) | None |
| `VITE_SENTRY_DSN` | No | Sentry error tracking DSN | None |
| `VITE_SENTRY_ENVIRONMENT` | No | Sentry environment identifier | `development` or `production` |

#### API Key Management

API keys are primarily managed through the Settings UI and stored in browser localStorage. The `VITE_ANTHROPIC_API_KEY` environment variable serves as a fallback.

**Security best practices:**
- Use Settings UI for production API keys
- Never commit API keys to `.env.production`
- Use `.env.development.local` for local development keys
- All `.local` files are automatically gitignored

#### Development Configuration

Default development configuration (`.env.development`):

```env
VITE_MCP_SERVER_URL=http://localhost:8888/mcp
```

Start the MCP server before running the chat UI:

```bash
# Terminal 1 - Start MCP server
cd ../remote-mcp-with-ui-starter
pnpm dev

# Terminal 2 - Start chat UI
cd ../chat-ui
pnpm dev
```

#### Production Configuration

Update `.env.production` with your deployed MCP server URL:

```env
VITE_MCP_SERVER_URL=https://your-worker.workers.dev/mcp
```

#### Local Overrides

Create `.env.development.local` for personal development settings:

```env
VITE_MCP_SERVER_URL=http://localhost:3000/mcp
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key
```

## Development

### Running the Application

```bash
# Start development server
pnpm dev
```

Application available at `http://localhost:5173`

### Building for Production

```bash
# Create production build
pnpm build

# Preview production build
pnpm preview
```

### Development Workflow

1. Start the MCP server (see [Configuration](#configuration))
2. Start the chat UI development server
3. Open `http://localhost:5173` in your browser
4. Enter your Anthropic API key in Settings (or use `.env.development.local`)

## Monitoring

### Error Tracking with Sentry

Production monitoring is available through [Sentry](https://sentry.io) integration.

#### Features

- Error tracking for JavaScript and React component errors
- Performance monitoring for page load and API requests
- Session replay (10% sample rate, 100% on errors)
- Automatic source map upload for production builds

#### Configuration

Set the Sentry DSN in environment files:

```env
VITE_SENTRY_DSN=your-sentry-dsn
VITE_SENTRY_ENVIRONMENT=production
```

For source map upload during production builds:

```bash
export SENTRY_ORG=your-org
export SENTRY_PROJECT=your-project
export SENTRY_AUTH_TOKEN=your-token

pnpm build
```

#### Privacy

- API keys are automatically filtered from error reports
- Session replay samples 10% of sessions (100% on errors)
- PII data includes IP addresses by default
- Disable by removing `VITE_SENTRY_DSN` from environment files

### Cloudflare Worker Monitoring

The Cloudflare Worker backend includes Sentry instrumentation for API error tracking and AI agent monitoring.

Configure worker secrets:

```bash
wrangler secret put SENTRY_DSN
wrangler secret put ENVIRONMENT
wrangler secret put ALLOWED_ORIGINS
```

The worker automatically tracks:
- Uncaught exceptions in API endpoints
- API request performance
- AI model calls and token usage
- Tool execution statistics
- Full conversation context (inputs/outputs)

#### CORS Configuration

Default allowed origins for development:
- `http://localhost:5173` (Vite)
- `http://localhost:8788` (Wrangler)

For production, configure `ALLOWED_ORIGINS` with your deployment URLs.

Local development configuration (`.dev.vars`):

```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8788
```

## Project Structure

```
chat-ui/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # Shadcn UI components
│   │   └── ...             # Feature components
│   ├── lib/                # Utility functions
│   └── main.tsx            # Application entry point
├── public/                 # Static assets
├── .env.development        # Development environment
├── .env.production         # Production environment
├── vite.config.ts          # Vite configuration
└── package.json            # Dependencies and scripts
```

## MCP Integration

The chat interface connects to MCP servers to:

- Discover and list available tools
- Execute tools dynamically through AI interactions
- Display MCP UI resources (iframes, HTML, remote DOM) in side panel
- Support WebMCP for dynamic tool registration from embedded applications

### Testing MCP Tools

Tools are automatically discovered from the connected MCP server. Test tools by asking the AI assistant to use them in conversation.

## Deployment

### Static Hosting (Recommended)

Deploy to Vercel, Netlify, Cloudflare Pages, or similar:

```bash
# Build for production
pnpm build

# Deploy dist/ folder to your hosting service
```

Configure `VITE_MCP_SERVER_URL` environment variable in your hosting service to point to your production MCP server.

### Cloudflare Workers

Deploy to Cloudflare Workers using the Vite plugin:

```bash
pnpm deploy
```

## Troubleshooting

### MCP Server Connection

Verify MCP server is running:

```bash
curl http://localhost:8888/mcp
```

Check environment configuration:

```bash
cat .env.development
```

Review browser console for CORS or connection errors.

### Build Issues

Clean and rebuild:

```bash
rm -rf dist/ node_modules/.vite/
pnpm install
pnpm build
```

## Contributing

Part of the [WebMCP-org monorepo](https://github.com/WebMCP-org/npm-packages). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

[MIT License](../../LICENSE)
