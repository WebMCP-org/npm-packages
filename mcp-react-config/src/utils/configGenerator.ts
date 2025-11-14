/**
 * Configuration Generator Utility
 *
 * Generates platform-specific MCP server configurations and merges them with existing configs.
 */

import type { ConfigFormat, ConfigPlatform, MCPServerConfig } from '../types';

/**
 * Generate configuration object for a specific platform
 */
export function generateConfigForPlatform(
  platform: ConfigPlatform,
  serverConfig: MCPServerConfig
): unknown {
  const { name, url, ...rest } = serverConfig;

  switch (platform) {
    case 'claude-desktop':
    case 'cursor':
    case 'vscode':
      // JSON format: { "mcpServers": { "name": { "url": "..." } } }
      return {
        mcpServers: {
          [name]: {
            url,
            ...rest,
          },
        },
      };

    case 'cline':
      // JSON format with streamableHttp type
      return {
        mcpServers: {
          [name]: {
            type: 'streamableHttp',
            url,
            disabled: false,
            ...rest,
          },
        },
      };

    case 'windsurf':
      // JSON format with npx command
      return {
        mcpServers: {
          [name]: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url],
            ...rest,
          },
        },
      };

    case 'continue-dev':
      // YAML format
      return {
        mcpServers: [
          {
            name,
            type: 'streamable-http',
            url,
            ...rest,
          },
        ],
      };

    case 'codex':
      // TOML format
      return {
        mcp_servers: {
          [name]: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url],
            ...rest,
          },
        },
      };

    case 'claude-code':
      // Command line - not applicable for file config
      return null;

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Merge new configuration with existing configuration
 */
export async function mergeConfig(
  existingContent: string,
  newConfig: unknown,
  platform: ConfigPlatform,
  serverName: string
): Promise<string> {
  const format = getFormatForPlatform(platform);

  switch (format) {
    case 'json':
      return mergeJsonConfig(existingContent, newConfig, serverName);
    case 'yaml':
      return mergeYamlConfig(existingContent, newConfig, serverName);
    case 'toml':
      return mergeTomlConfig(existingContent, newConfig, serverName);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Merge JSON configuration
 */
function mergeJsonConfig(existingContent: string, newConfig: unknown, _serverName: string): string {
  try {
    // Parse existing config (or start with empty object if invalid)
    let existing: Record<string, unknown>;
    try {
      existing = existingContent.trim() ? JSON.parse(existingContent) : {};
    } catch {
      existing = {};
    }

    // Merge configurations
    const newConfigObj = newConfig as Record<string, unknown>;
    const merged = { ...existing };

    // Handle mcpServers object
    if (newConfigObj.mcpServers) {
      const mcpServers = newConfigObj.mcpServers as Record<string, unknown>;
      const existingMcpServers = (existing.mcpServers as Record<string, unknown>) || {};

      merged.mcpServers = {
        ...existingMcpServers,
        ...mcpServers,
      };
    }

    // Pretty print with 2-space indentation
    return JSON.stringify(merged, null, 2);
  } catch (error) {
    console.error('Error merging JSON config:', error);
    throw new Error('Failed to merge JSON configuration');
  }
}

/**
 * Merge YAML configuration
 */
function mergeYamlConfig(existingContent: string, newConfig: unknown, _serverName: string): string {
  // Simple YAML merge - in production, use a proper YAML parser like 'js-yaml'
  const newConfigObj = newConfig as { mcpServers?: Array<Record<string, unknown>> };

  if (!newConfigObj.mcpServers || newConfigObj.mcpServers.length === 0) {
    return existingContent;
  }

  const newServer = newConfigObj.mcpServers[0];
  if (!newServer) {
    return existingContent;
  }

  const serverName = String(newServer.name || _serverName);

  // Check if the server already exists in the config
  const serverExists = existingContent.includes(`name: ${serverName}`);

  if (serverExists) {
    // Replace existing server configuration
    const lines = existingContent.split('\n');
    const startIndex = lines.findIndex((line) => line.includes(`name: ${serverName}`));

    if (startIndex !== -1) {
      // Find the end of this server block (next server or end)
      let endIndex = startIndex + 1;
      while (endIndex < lines.length && lines[endIndex]?.startsWith('  ')) {
        endIndex++;
      }

      // Generate new server block
      const newServerYaml = generateYamlServerBlock(newServer);
      lines.splice(startIndex, endIndex - startIndex, newServerYaml);

      return lines.join('\n');
    }
  }

  // Add new server
  const newServerYaml = generateYamlServerBlock(newServer);

  if (existingContent.includes('mcpServers:')) {
    // Append to existing mcpServers list
    return `${existingContent.trim()}\n${newServerYaml}\n`;
  }

  // Create new mcpServers section
  return `${existingContent.trim()}\n\nmcpServers:\n${newServerYaml}\n`;
}

/**
 * Generate YAML server block
 */
function generateYamlServerBlock(server: Record<string, unknown>): string {
  const lines = [`  - name: ${server.name}`];

  for (const [key, value] of Object.entries(server)) {
    if (key !== 'name') {
      lines.push(`    ${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Merge TOML configuration
 */
function mergeTomlConfig(existingContent: string, newConfig: unknown, serverName: string): string {
  // Simple TOML merge - in production, use a proper TOML parser like '@iarna/toml'
  const newConfigObj = newConfig as { mcp_servers?: Record<string, Record<string, unknown>> };

  if (!newConfigObj.mcp_servers) {
    return existingContent;
  }

  const newServer = newConfigObj.mcp_servers[serverName];

  if (!newServer) {
    return existingContent;
  }

  // Generate TOML server block
  const serverBlock = generateTomlServerBlock(serverName, newServer);

  // Check if server already exists
  const serverSectionRegex = new RegExp(`\\[mcp_servers\\.${serverName}\\]`, 'g');

  if (serverSectionRegex.test(existingContent)) {
    // Replace existing server section
    const lines = existingContent.split('\n');
    const startIndex = lines.findIndex((line) => line.includes(`[mcp_servers.${serverName}]`));

    if (startIndex !== -1) {
      // Find the end of this section (next section or end)
      let endIndex = startIndex + 1;
      while (endIndex < lines.length && !lines[endIndex]?.startsWith('[')) {
        endIndex++;
      }

      lines.splice(startIndex, endIndex - startIndex, serverBlock);
      return lines.join('\n');
    }
  }

  // Add new server section
  return `${existingContent.trim()}\n\n${serverBlock}\n`;
}

/**
 * Generate TOML server block
 */
function generateTomlServerBlock(name: string, config: Record<string, unknown>): string {
  const lines = [`[mcp_servers.${name}]`];

  for (const [key, value] of Object.entries(config)) {
    if (Array.isArray(value)) {
      lines.push(`${key} = ${JSON.stringify(value)}`);
    } else if (typeof value === 'string') {
      lines.push(`${key} = "${value}"`);
    } else {
      lines.push(`${key} = ${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format configuration for display
 */
export function formatConfig(content: string, platform: ConfigPlatform): string {
  const format = getFormatForPlatform(platform);

  switch (format) {
    case 'json':
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    case 'yaml':
    case 'toml':
      return content;
    default:
      return content;
  }
}

/**
 * Get the format for a platform
 */
function getFormatForPlatform(platform: ConfigPlatform): ConfigFormat {
  switch (platform) {
    case 'claude-desktop':
    case 'cursor':
    case 'vscode':
    case 'cline':
    case 'windsurf':
      return 'json';
    case 'continue-dev':
      return 'yaml';
    case 'codex':
      return 'toml';
    default:
      return 'json';
  }
}
