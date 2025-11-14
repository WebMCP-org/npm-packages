# MCP Config Explorer

A comprehensive React TypeScript component library for exploring, detecting, and updating MCP (Model Context Protocol) configuration files across multiple platforms.

## Features

- 🔍 **Recursive File System Exploration**: Automatically searches your file system for MCP config files
- 🎯 **Multi-Platform Support**: Detects and handles configs for:
  - Claude Desktop
  - Claude Code CLI
  - Cursor IDE
  - VSCode
  - Continue.dev
  - Cline (VSCode Extension)
  - Windsurf IDE
  - Codex AI Assistant
- 📊 **Visual Diff Preview**: Shows side-by-side comparison of original vs. updated configurations
- 📝 **Multiple Format Support**: Handles JSON, YAML, and TOML configuration files
- ✏️ **In-Place Editing**: Safely updates configuration files with proper merging logic
- 🎨 **Customizable Styling**: Includes comprehensive CSS with dark mode support

## Installation

```bash
npm install @mcp-b/react-webmcp
# or
pnpm add @mcp-b/react-webmcp
# or
yarn add @mcp-b/react-webmcp
```

## Quick Start

### Basic Usage

```tsx
import React from 'react';
import { MCPConfigExplorer } from '@mcp-b/react-webmcp/components';

function App() {
  const handleConfigUpdated = (config) => {
    console.log('Configuration updated:', config);
  };

  const handleError = (error) => {
    console.error('Error:', error);
  };

  return (
    <MCPConfigExplorer
      mcpUrl="https://your-mcp-server.example.com/mcp"
      serverName="my-mcp-server"
      onConfigUpdated={handleConfigUpdated}
      onError={handleError}
    />
  );
}

export default App;
```

### Advanced Usage with Custom Configuration

```tsx
import React from 'react';
import { MCPConfigExplorer } from '@mcp-b/react-webmcp/components';

function App() {
  const serverConfig = {
    // Additional server configuration
    timeout: 30000,
    retries: 3,
    customHeader: 'X-Custom-Header',
  };

  return (
    <MCPConfigExplorer
      mcpUrl="https://api.example.com/mcp"
      serverName="webmcp"
      serverConfig={serverConfig}
      onConfigUpdated={(config) => {
        console.log(`Updated ${config.platform} config at ${config.path}`);
        // Show success notification
      }}
      onError={(error) => {
        console.error('Configuration error:', error);
        // Show error notification
      }}
      className="custom-explorer"
    />
  );
}
```

## Component API

### MCPConfigExplorer

Main component for exploring and updating MCP configurations.

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `mcpUrl` | `string` | Yes | - | The MCP server URL to add to configurations |
| `serverName` | `string` | No | `"webmcp"` | The name to use for the MCP server in configs |
| `serverConfig` | `Record<string, unknown>` | No | `{}` | Additional configuration options for the MCP server |
| `onConfigUpdated` | `(config: DetectedConfig) => void` | No | - | Callback when a config is successfully updated |
| `onError` | `(error: Error) => void` | No | - | Callback when an error occurs |
| `className` | `string` | No | `""` | Custom CSS class name |

### ConfigDiffViewer

Component for displaying side-by-side diff of configuration changes.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `original` | `string` | Yes | Original file content |
| `updated` | `string` | Yes | Updated file content |
| `fileName` | `string` | Yes | File name for display |
| `platform` | `ConfigPlatform` | Yes | Platform type (affects syntax highlighting) |
| `className` | `string` | No | Custom CSS class name |

### ConfigFileList

Component for displaying a list of detected configuration files.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `configs` | `DetectedConfig[]` | Yes | List of detected configuration files |
| `onSelectConfig` | `(config: DetectedConfig) => void` | Yes | Callback when a config is selected for preview |
| `className` | `string` | No | Custom CSS class name |

## Types

### MCPServerConfig

```typescript
interface MCPServerConfig {
  name: string;
  url: string;
  [key: string]: unknown;
}
```

### DetectedConfig

```typescript
interface DetectedConfig {
  path: string;
  fileName: string;
  fileHandle: FileSystemFileHandle;
  directoryHandle: FileSystemDirectoryHandle;
  platform: ConfigPlatform;
  format: ConfigFormat;
  isUpdated?: boolean;
  lastModified?: number;
}
```

### ConfigPlatform

```typescript
type ConfigPlatform =
  | 'claude-desktop'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'continue-dev'
  | 'cline'
  | 'windsurf'
  | 'codex';
```

### ConfigFormat

```typescript
type ConfigFormat = 'json' | 'yaml' | 'toml';
```

## Utility Functions

### File System Exploration

```typescript
import {
  exploreFileSystemWithParents,
  detectConfigFilesWithParents,
} from '@mcp-b/react-webmcp/components';

// Explore file system
const directoryHandle = await window.showDirectoryPicker();
const { entries, parentMap } = await exploreFileSystemWithParents(directoryHandle);

// Detect config files
const detectedConfigs = await detectConfigFilesWithParents(entries, parentMap);
```

### Configuration Generation

```typescript
import {
  generateConfigForPlatform,
  mergeConfig,
  formatConfig,
} from '@mcp-b/react-webmcp/components';

// Generate platform-specific config
const config = generateConfigForPlatform('claude-desktop', {
  name: 'my-server',
  url: 'https://example.com/mcp',
});

// Merge with existing config
const merged = await mergeConfig(
  existingContent,
  config,
  'claude-desktop',
  'my-server'
);

// Format config for display
const formatted = formatConfig(merged, 'claude-desktop');
```

## Styling

The component includes comprehensive CSS with dark mode support. You can customize the appearance by:

1. **Importing the default styles:**

```tsx
import '@mcp-b/react-webmcp/components/MCPConfigExplorer.css';
```

2. **Overriding with custom CSS:**

```css
.mcp-config-explorer {
  /* Your custom styles */
}

.config-diff-viewer {
  /* Your custom diff viewer styles */
}
```

3. **Using CSS variables (add to your CSS):**

```css
:root {
  --mcp-primary-color: #0070f3;
  --mcp-background-color: #ffffff;
  --mcp-border-color: #e0e0e0;
  /* Add more custom variables */
}
```

## Supported Configuration Locations

The component automatically detects MCP configuration files in the following locations:

### Claude Desktop
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Cursor
- `~/.cursor/mcp.json`
- `.cursor/mcp.json` (project-specific)

### VSCode
- `.vscode/mcp.json`
- `~/.vscode/mcp.json`

### Continue.dev
- `~/.continue/config.yaml`
- `.continue/config.yaml` (project-specific)

### Cline
- `cline_mcp_settings.json`
- `.vscode/cline_mcp_settings.json`

### Windsurf
- `~/.codeium/windsurf/mcp_config.json`

### Codex
- `~/.codex/config.toml`

## Browser Compatibility

This component uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which is supported in:

- ✅ Chrome/Edge 86+
- ✅ Opera 72+
- ❌ Firefox (not supported yet)
- ❌ Safari (not supported yet)

For unsupported browsers, the component will display an appropriate error message.

## Security Considerations

1. **User Permissions**: The component requests read/write access to the file system. Users must explicitly grant permission.

2. **File Validation**: The component validates file types and contents before making changes.

3. **Backup Recommendation**: While the component safely merges configurations, users should maintain backups of their config files.

4. **Sandboxing**: The File System Access API operates in a secure, sandboxed environment.

## Examples

### Integration with Existing MCP Setup

```tsx
import React, { useState } from 'react';
import { MCPConfigExplorer } from '@mcp-b/react-webmcp/components';
import { useAuth } from './hooks/useAuth';
import { getMcpUrl } from './services/mcpService';

function MCPSetup() {
  const { user } = useAuth();
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (user?.id) {
      getMcpUrl(user.id).then(setMcpUrl);
    }
  }, [user]);

  if (!mcpUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mcp-setup">
      <h1>Configure Your MCP Server</h1>
      <p>Add your MCP server to your development tools:</p>

      <MCPConfigExplorer
        mcpUrl={mcpUrl}
        serverName="webmcp"
        onConfigUpdated={(config) => {
          alert(`Successfully updated ${config.platform} configuration!`);
        }}
        onError={(error) => {
          alert(`Error: ${error.message}`);
        }}
      />
    </div>
  );
}
```

### Custom Error Handling

```tsx
import React, { useState } from 'react';
import { MCPConfigExplorer } from '@mcp-b/react-webmcp/components';
import { Toast } from './components/Toast';

function App() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  return (
    <>
      <MCPConfigExplorer
        mcpUrl="https://api.example.com/mcp"
        onConfigUpdated={(config) => {
          setToast({
            type: 'success',
            message: `Updated ${config.fileName} successfully!`,
          });
        }}
        onError={(error) => {
          setToast({
            type: 'error',
            message: error.message,
          });
        }}
      />

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/WebMCP-org/WebMCP) for contribution guidelines.

## License

MIT License - see LICENSE file for details.

## Support

For issues, questions, or feature requests, please visit:
- GitHub Issues: https://github.com/WebMCP-org/WebMCP/issues
- Documentation: https://github.com/WebMCP-org/WebMCP#readme
