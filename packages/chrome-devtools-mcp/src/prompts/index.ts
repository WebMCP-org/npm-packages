/**
 * @license
 * Copyright 2025 WebMCP Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpServer} from '../third_party/index.js';
import {zod as z} from '../third_party/index.js';

/**
 * Registers MCP prompts for AI-driven development workflows.
 */
export function registerPrompts(server: McpServer): void {
  // WebMCP Development Workflow prompt
  server.registerPrompt(
    'webmcp-dev-workflow',
    {
      title: 'WebMCP Development Workflow',
      description:
        'Guides you through the AI-driven development workflow for building and testing WebMCP tools. ' +
        'Use this when developing web applications that expose MCP tools.',
    },
    () => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are helping me develop WebMCP tools for my web application. Here's the workflow:

## AI-Driven Tool Development Workflow

1. **Write the Tool**: I'll ask you to create a WebMCP tool in my codebase using @mcp-b/global
2. **Hot Reload**: My dev server will automatically reload with the new tool
3. **Navigate**: Use navigate_page to open my dev server (e.g., http://localhost:3000)
4. **Discover**: Use list_webmcp_tools to see registered tools (shown with callable names like webmcp_localhost_3000_page0_my_tool)
5. **Test**: Call the tool directly by its prefixed name (e.g., webmcp_localhost_3000_page0_my_tool)
6. **Iterate**: If something is wrong, fix the code and repeat

## Tool Registration Pattern

\`\`\`typescript
import '@mcp-b/global';

navigator.modelContext.registerTool({
  name: 'tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  },
  async execute(args) {
    // Implementation
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    };
  }
});
\`\`\`

What would you like to build? Describe the tool you need and I'll help you implement and test it.`,
            },
          },
        ],
      };
    },
  );

  // Test WebMCP Tool prompt
  server.registerPrompt(
    'test-webmcp-tool',
    {
      title: 'Test WebMCP Tool',
      description:
        'Systematically test a WebMCP tool on the current page. ' +
        'Discovers available tools and helps you test them with various inputs.',
      argsSchema: {
        toolName: z
          .string()
          .optional()
          .describe('Optional: specific tool name to test'),
        devServerUrl: z
          .string()
          .optional()
          .describe(
            'Optional: URL of your dev server (default: http://localhost:3000)',
          ),
      },
    },
    args => {
      const url = args?.devServerUrl || 'http://localhost:3000';
      const toolNameInstruction = args?.toolName
        ? `Focus on testing the "${args.toolName}" tool specifically.`
        : 'List all available tools and help me choose which one to test.';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Help me test WebMCP tools on my development server.

## Test Plan

1. Navigate to ${url}
2. Use list_webmcp_tools to discover registered tools (shown with callable names like webmcp_localhost_3000_page0_tool_name)
3. ${toolNameInstruction}
4. Call the tool directly by its prefixed name and test with various inputs:
   - Valid inputs (happy path)
   - Edge cases (empty strings, nulls, etc.)
   - Invalid inputs (wrong types, missing required fields)
5. Report the results and any issues found

Please start by navigating to the page and listing the available tools.`,
            },
          },
        ],
      };
    },
  );

  // Debug WebMCP Connection prompt
  server.registerPrompt(
    'debug-webmcp',
    {
      title: 'Debug WebMCP Connection',
      description:
        'Troubleshoot WebMCP connection issues. ' +
        'Helps diagnose why tools are not appearing or not working.',
      argsSchema: {
        url: z
          .string()
          .optional()
          .describe('URL of the page to debug (default: current page)'),
      },
    },
    args => {
      const urlInstruction = args?.url
        ? `Navigate to ${args.url} first.`
        : 'Use the current page.';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Help me debug WebMCP connectivity issues.

${urlInstruction}

## Debugging Steps

1. **Check page load**: Take a snapshot to verify the page loaded correctly
2. **Check console**: Use list_console_messages to look for:
   - Errors loading @mcp-b/global
   - Tool registration errors
   - Any JavaScript errors
3. **Test WebMCP**: Try list_webmcp_tools to see if connection works
4. **Verify registration**: If no tools appear, check if the code properly imports '@mcp-b/global' and calls registerTool

## Common Issues

- **"WebMCP not detected"**: The page doesn't have @mcp-b/global loaded
- **Tools not appearing**: Registration code might not be executing
- **Connection timeout**: Page might still be loading

Please start the diagnosis.`,
            },
          },
        ],
      };
    },
  );
}
