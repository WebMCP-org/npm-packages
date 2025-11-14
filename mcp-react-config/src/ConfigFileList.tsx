/**
 * ConfigFileList Component
 *
 * Displays a list of detected configuration files grouped by platform.
 */

import type React from 'react';
import { useMemo } from 'react';
import type { ConfigPlatform, DetectedConfig } from './types';

export interface ConfigFileListProps {
  /**
   * List of detected configuration files
   */
  configs: DetectedConfig[];

  /**
   * Callback when a config is selected for preview
   */
  onSelectConfig: (config: DetectedConfig) => void;

  /**
   * Custom CSS class name
   */
  className?: string;
}

interface GroupedConfigs {
  platform: ConfigPlatform;
  configs: DetectedConfig[];
}

/**
 * Platform display names and descriptions
 */
const PLATFORM_INFO: Record<ConfigPlatform, { name: string; description: string }> = {
  'claude-desktop': {
    name: 'Claude Desktop',
    description: 'Claude Desktop Application',
  },
  'claude-code': {
    name: 'Claude Code',
    description: 'Claude Code CLI',
  },
  cursor: {
    name: 'Cursor',
    description: 'Cursor IDE',
  },
  vscode: {
    name: 'VSCode',
    description: 'Visual Studio Code',
  },
  'continue-dev': {
    name: 'Continue.dev',
    description: 'Continue.dev Extension',
  },
  cline: {
    name: 'Cline',
    description: 'Cline (VSCode Extension)',
  },
  windsurf: {
    name: 'Windsurf',
    description: 'Windsurf IDE',
  },
  codex: {
    name: 'Codex',
    description: 'Codex AI Assistant',
  },
};

export const ConfigFileList: React.FC<ConfigFileListProps> = ({
  configs,
  onSelectConfig,
  className,
}) => {
  /**
   * Group configs by platform
   */
  const groupedConfigs = useMemo(() => {
    const groups = new Map<ConfigPlatform, DetectedConfig[]>();

    for (const config of configs) {
      const existing = groups.get(config.platform) || [];
      existing.push(config);
      groups.set(config.platform, existing);
    }

    const result: GroupedConfigs[] = [];
    for (const [platform, platformConfigs] of groups.entries()) {
      result.push({ platform, configs: platformConfigs });
    }

    // Sort by platform name
    result.sort((a, b) => {
      const aName = PLATFORM_INFO[a.platform]?.name || a.platform;
      const bName = PLATFORM_INFO[b.platform]?.name || b.platform;
      return aName.localeCompare(bName);
    });

    return result;
  }, [configs]);

  /**
   * Format file path for display (shorten if needed)
   */
  const formatPath = (path: string): string => {
    if (path.length <= 60) {
      return path;
    }

    // Show first and last parts of the path
    const parts = path.split('/');
    if (parts.length <= 3) {
      return path;
    }

    return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
  };

  /**
   * Format last modified date
   */
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) {
      return 'Unknown';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    }
    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    }
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    }
    if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }

    return date.toLocaleDateString();
  };

  return (
    <div className={`config-file-list ${className || ''}`}>
      <div className="config-file-list__header">
        <h3>Detected Configuration Files</h3>
        <p>Click on a file to preview the changes that will be made.</p>
      </div>

      <div className="config-file-list__groups">
        {groupedConfigs.map((group) => {
          const platformInfo = PLATFORM_INFO[group.platform] || {
            name: group.platform,
            description: '',
          };

          return (
            <div key={group.platform} className="config-file-list__group">
              <div className="config-file-list__group-header">
                <h4 className="config-file-list__platform-name">{platformInfo.name}</h4>
                <span className="config-file-list__platform-description">
                  {platformInfo.description}
                </span>
                <span className="config-file-list__count">
                  {group.configs.length} file{group.configs.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="config-file-list__items">
                {group.configs.map((config) => (
                  <button
                    key={config.path}
                    type="button"
                    className={`config-file-list__item ${
                      config.isUpdated ? 'config-file-list__item--updated' : ''
                    }`}
                    onClick={() => onSelectConfig(config)}
                  >
                    <div className="config-file-list__item-header">
                      <span className="config-file-list__file-name">{config.fileName}</span>
                      {config.isUpdated && (
                        <span className="config-file-list__badge config-file-list__badge--success">
                          Updated
                        </span>
                      )}
                      <span className="config-file-list__format">{config.format}</span>
                    </div>

                    <div className="config-file-list__item-details">
                      <span className="config-file-list__path" title={config.path}>
                        {formatPath(config.path)}
                      </span>
                      <span className="config-file-list__modified">
                        Modified {formatDate(config.lastModified)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {groupedConfigs.length === 0 && (
        <div className="config-file-list__empty">
          <p>No configuration files detected.</p>
        </div>
      )}
    </div>
  );
};

export default ConfigFileList;
