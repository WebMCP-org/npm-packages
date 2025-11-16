---
"@mcp-b/react-webmcp": patch
---

Remove MCP Config Explorer components (moved to @mcp-b/mcp-react-config)

The MCPConfigExplorer, ConfigDiffViewer, and ConfigFileList components have been moved to a new dedicated package @mcp-b/mcp-react-config. Users who need these components should install the new package:

```bash
npm install @mcp-b/mcp-react-config
# or
pnpm add @mcp-b/mcp-react-config
```

Import from the new package:
```typescript
import { MCPConfigExplorer } from '@mcp-b/mcp-react-config';
import '@mcp-b/mcp-react-config/style.css';
```
