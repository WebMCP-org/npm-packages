/// <reference lib="dom" />

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

import type React from 'react';
import { useMemo } from 'react';
import { ConfigDiffViewer } from './ConfigDiffViewer';
import { ConfigFileList } from './ConfigFileList';
import { useConfigPreview, useFileSystemExplorer } from './hooks';
import type { DetectedConfig, MCPServerConfig } from './types';
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
  const mcpServerConfig: MCPServerConfig = useMemo(
    () => ({
      name: serverName,
      url: mcpUrl,
      ...serverConfig,
    }),
    [serverName, mcpUrl, serverConfig]
  );

  const { detectedConfigs, isExploring, exploreFileSystem } = useFileSystemExplorer(
    onError ? { onError } : {}
  );

  const { selectedConfig, diffContent, isUpdating, previewConfig, applyConfig, cancelPreview } =
    useConfigPreview({
      serverName,
      mcpServerConfig,
      ...(onError && { onError }),
      ...(onConfigUpdated && { onConfigUpdated }),
    });

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
          onClick={exploreFileSystem}
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
        <ConfigFileList configs={detectedConfigs} onSelectConfig={previewConfig} />
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
              onClick={cancelPreview}
              disabled={isUpdating}
              className="mcp-config-explorer__button mcp-config-explorer__button--secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyConfig}
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
