/**
 * MCPConfigExplorer Component
 *
 * A comprehensive React component for exploring the file system to find MCP config files,
 * displaying diffs, and allowing users to add their MCP server configuration to detected configs.
 *
 * Features:
 * - Recursive file system exploration to find MCP config files
 * - Support for multiple platforms (Claude Desktop, Cursor, VSCode, Continue, Cline, Windsurf, Codex)
 * - Diff preview showing what will be added
 * - In-place editing and saving of configuration files
 */

/// <reference lib="dom" />

// Type augmentation for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { ConfigDiffViewer } from './ConfigDiffViewer';
import { ConfigFileList } from './ConfigFileList';
import type { DetectedConfig, MCPServerConfig } from './types';
import { formatConfig, generateConfigForPlatform, mergeConfig } from './utils/configGenerator';
import {
  detectConfigFilesWithParents,
  exploreFileSystemWithParents,
} from './utils/fileSystemExplorer';
import './MCPConfigExplorer.css';

export interface MCPConfigExplorerProps {
  /**
   * The MCP server URL to add to configurations
   */
  mcpUrl: string;

  /**
   * The name to use for the MCP server in configs
   * @default "webmcp"
   */
  serverName?: string;

  /**
   * Additional configuration options for the MCP server
   */
  serverConfig?: Record<string, unknown>;

  /**
   * Callback when a config is successfully updated
   */
  onConfigUpdated?: (config: DetectedConfig) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Custom CSS class name
   */
  className?: string;
}

export const MCPConfigExplorer: React.FC<MCPConfigExplorerProps> = ({
  mcpUrl,
  serverName = 'webmcp',
  serverConfig,
  onConfigUpdated,
  onError,
  className,
}) => {
  const [isExploring, setIsExploring] = useState(false);
  const [detectedConfigs, setDetectedConfigs] = useState<DetectedConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<DetectedConfig | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [diffContent, setDiffContent] = useState<{ original: string; updated: string } | null>(
    null
  );

  /**
   * Generate the MCP server configuration based on the platform
   */
  const mcpServerConfig: MCPServerConfig = useMemo(
    () => ({
      name: serverName,
      url: mcpUrl,
      ...serverConfig,
    }),
    [serverName, mcpUrl, serverConfig]
  );

  /**
   * Start exploring the file system for MCP config files
   */
  const handleExploreFileSystem = useCallback(async () => {
    setIsExploring(true);
    setDetectedConfigs([]);
    setSelectedConfig(null);
    setDiffContent(null);

    try {
      // Request directory access
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      // Explore the file system recursively
      const { entries, parentMap } = await exploreFileSystemWithParents(directoryHandle);

      // Detect and classify config files
      const detectedConfigFiles = await detectConfigFilesWithParents(entries, parentMap);

      setDetectedConfigs(detectedConfigFiles);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to explore file system');
      console.error('File system exploration error:', err);
      onError?.(err);
    } finally {
      setIsExploring(false);
    }
  }, [onError]);

  /**
   * Preview what will be added to a config file (show diff)
   */
  const handlePreviewConfig = useCallback(
    async (config: DetectedConfig) => {
      try {
        setSelectedConfig(config);

        // Read the current file content
        const file = await config.fileHandle.getFile();
        const originalContent = await file.text();

        // Generate the new config to add
        const newConfig = generateConfigForPlatform(config.platform, mcpServerConfig);

        // Merge with existing config
        const updatedContent = await mergeConfig(
          originalContent,
          newConfig,
          config.platform,
          serverName
        );

        setDiffContent({
          original: formatConfig(originalContent, config.platform),
          updated: formatConfig(updatedContent, config.platform),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to preview config');
        console.error('Config preview error:', err);
        onError?.(err);
      }
    },
    [mcpServerConfig, serverName, onError]
  );

  /**
   * Apply the configuration changes to the file
   */
  const handleApplyConfig = useCallback(async () => {
    if (!selectedConfig || !diffContent) return;

    setIsUpdating(true);

    try {
      // Request write permission
      const writable = await selectedConfig.fileHandle.createWritable();

      // Write the updated content
      await writable.write(diffContent.updated);
      await writable.close();

      // Notify success
      onConfigUpdated?.(selectedConfig);

      // Update the detected config to mark as updated
      setDetectedConfigs((prev) =>
        prev.map((c) => (c.path === selectedConfig.path ? { ...c, isUpdated: true } : c))
      );

      // Clear selection
      setSelectedConfig(null);
      setDiffContent(null);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to update config');
      console.error('Config update error:', err);
      onError?.(err);
    } finally {
      setIsUpdating(false);
    }
  }, [selectedConfig, diffContent, onConfigUpdated, onError]);

  /**
   * Cancel the current preview
   */
  const handleCancelPreview = useCallback(() => {
    setSelectedConfig(null);
    setDiffContent(null);
  }, []);

  return (
    <div className={`mcp-config-explorer ${className || ''}`}>
      <div className="mcp-config-explorer__header">
        <h2>MCP Configuration Explorer</h2>
        <p>
          Automatically detect and update MCP configuration files on your system. This tool will
          search for config files and help you add your server configuration.
        </p>
      </div>

      <div className="mcp-config-explorer__actions">
        <button
          type="button"
          onClick={handleExploreFileSystem}
          disabled={isExploring}
          className="mcp-config-explorer__button mcp-config-explorer__button--primary"
        >
          {isExploring ? 'Exploring...' : 'Explore File System'}
        </button>

        {detectedConfigs.length > 0 && (
          <div className="mcp-config-explorer__stats">
            Found {detectedConfigs.length} configuration file
            {detectedConfigs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {detectedConfigs.length > 0 && !selectedConfig && (
        <ConfigFileList configs={detectedConfigs} onSelectConfig={handlePreviewConfig} />
      )}

      {selectedConfig && diffContent && (
        <div className="mcp-config-explorer__preview">
          <div className="mcp-config-explorer__preview-header">
            <h3>Preview Changes</h3>
            <p>
              {selectedConfig.platform} configuration at <code>{selectedConfig.path}</code>
            </p>
          </div>

          <ConfigDiffViewer
            original={diffContent.original}
            updated={diffContent.updated}
            fileName={selectedConfig.fileName}
            platform={selectedConfig.platform}
          />

          <div className="mcp-config-explorer__preview-actions">
            <button
              type="button"
              onClick={handleCancelPreview}
              disabled={isUpdating}
              className="mcp-config-explorer__button mcp-config-explorer__button--secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyConfig}
              disabled={isUpdating}
              className="mcp-config-explorer__button mcp-config-explorer__button--primary"
            >
              {isUpdating ? 'Applying...' : 'Apply Configuration'}
            </button>
          </div>
        </div>
      )}

      {!isExploring && detectedConfigs.length === 0 && (
        <div className="mcp-config-explorer__empty">
          <p>
            No configuration files found. Click "Explore File System" to search for MCP config
            files.
          </p>
        </div>
      )}
    </div>
  );
};

export default MCPConfigExplorer;
