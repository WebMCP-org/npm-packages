/**
 * Type definitions for MCPConfigExplorer component
 */

export type ConfigPlatform =
  | 'claude-desktop'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'continue-dev'
  | 'cline'
  | 'windsurf'
  | 'codex';

export type ConfigFormat = 'json' | 'yaml' | 'toml';

export interface MCPServerConfig {
  name: string;
  url: string;
  [key: string]: unknown;
}

export interface DetectedConfig {
  /**
   * The full file path
   */
  path: string;

  /**
   * Just the file name
   */
  fileName: string;

  /**
   * File system handle for reading/writing
   */
  fileHandle: FileSystemFileHandle;

  /**
   * Directory handle
   */
  directoryHandle: FileSystemDirectoryHandle;

  /**
   * Detected platform
   */
  platform: ConfigPlatform;

  /**
   * Config file format
   */
  format: ConfigFormat;

  /**
   * Whether this config has been updated
   */
  isUpdated?: boolean;

  /**
   * Last modified timestamp
   */
  lastModified?: number;
}

export interface FileSystemEntry {
  name: string;
  path: string;
  handle: FileSystemHandle;
  isDirectory: boolean;
  fileHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
}

/**
 * Platform-specific configuration patterns
 */
export interface PlatformConfig {
  platform: ConfigPlatform;
  configPaths: string[];
  fileNames: string[];
  format: ConfigFormat;
  description: string;
}

/**
 * Known MCP configuration locations
 */
export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    platform: 'claude-desktop',
    configPaths: [
      '~/Library/Application Support/Claude/claude_desktop_config.json', // macOS
      '%APPDATA%\\Claude\\claude_desktop_config.json', // Windows
      '~/.config/Claude/claude_desktop_config.json', // Linux
    ],
    fileNames: ['claude_desktop_config.json'],
    format: 'json',
    description: 'Claude Desktop Application',
  },
  {
    platform: 'cursor',
    configPaths: ['~/.cursor/mcp.json', '.cursor/mcp.json'],
    fileNames: ['mcp.json'],
    format: 'json',
    description: 'Cursor IDE',
  },
  {
    platform: 'vscode',
    configPaths: ['.vscode/mcp.json', '~/.vscode/mcp.json'],
    fileNames: ['mcp.json'],
    format: 'json',
    description: 'Visual Studio Code',
  },
  {
    platform: 'continue-dev',
    configPaths: ['~/.continue/config.yaml', '.continue/config.yaml'],
    fileNames: ['config.yaml', 'config.yml'],
    format: 'yaml',
    description: 'Continue.dev',
  },
  {
    platform: 'cline',
    configPaths: ['cline_mcp_settings.json', '.vscode/cline_mcp_settings.json'],
    fileNames: ['cline_mcp_settings.json'],
    format: 'json',
    description: 'Cline (VSCode Extension)',
  },
  {
    platform: 'windsurf',
    configPaths: ['~/.codeium/windsurf/mcp_config.json'],
    fileNames: ['mcp_config.json'],
    format: 'json',
    description: 'Windsurf IDE',
  },
  {
    platform: 'codex',
    configPaths: ['~/.codex/config.toml'],
    fileNames: ['config.toml'],
    format: 'toml',
    description: 'Codex',
  },
];
