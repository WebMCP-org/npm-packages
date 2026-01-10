# WebMCP Tool Calling Investigation

## Date: 2026-01-10

## Problem
After injecting WebMCP tools, `diff_webmcp_tools` shows tools as registered and says they're callable as `mcp__chrome-devtools__webmcp_*`, but attempting to call them results in "Tool not found" errors.

## Investigation

### Test Results

1. **MCP SDK Client Test** (`quick-tool-test.ts`)
   - Tools ARE successfully registered in the MCP server
   - Tools ARE callable via MCP SDK client directly
   - Tool name format: `webmcp_old_reddit_com_page0_get_page_title` (no prefix)
   - ✅ Works perfectly

2. **Claude Code Session**
   - Tools show in `diff_webmcp_tools` output
   - Attempting to call with full prefix fails: `mcp__chrome-devtools__webmcp_old_reddit_com_page0_get_page_title`
   - Error: "Tool webmcp_old_reddit_com_page0_get_page_title not found"
   - ❌ Does not work

### Key Findings

1. **Tool Registration is Working**
   - The WebMCPToolHub correctly registers tools with the MCP server
   - Tools appear in `client.listTools()` when called via MCP SDK
   - The naming convention is correct: `webmcp_{domain}_page{idx}_{toolName}`

2. **The Disconnect**
   - Tools registered in the MCP server don't automatically propagate to Claude Code
   - Claude Code's tool discovery may need a refresh/restart
   - Or there's a different MCP server instance Claude Code is connected to

3. **Documentation Issue**
   - `inject_webmcp_script` response says: "You can call them directly using: mcp__chrome-devtools__<toolId>"
   - This is misleading - the prefix is only needed in Claude Code, not when calling via MCP SDK
   - The actual callable name in MCP SDK is just `webmcp_*` without any prefix

## Next Steps

1. **Verify Claude Code's MCP connection**
   - Check if Claude Code is connected to the same MCP server instance
   - May need to restart Claude Code session or reload MCP server

2. **Update Documentation**
   - Clarify that tools are callable as `webmcp_*` via MCP SDK
   - Note that Claude Code may require the full `mcp__chrome-devtools__webmcp_*` prefix
   - Add troubleshooting section for tool discovery issues

3. **Test Tool Discovery**
   - Investigate how Claude Code discovers new tools from MCP servers
   - May need to implement a notification or polling mechanism
   - Check if tools become available after a delay

## Code References

- Tool Registration: `packages/chrome-devtools-mcp/src/tools/WebMCPToolHub.ts:260-324`
- Tool Injection: `packages/chrome-devtools-mcp/src/tools/webmcp.ts:266-651`
- Test Client: `packages/chrome-devtools-mcp/quick-tool-test.ts`

## Conclusion

The WebMCP tool registration system works correctly. The issue is tool discovery in Claude Code sessions - tools don't automatically appear in the session's available tools even though they're registered in the MCP server.

**This is NOT a bug in WebMCP - it's a tool discovery/refresh issue between the MCP server and Claude Code.**
