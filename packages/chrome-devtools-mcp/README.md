# @mcp-b/chrome-devtools-mcp

> MCP server for Chrome DevTools - Let Claude, Cursor, Copilot, and Gemini control and debug Chrome browser

[![npm @mcp-b/chrome-devtools-mcp package](https://img.shields.io/npm/v/@mcp-b/chrome-devtools-mcp.svg)](https://www.npmjs.com/package/@mcp-b/chrome-devtools-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/chrome-devtools-mcp?style=flat-square)](https://www.npmjs.com/package/@mcp-b/chrome-devtools-mcp)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![28 Tools](https://img.shields.io/badge/MCP_Tools-28-green?style=flat-square)](./docs/tool-reference.md)
[![Chrome](https://img.shields.io/badge/Chrome-DevTools-4285F4?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/devtools/)

📖 **[WebMCP Documentation](https://docs.mcp-b.ai)** | 🚀 **[Quick Start](https://docs.mcp-b.ai/quickstart)** | 🔌 **[Connecting Agents](https://docs.mcp-b.ai/connecting-agents)**

**@mcp-b/chrome-devtools-mcp** lets AI coding agents like Claude, Gemini, Cursor, and Copilot control and inspect a live Chrome browser via the Model Context Protocol (MCP). Get performance insights, debug network requests, take screenshots, and interact with website-specific MCP tools through WebMCP integration.

> **Note:** This is a fork of [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
> published under the `@mcp-b` scope. It includes WebMCP integration for connecting to MCP tools
> registered on webpages. The original project is developed by Google LLC and the ChromeDevTools team.
> See [NOTICE](./NOTICE) for attribution details.

## Why Use @mcp-b/chrome-devtools-mcp?

| Feature                        | Benefit                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| **28 MCP Tools**               | Comprehensive browser control - navigation, input, screenshots, performance, debugging |
| **WebMCP Integration**         | Connect to website-specific AI tools via `@mcp-b/global`                               |
| **Performance Analysis**       | Chrome DevTools-powered performance insights and trace recording                       |
| **Reliable Automation**        | Puppeteer-based with automatic waiting for action results                              |
| **Works with All MCP Clients** | Claude, Cursor, Copilot, Gemini CLI, VS Code, Windsurf, and more                       |

## What's Different from Chrome DevTools MCP?

This fork adds **WebMCP integration** - the ability to call MCP tools that are registered directly on webpages. This unlocks a powerful new workflow:

| Feature                        | Chrome DevTools MCP | @mcp-b/chrome-devtools-mcp |
| ------------------------------ | ------------------- | -------------------------- |
| Browser automation             | ✅                  | ✅                         |
| Performance analysis           | ✅                  | ✅                         |
| Network inspection             | ✅                  | ✅                         |
| Screenshot/snapshot            | ✅                  | ✅                         |
| **Call website MCP tools**     | ❌                  | ✅                         |
| **List website MCP tools**     | ❌                  | ✅                         |
| **AI-driven tool development** | ❌                  | ✅                         |

The key addition is the `list_webmcp_tools` and `call_webmcp_tool` tools that let your AI agent interact with MCP tools that websites expose via [@mcp-b/global](https://www.npmjs.com/package/@mcp-b/global).

## AI-Driven Development Workflow

One of the most powerful use cases for this package is **AI-driven tool development** - essentially test-driven development for AI agents. Here's how it works:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AI Development Feedback Loop                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   1. AI writes WebMCP tool code ──────────────────────────┐        │
│                                                            │        │
│   2. Dev server hot-reloads ◄─────────────────────────────┘        │
│                                                                     │
│   3. AI opens browser via Chrome DevTools MCP                       │
│            │                                                        │
│            ▼                                                        │
│   4. AI calls list_webmcp_tools to see the new tool                 │
│            │                                                        │
│            ▼                                                        │
│   5. AI calls call_webmcp_tool to test it                           │
│            │                                                        │
│            ▼                                                        │
│   6. AI sees results, iterates if needed ───────► Back to step 1    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Example: Building a Search Tool

Imagine you're building a web app and want to add a search feature exposed as an MCP tool:

**Step 1: Ask your AI agent to create the tool**

```
Create a WebMCP tool called "search_products" that searches our product catalog
```

**Step 2: The AI writes the code in your app**

```typescript
// Your AI agent writes this code
import '@mcp-b/global';

navigator.modelContext.registerTool({
  name: 'search_products',
  description: 'Search for products by name or category',
  inputSchema: {
    type: 'object',
    properties: {
      query: {type: 'string'},
      category: {type: 'string'},
    },
    required: ['query'],
  },
  async execute({query, category}) {
    const results = await searchProducts(query, category);
    return {
      content: [{type: 'text', text: JSON.stringify(results)}],
    };
  },
});
```

**Step 3: Your dev server hot-reloads**

**Step 4: The AI tests it via Chrome DevTools MCP**

```
Navigate to http://localhost:3000 and list the available tools
```

The AI sees the new `search_products` tool appear.

**Step 5: The AI calls the tool to verify it works**

```
Use the search_products tool to search for "headphones"
```

**Step 6: If something is wrong, the AI iterates**

The AI can see the actual response, fix any bugs, and repeat until it works perfectly.

### Why This Matters

This creates a tight feedback loop where your AI assistant can:

- **Write** WebMCP tools in your codebase
- **Deploy** them automatically via hot-reload
- **Discover** them through `list_webmcp_tools`
- **Test** them through `call_webmcp_tool`
- **Debug** issues using console messages and snapshots
- **Iterate** until the tool works correctly

This is like **TDD for AI** - the AI can build and verify its own tools in real-time.

## [Tool reference](./docs/tool-reference.md) | [Changelog](./CHANGELOG.md) | [Contributing](./CONTRIBUTING.md) | [Troubleshooting](./docs/troubleshooting.md) | [Design Principles](./docs/design-principles.md)

## Key features

- **Get performance insights**: Uses [Chrome
  DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record
  traces and extract actionable performance insights.
- **Advanced browser debugging**: Analyze network requests, take screenshots and
  check the browser console.
- **Reliable automation**. Uses
  [puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in
  Chrome and automatically wait for action results.
- **WebMCP integration**: Connect to MCP tools registered on webpages via
  [@mcp-b/global](https://www.npmjs.com/package/@mcp-b/global), enabling AI
  agents to use website-specific functionality.

## Disclaimers

`@mcp-b/chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you don't want to share with
MCP clients.

## Requirements

- [Node.js](https://nodejs.org/) v20.19 or a newer [latest maintenance LTS](https://github.com/nodejs/Release#release-schedule) version.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/).

## Getting started

Add the following config to your MCP client:

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

> [!NOTE]
> Using `@mcp-b/chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of this Chrome DevTools MCP server with WebMCP integration.

### MCP Client configuration

<details>
  <summary>Amp</summary>
  Follow https://ampcode.com/manual#mcp and use the config provided above. You can also install the Chrome DevTools MCP server using the CLI:

```bash
amp mcp add chrome-devtools -- npx @mcp-b/chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Antigravity</summary>

To use the Chrome DevTools MCP server follow the instructions from <a href="https://antigravity.google/docs/mcp">Antigravity's docs<a/> to install a custom MCP server. Add the following config to the MCP servers config:

```bash
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "@mcp-b/chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222",
        "-y"
      ]
    }
  }
}
```

This will make the Chrome DevTools MCP server automatically connect to the browser that Antigravity is using. If you are not using port 9222, make sure to adjust accordingly.

Chrome DevTools MCP will not start the browser instance automatically using this approach as as the Chrome DevTools MCP server runs in Antigravity's built-in browser. If the browser is not already running, you have to start it first by clicking the Chrome icon at the top right corner.

</details>

<details>
  <summary>Claude Code</summary>
    Use the Claude Code CLI to add the Chrome DevTools MCP server (<a href="https://docs.anthropic.com/en/docs/claude-code/mcp">guide</a>):

```bash
claude mcp add chrome-devtools npx @mcp-b/chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Cline</summary>
  Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
</details>

<details>
  <summary>Codex</summary>
  Follow the <a href="https://github.com/openai/codex/blob/main/docs/advanced.md#model-context-protocol-mcp">configure MCP guide</a>
  using the standard config from above. You can also install the Chrome DevTools MCP server using the Codex CLI:

```bash
codex mcp add chrome-devtools -- npx @mcp-b/chrome-devtools-mcp@latest
```

**On Windows 11**

Configure the Chrome install location and increase the startup timeout by updating `.codex/config.toml` and adding the following `env` and `startup_timeout_ms` parameters:

```
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "@mcp-b/chrome-devtools-mcp@latest",
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

</details>

<details>
  <summary>Copilot CLI</summary>

Start Copilot CLI:

```
copilot
```

Start the dialog to add a new MCP server by running:

```
/mcp add
```

Configure the following fields and press `CTRL+S` to save the configuration:

- **Server name:** `chrome-devtools`
- **Server Type:** `[1] Local`
- **Command:** `npx -y @mcp-b/chrome-devtools-mcp@latest`

</details>

<details>
  <summary>Copilot / VS Code</summary>

**Click the button to install:**

[<img src="https://img.shields.io/badge/Install-VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode" alt="Install in VS Code">](https://vscode.dev/redirect/mcp/install?name=%40mcp-b%2Fchrome-devtools-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40mcp-b%2Fchrome-devtools-mcp%40latest%22%5D%2C%22env%22%3A%7B%7D%7D)

[<img src="https://img.shields.io/badge/Install-VS%20Code%20Insiders-3578CF?style=for-the-badge&logo=visualstudiocode" alt="Install in VS Code Insiders">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522%2540mcp-b%252Fchrome-devtools-mcp%2522%252C%2522config%2522%253A%257B%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540mcp-b%252Fchrome-devtools-mcp%2540latest%2522%255D%252C%2522env%2522%253A%257B%257D%257D%257D)

**Or install manually:**

Follow the MCP install <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server">guide</a>,
with the standard config from above. You can also install the Chrome DevTools MCP server using the VS Code CLI:

```bash
code --add-mcp '{"name":"@mcp-b/chrome-devtools-mcp","command":"npx","args":["-y","@mcp-b/chrome-devtools-mcp@latest"],"env":{}}'
```

</details>

<details>
  <summary>Cursor</summary>

**Click the button to install:**

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=chrome-devtools&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBtY3AtYi9jaHJvbWUtZGV2dG9vbHMtbWNwQGxhdGVzdCJdfQ%3D%3D)

**Or install manually:**

Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the config provided above.

</details>

<details>
  <summary>Factory CLI</summary>
Use the Factory CLI to add the Chrome DevTools MCP server (<a href="https://docs.factory.ai/cli/configuration/mcp">guide</a>):

```bash
droid mcp add chrome-devtools "npx -y @mcp-b/chrome-devtools-mcp@latest"
```

</details>

<details>
  <summary>Gemini CLI</summary>
Install the Chrome DevTools MCP server using the Gemini CLI.

**Project wide:**

```bash
gemini mcp add chrome-devtools npx @mcp-b/chrome-devtools-mcp@latest
```

**Globally:**

```bash
gemini mcp add -s user chrome-devtools npx @mcp-b/chrome-devtools-mcp@latest
```

Alternatively, follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Gemini Code Assist</summary>
  Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">configure MCP guide</a>
  using the standard config from above.
</details>

<details>
  <summary>JetBrains AI Assistant & Junie</summary>

Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` -> `Add`. Use the config provided above.
The same way `@mcp-b/chrome-devtools-mcp` can be configured for JetBrains Junie in `Settings | Tools | Junie | MCP Settings` -> `Add`. Use the config provided above.

</details>

<details>
  <summary>Kiro</summary>

In **Kiro Settings**, go to `Configure MCP` > `Open Workspace or User MCP Config` > Use the configuration snippet provided above.

Or, from the IDE **Activity Bar** > `Kiro` > `MCP Servers` > `Click Open MCP Config`. Use the configuration snippet provided above.

</details>

<details>
  <summary>Qoder</summary>

In **Qoder Settings**, go to `MCP Server` > `+ Add` > Use the configuration snippet provided above.

Alternatively, follow the <a href="https://docs.qoder.com/user-guide/chat/model-context-protocol">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Qoder CLI</summary>

Install the Chrome DevTools MCP server using the Qoder CLI (<a href="https://docs.qoder.com/cli/using-cli#mcp-servsers">guide</a>):

**Project wide:**

```bash
qodercli mcp add chrome-devtools -- npx @mcp-b/chrome-devtools-mcp@latest
```

**Globally:**

```bash
qodercli mcp add -s user chrome-devtools -- npx @mcp-b/chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Visual Studio</summary>

**Click the button to install:**

[<img src="https://img.shields.io/badge/Visual_Studio-Install-C16FDE?logo=visualstudio&logoColor=white" alt="Install in Visual Studio">](https://vs-open.link/mcp-install?%7B%22name%22%3A%22%40mcp-b%2Fchrome-devtools-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40mcp-b%2Fchrome-devtools-mcp%40latest%22%5D%7D)

</details>

<details>
  <summary>Warp</summary>

Go to `Settings | AI | Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the config provided above.

</details>

<details>
  <summary>Windsurf</summary>
  Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json">configure MCP guide</a>
  using the standard config from above.
</details>

### Your first prompt

Enter the following prompt in your MCP Client to check if everything is working:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should open the browser and record a performance trace.

> [!NOTE]  
> The MCP server will start the browser automatically once the MCP client uses a tool that requires a running browser instance. Connecting to the Chrome DevTools MCP server on its own will not automatically start the browser.

## Tools

If you run into any issues, checkout our [troubleshooting guide](./docs/troubleshooting.md).

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Input automation** (8 tools)
  - [`click`](docs/tool-reference.md#click)
  - [`drag`](docs/tool-reference.md#drag)
  - [`fill`](docs/tool-reference.md#fill)
  - [`fill_form`](docs/tool-reference.md#fill_form)
  - [`handle_dialog`](docs/tool-reference.md#handle_dialog)
  - [`hover`](docs/tool-reference.md#hover)
  - [`press_key`](docs/tool-reference.md#press_key)
  - [`upload_file`](docs/tool-reference.md#upload_file)
- **Navigation automation** (6 tools)
  - [`close_page`](docs/tool-reference.md#close_page)
  - [`list_pages`](docs/tool-reference.md#list_pages)
  - [`navigate_page`](docs/tool-reference.md#navigate_page)
  - [`new_page`](docs/tool-reference.md#new_page)
  - [`select_page`](docs/tool-reference.md#select_page)
  - [`wait_for`](docs/tool-reference.md#wait_for)
- **Emulation** (2 tools)
  - [`emulate`](docs/tool-reference.md#emulate)
  - [`resize_page`](docs/tool-reference.md#resize_page)
- **Performance** (3 tools)
  - [`performance_analyze_insight`](docs/tool-reference.md#performance_analyze_insight)
  - [`performance_start_trace`](docs/tool-reference.md#performance_start_trace)
  - [`performance_stop_trace`](docs/tool-reference.md#performance_stop_trace)
- **Network** (2 tools)
  - [`get_network_request`](docs/tool-reference.md#get_network_request)
  - [`list_network_requests`](docs/tool-reference.md#list_network_requests)
- **Debugging** (5 tools)
  - [`evaluate_script`](docs/tool-reference.md#evaluate_script)
  - [`get_console_message`](docs/tool-reference.md#get_console_message)
  - [`list_console_messages`](docs/tool-reference.md#list_console_messages)
  - [`take_screenshot`](docs/tool-reference.md#take_screenshot)
  - [`take_snapshot`](docs/tool-reference.md#take_snapshot)
- **Website MCP Tools** (2 tools)
  - [`list_webmcp_tools`](docs/tool-reference.md#list_webmcp_tools) - List available website tools (auto-connects)
  - [`call_webmcp_tool`](docs/tool-reference.md#call_webmcp_tool) - Call a website tool (auto-connects)

<!-- END AUTO GENERATED TOOLS -->

## Prompts

The server includes built-in prompts to help with WebMCP development workflows. Prompts are reusable message templates that guide AI agents through common tasks.

| Prompt                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `webmcp-dev-workflow` | Step-by-step guide for building WebMCP tools with AI     |
| `test-webmcp-tool`    | Systematically test tools with edge cases and validation |
| `debug-webmcp`        | Diagnose WebMCP connection and registration issues       |

### webmcp-dev-workflow

Guides you through the AI-driven development workflow for building and testing WebMCP tools.

**When to use:** Starting a new WebMCP tool and want step-by-step guidance through the write → hot-reload → discover → test → iterate cycle.

**Arguments:** None

**Example:**

```
Use the webmcp-dev-workflow prompt to help me build a search tool
```

### test-webmcp-tool

Systematically test a WebMCP tool with various inputs including valid data, edge cases, and invalid inputs.

**When to use:** You have a tool ready and want to verify it handles all input scenarios correctly.

**Arguments:**

| Argument       | Type   | Required | Description                                       |
| -------------- | ------ | -------- | ------------------------------------------------- |
| `toolName`     | string | No       | Focus testing on a specific tool                  |
| `devServerUrl` | string | No       | Dev server URL (default: `http://localhost:3000`) |

**Examples:**

```
Use the test-webmcp-tool prompt
Use the test-webmcp-tool prompt with toolName=search_products
Use the test-webmcp-tool prompt with devServerUrl=http://localhost:5173 toolName=add_to_cart
```

### debug-webmcp

Troubleshoot WebMCP connection issues and diagnose why tools aren't appearing or working.

**When to use:** Tools aren't being discovered, connections are failing, or you see "WebMCP not detected" errors.

**Arguments:**

| Argument | Type   | Required | Description                               |
| -------- | ------ | -------- | ----------------------------------------- |
| `url`    | string | No       | Page URL to debug (default: current page) |

**Example:**

```
Use the debug-webmcp prompt with url=http://localhost:3000
```

## Configuration

The Chrome DevTools MCP server supports the following configuration option:

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--browserUrl`, `-u`**
  Connect to a running, debuggable Chrome instance (e.g. `http://127.0.0.1:9222`). For more details see: https://github.com/ChromeDevTools/chrome-devtools-mcp#connecting-to-a-running-chrome-instance.
  - **Type:** string

- **`--wsEndpoint`, `-w`**
  WebSocket endpoint to connect to a running Chrome instance (e.g., ws://127.0.0.1:9222/devtools/browser/<id>). Alternative to --browserUrl.
  - **Type:** string

- **`--wsHeaders`**
  Custom headers for WebSocket connection in JSON format (e.g., '{"Authorization":"Bearer token"}'). Only works with --wsEndpoint.
  - **Type:** string

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to false.
  - **Type:** boolean

- **`--userDataDir`**
  Path to the user data directory for Chrome. Default is $HOME/.cache/chrome-devtools-mcp/chrome-profile$CHANNEL_SUFFIX_IF_NON_STABLE
  - **Type:** string

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `stable`, `canary`, `beta`, `dev`

- **`--logFile`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.
  - **Type:** string

- **`--proxyServer`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string

- **`--acceptInsecureCerts`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean

- **`--chromeArg`**
  Additional arguments for Chrome. Only applies when Chrome is launched by `@mcp-b/chrome-devtools-mcp`.
  - **Type:** array

- **`--categoryEmulation`**
  Set to false to exclude tools related to emulation.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryPerformance`**
  Set to false to exclude tools related to performance.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryNetwork`**
  Set to false to exclude tools related to network.
  - **Type:** boolean
  - **Default:** `true`

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in the JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "@mcp-b/chrome-devtools-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

### Connecting via WebSocket with custom headers

You can connect directly to a Chrome WebSocket endpoint and include custom headers (e.g., for authentication):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "@mcp-b/chrome-devtools-mcp@latest",
        "--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--wsHeaders={\"Authorization\":\"Bearer YOUR_TOKEN\"}"
      ]
    }
  }
}
```

To get the WebSocket endpoint from a running Chrome instance, visit `http://127.0.0.1:9222/json/version` and look for the `webSocketDebuggerUrl` field.

You can also run `npx @mcp-b/chrome-devtools-mcp@latest --help` to see all available configuration options.

## Concepts

### User data directory

`@mcp-b/chrome-devtools-mcp` starts a Chrome's stable channel instance using the following user
data directory:

- Linux / macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- Windows: `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

The user data directory is not cleared between runs and shared across
all instances of `@mcp-b/chrome-devtools-mcp`. Set the `isolated` option to `true`
to use a temporary user data dir instead which will be cleared automatically after
the browser is closed.

### Connecting to a running Chrome instance

You can connect to a running Chrome instance by using the `--browser-url` option. This is useful if you want to use your existing Chrome profile or if you are running the MCP server in a sandboxed environment that does not allow starting a new Chrome instance.

Here is a step-by-step guide on how to connect to a running Chrome Stable instance:

**Step 1: Configure the MCP client**

Add the `--browser-url` option to your MCP client configuration. The value of this option should be the URL of the running Chrome instance. `http://127.0.0.1:9222` is a common default.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "@mcp-b/chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

**Step 2: Start the Chrome browser**

> [!WARNING]  
> Enabling the remote debugging port opens up a debugging port on the running browser instance. Any application on your machine can connect to this port and control the browser. Make sure that you are not browsing any sensitive websites while the debugging port is open.

Start the Chrome browser with the remote debugging port enabled. Make sure to close any running Chrome instances before starting a new one with the debugging port enabled. The port number you choose must be the same as the one you specified in the `--browser-url` option in your MCP client configuration.

For security reasons, [Chrome requires you to use a non-default user data directory](https://developer.chrome.com/blog/remote-debugging-port) when enabling the remote debugging port. You can specify a custom directory using the `--user-data-dir` flag. This ensures that your regular browsing profile and data are not exposed to the debugging session.

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Linux**

```bash
/usr/bin/google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Windows**

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile-stable"
```

**Step 3: Test your setup**

After configuring the MCP client and starting the Chrome browser, you can test your setup by running a simple prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should connect to the running Chrome instance and receive a performance report.

If you hit VM-to-host port forwarding issues, see the “Remote debugging between virtual machine (VM) and host fails” section in [`docs/troubleshooting.md`](./docs/troubleshooting.md#remote-debugging-between-virtual-machine-vm-and-host-fails).

For more details on remote debugging, see the [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/remote-debugging/).

## Known limitations

### Operating system sandboxes

Some MCP clients allow sandboxing the MCP server using macOS Seatbelt or Linux
containers. If sandboxes are enabled, `@mcp-b/chrome-devtools-mcp` is not able to start
Chrome that requires permissions to create its own sandboxes. As a workaround,
either disable sandboxing for `@mcp-b/chrome-devtools-mcp` in your MCP client or use
`--browser-url` to connect to a Chrome instance that you start manually outside
of the MCP client sandbox.

## WebMCP Integration

WebMCP enables AI agents to interact with website-specific MCP tools that are
registered directly in webpages. This allows websites to expose custom
functionality to AI agents via the Model Context Protocol.

### How it works

When a webpage uses [@mcp-b/global](https://www.npmjs.com/package/@mcp-b/global)
to register MCP tools, `@mcp-b/chrome-devtools-mcp` can connect to those tools using
the Chrome DevTools Protocol. This creates a bridge between your MCP client
(like Claude Desktop, Cursor, or VS Code Copilot) and the website's tools.

### Prerequisites

The webpage must have WebMCP tools registered. Websites do this by using the
`@mcp-b/global` package:

```javascript
// Example of how a website registers tools (done by the website developer)
import '@mcp-b/global';

navigator.modelContext.registerTool({
  name: 'search_products',
  description: 'Search for products on this website',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  async execute({ query }) {
    // Implementation
    return {
      content: [{ type: 'text', text: JSON.stringify({ results: [...] }) }]
    };
  }
});
```

### Using WebMCP tools

Once you're on a webpage with WebMCP tools, you can use the following workflow:

**1. Navigate to the webpage**

```
Navigate to https://example.com/app
```

**2. List available tools**

```
What tools are available on this website?
```

The AI agent will use `list_webmcp_tools` to show you what functionality the
website exposes. This automatically connects to the page's WebMCP server.

**3. Use the tools**

```
Search for "wireless headphones" using the website's search tool
```

The AI agent will use `call_webmcp_tool` to invoke the website's functionality.

That's it! No explicit connect or disconnect steps needed - WebMCP tools
auto-connect when called and automatically reconnect when you navigate to
a different page.

### Example prompts

Here are some example prompts you can use with WebMCP-enabled websites:

```
What tools does this website have?
```

```
Use the website's search tool to find wireless headphones
```

```
Call the website's form submission tool to fill out the contact form
```

### Troubleshooting WebMCP

- **"WebMCP not detected"**: The current webpage doesn't have `@mcp-b/global`
  installed or no tools are registered. The page needs the WebMCP polyfill loaded.
- **Tool call fails**: Check the tool's input schema matches your parameters.
  Use `list_webmcp_tools` to see the expected input format.
- **Tools not appearing after navigation**: WebMCP auto-reconnects when you
  navigate. If the new page has different tools, call `list_webmcp_tools` again.

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill for websites
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - Browser-specific MCP transports
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp) - React hooks for MCP
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [MCP-B Browser Extension](https://docs.mcp-b.ai/extension)
- [Connecting Agents to WebMCP](https://docs.mcp-b.ai/connecting-agents)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [WebMCP Documentation](https://docs.mcp-b.ai)
