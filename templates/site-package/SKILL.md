---
name: {{site}}-mcp
version: 1.0.0
description: |
  {{Site}} automation tools. Use when the user wants to:
  - [List main capabilities here]

  Triggers: {{site}}, [related keywords]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__chrome-devtools__*
---

# {{Site}} MCP

{{Description of what these tools enable.}}

## Setup

Before using these tools, ensure they're injected into the page:

1. **Navigate to {{Site}}**:
   ```javascript
   navigate_page({ url: "{{site_url}}" })
   ```

2. **Inject tools**:
   ```javascript
   inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })
   ```

3. **Verify and wait for registration**:
   ```javascript
   diff_webmcp_tools()  // Should show {{site}} tools
   ```

   After injection, tools are automatically registered with the MCP server and become
   immediately callable. The Chrome DevTools MCP server sends a `tools/list_changed`
   notification to inform Claude Code that new tools are available.

The tools source is bundled at `tools/src/{{site}}.ts`.

## Calling Tools

Once injected, tools are registered with naming pattern: `webmcp_{{sanitized_domain}}_page{N}_{tool_name}`

Example for {{site_url}}:
- `webmcp_{{site}}_page0_get_page_info`
- `webmcp_{{site}}_page0_search_items`

### In Claude Code

Tools appear automatically in your available tools after injection. Call them directly:

```javascript
// After injection completes, tools are immediately available
mcp__chrome-devtools__webmcp_{{site}}_page0_get_page_info({})
```

**Note**: The `mcp__chrome-devtools__` prefix is added by Claude Code when calling
tools from the chrome-devtools MCP server.

### In MCP SDK Client

When using the MCP SDK directly (e.g., in tests), call tools by their registered name:

```javascript
await client.callTool({
  name: 'webmcp_{{site}}_page0_get_page_info',
  arguments: {}
})
```

**No prefix needed** when calling via MCP SDK - just the tool name as shown in `listTools()`.

## Testing Your Tools

After injection, you may see "Connection failed" - **this is normal**. Tools are still registered and working.

### Method 1: Test via Browser Console

```javascript
// List registered tools
const tools = navigator.modelContext.dynamicTools;
console.log('Registered tools:', Array.from(tools.keys()));

// Call a tool
const getPageInfo = tools.get('get_page_info');
const result = await getPageInfo.execute({});
console.log(result);
```

### Method 2: Test via evaluate_script

Use the Chrome DevTools MCP to call tools programmatically:

```javascript
evaluate_script({
  function: `async () => {
    const tools = navigator.modelContext.dynamicTools;
    const tool = tools.get('tool_name');
    return await tool.execute({ param: 'value' });
  }`
})
```

### Common Testing Issues

| Issue | Solution |
|-------|----------|
| "Connection failed" after injection | Normal! Tools still work, test them directly |
| Tools not in dynamicTools | Check console for registration errors |
| execute() returns undefined | Check return statement in tool handler |
| Data looks wrong | Console.log intermediate parsing steps |

## Available Tools

| Tool | Description | Category |
|------|-------------|----------|
| `tool_name` | What it does | read-only |
| `another_tool` | What it does | read-write |

## Workflows

### Common Task 1

How to accomplish a common task using these tools:

```javascript
// Step 1: Do something
webmcp_{{site}}_page0_tool_name({ param: "value" })

// Step 2: Do something else
webmcp_{{site}}_page0_another_tool({ param: "value" })
```

### Common Task 2

{{Describe another workflow.}}

## {{Site}}-Specific Tips

- **Tip 1**: {{Important information about this site}}
- **Tip 2**: {{Quirks or gotchas}}
- **Authentication**: {{If login required, explain here}}

## Examples

See [reference/workflows.md](reference/workflows.md) for detailed examples.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tools not appearing | Check console for errors, verify you're on the right page |
| Element not found | Page may have dynamic content - use `take_snapshot` to inspect |
| Actions not working | Site may require authentication first |
