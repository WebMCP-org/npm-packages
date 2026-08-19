---
'@mcp-b/react-webmcp': minor
---

Register a prompt once instead of on every parent render. `useWebMCPPrompt` read
`argsSchema` from its `useCallback` dependencies, so the inline schema literal
shown in the hook's own documentation unregistered and re-registered the prompt
on each render. The schema is now read at registration time, matching
`useWebMCPResource` and `useWebMCP`.

Restore the `CallToolResult`, `ModelContextProtocol`, `PromptDescriptor`,
`PromptMessage`, `ResourceContents`, `ResourceDescriptor`, `ToolAnnotations`,
and `ToolDescriptor` type exports so a `WebMCPPromptConfig['get']` or
`WebMCPResourceConfig['read']` handler can be given an explicit return type
again. `WebMCPResourceReturn` is now an alias of `WebMCPPromptReturn`; both names
remain exported.
