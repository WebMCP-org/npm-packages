export type { ConfigDiffViewerProps } from './ConfigDiffViewer';
export { ConfigDiffViewer } from './ConfigDiffViewer';

export type { ConfigFileListProps } from './ConfigFileList';
export { ConfigFileList } from './ConfigFileList';
export type {
  UseConfigPreviewOptions,
  UseConfigPreviewReturn,
  UseFileSystemExplorerOptions,
  UseFileSystemExplorerReturn,
} from './hooks';
export { useConfigPreview, useFileSystemExplorer } from './hooks';
export type { MCPConfigExplorerProps } from './MCPConfigExplorer';
export { MCPConfigExplorer } from './MCPConfigExplorer';

export type {
  ConfigFormat,
  ConfigPlatform,
  DetectedConfig,
  FileSystemEntry,
  MCPServerConfig,
  PlatformConfig,
} from './types';
export { PLATFORM_CONFIGS } from './types';

export {
  formatConfig,
  generateConfigForPlatform,
  mergeConfig,
} from './utils/configGenerator';
export {
  detectConfigFiles,
  detectConfigFilesWithParents,
  exploreFileSystem,
  exploreFileSystemWithParents,
} from './utils/fileSystemExplorer';
