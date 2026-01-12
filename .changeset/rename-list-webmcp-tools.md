---
"@mcp-b/chrome-devtools-mcp": minor
---

Rename diff_webmcp_tools to list_webmcp_tools for improved UX

The tool name has been changed from `diff_webmcp_tools` to `list_webmcp_tools` to better represent its primary use case. The new name is more intuitive - users expect to "list" tools, not "diff" them - while all the intelligent diff tracking functionality remains intact.

**What's Changed:**
- Tool name: `diff_webmcp_tools` → `list_webmcp_tools`
- All documentation and error messages updated
- Tests updated to reflect new name

**What Stays the Same:**
- ✅ Diff tracking behavior (first call = full list, subsequent = diff)
- ✅ `full` parameter to force complete list
- ✅ Error propagation with isError flag  
- ✅ Token efficiency for large tool lists
- ✅ All functionality preserved

**Migration:**
This is a breaking change. Update any code that calls `diff_webmcp_tools` to use `list_webmcp_tools` instead.
