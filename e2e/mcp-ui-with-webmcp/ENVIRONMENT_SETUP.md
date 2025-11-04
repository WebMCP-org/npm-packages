# Environment Setup Guide

This document explains the environment variable configuration for the MCP UI + WebMCP monorepo.

## Overview

Both the **chat-ui** and **remote-mcp-with-ui-starter** apps use environment-specific configuration files that are committed to git (since they contain only public URLs, no secrets).

## Apps Configuration

### 1. Remote MCP Server (`apps/remote-mcp-with-ui-starter`)

Uses Wrangler's `.vars` files for Cloudflare Workers deployment:

#### Files
- `.dev.vars` - Development environment
- `.prod.vars` - Production environment
- `deploy.sh` - Custom script to load production vars

#### Configuration

**Development (`.dev.vars`):**
```env
APP_URL=http://localhost:8888
```

**Production (`.prod.vars`):**
```env
APP_URL=https://mcp-ui-with-webmcp-my-mcp-server.alexmnahas.workers.dev
```

**⚠️ IMPORTANT FOR FORKERS:** Update `.prod.vars` with YOUR production URL!

#### Usage

```bash
# Development
pnpm dev
# → Runs on http://localhost:8888
# → Loads .dev.vars automatically

# Production
pnpm deploy
# → Runs deploy.sh
# → Loads .prod.vars
# → Deploys to Cloudflare Workers
```

### 2. Chat UI (`apps/chat-ui`)

Uses Vite's environment files for React app:

#### Files
- `.env.development` - Development environment
- `.env.production` - Production environment
- `.env.example` - Template/documentation

#### Configuration

**Development (`.env.development`):**
```env
VITE_MCP_SERVER_URL=http://localhost:8888/mcp
```

**Production (`.env.production`):**
```env
VITE_MCP_SERVER_URL=https://mcp-ui-with-webmcp-my-mcp-server.alexmnahas.workers.dev/mcp
```

**⚠️ IMPORTANT FOR FORKERS:** Update `.env.production` with YOUR MCP server URL!

#### Environment Variables

| Variable | Required | Description | Dev Default | Prod Default |
|----------|----------|-------------|-------------|--------------|
| `VITE_MCP_SERVER_URL` | Yes | MCP server endpoint | `http://localhost:8888/mcp` | Your Workers URL + `/mcp` |
| `VITE_ANTHROPIC_API_KEY` | No | Anthropic API key (fallback) | Not set | **DO NOT SET** |

**About `VITE_ANTHROPIC_API_KEY`:**
- **Primary storage:** Users enter their API key via the Settings UI (stored in browser localStorage)
- **Fallback:** The env var is checked if no key is found in localStorage
- **Development:** You can optionally set this in `.env.development.local` (gitignored) for convenience
- **Production:** **NEVER set this in `.env.production`** - that file is committed to git and deployed publicly
- **Security:** API keys should always come from user input, never from environment files in production

#### Usage

```bash
# Development
pnpm dev
# → Runs on http://localhost:5173
# → Loads .env.development automatically
# → Connects to MCP server at http://localhost:8888/mcp

# Production Build
pnpm build
# → Loads .env.production
# → Builds with production MCP server URL
```

## Development Workflow

### Running Both Apps Together

1. **Terminal 1 - Start MCP Server:**
   ```bash
   cd apps/remote-mcp-with-ui-starter
   pnpm dev
   # Server running at http://localhost:8888
   ```

2. **Terminal 2 - Start Chat UI:**
   ```bash
   cd apps/chat-ui
   pnpm dev
   # UI running at http://localhost:5173
   ```

3. **Open Browser:**
   - Navigate to http://localhost:5173
   - Chat UI automatically connects to http://localhost:8888/mcp

### Local Overrides

For personal development settings, create `.local` files (gitignored):

**Remote MCP Server:**
```bash
# .dev.vars.local or .prod.vars.local
APP_URL=http://localhost:3000
```

**Chat UI:**
```bash
# .env.development.local or .env.production.local
VITE_MCP_SERVER_URL=http://localhost:3000/mcp

# Optional: Set your Anthropic API key for development convenience
# (Saves you from entering it in the Settings UI every time)
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

## Production Deployment

### Remote MCP Server

```bash
cd apps/remote-mcp-with-ui-starter
pnpm deploy
```

This will:
1. Build the project
2. Load variables from `.prod.vars`
3. Deploy to Cloudflare Workers
4. Live at: https://mcp-ui-with-webmcp-my-mcp-server.alexmnahas.workers.dev

### Chat UI

```bash
cd apps/chat-ui
pnpm build
```

Then deploy the `dist/` folder to:
- Vercel
- Netlify
- Cloudflare Pages
- Any static hosting service

Make sure your hosting service is configured to point to your production MCP server URL.

## Why Are These Files Committed?

Unlike typical `.env` files that contain secrets, our committed environment files (`.env.development`, `.env.production`, `.dev.vars`, `.prod.vars`) only contain **public URLs**:

- ✅ MCP server URLs are publicly accessible
- ✅ No sensitive credentials in these files
- ✅ Safe to commit to git
- ✅ Makes onboarding easier for new developers

**What about secrets like API keys?**

API keys and other secrets are handled separately:

- **User-provided:** API keys are entered via the Settings UI and stored in browser localStorage
- **Local development:** Use `.local` files (gitignored) to set `VITE_ANTHROPIC_API_KEY` for convenience
- **Never in production env files:** The `.env.production` file is committed and deployed publicly, so it must NEVER contain API keys

## Gitignore Configuration

Both apps ignore `.local` files for personal overrides:

**Remote MCP Server (`.gitignore`):**
```gitignore
# Track .dev.vars and .prod.vars
# Only ignore local overrides
.dev.vars.local
.prod.vars.local
```

**Chat UI (`.gitignore`):**
```gitignore
# Track .env.development and .env.production
.env*
!.env.example
!.env.development
!.env.production
```

## Troubleshooting

### Chat UI Can't Connect to MCP Server

1. Check MCP server is running:
   ```bash
   curl http://localhost:8888/mcp
   ```

2. Verify `VITE_MCP_SERVER_URL` in `.env.development`:
   ```bash
   cat apps/chat-ui/.env.development
   ```

3. Check browser console for CORS errors

### Production Deployment Issues

1. Verify URLs in `.prod.vars` and `.env.production` match
2. Test MCP server endpoint:
   ```bash
   curl https://your-worker.workers.dev/mcp
   ```
3. Check that both apps are deployed and accessible

## For Template Forkers

When forking this template:

1. **Update Remote MCP Server:**
   - Edit `apps/remote-mcp-with-ui-starter/.prod.vars`
   - Replace with your Cloudflare Workers URL

2. **Update Chat UI:**
   - Edit `apps/chat-ui/.env.production`
   - Replace with your MCP server URL + `/mcp` path

3. **Test locally first:**
   ```bash
   # Terminal 1
   cd apps/remote-mcp-with-ui-starter && pnpm dev

   # Terminal 2
   cd apps/chat-ui && pnpm dev
   ```

4. **Deploy:**
   ```bash
   # Deploy MCP server
   cd apps/remote-mcp-with-ui-starter && pnpm deploy

   # Build and deploy chat UI
   cd apps/chat-ui && pnpm build
   # Then deploy dist/ to your hosting service
   ```

## Summary

| App | Dev File | Prod File | Dev URL | Prod URL |
|-----|----------|-----------|---------|----------|
| remote-mcp-with-ui-starter | `.dev.vars` | `.prod.vars` | http://localhost:8888 | https://...workers.dev |
| chat-ui | `.env.development` | `.env.production` | http://localhost:8888/mcp | https://...workers.dev/mcp |

Both apps are configured to work together out of the box in development, and can be easily customized for production deployment.
