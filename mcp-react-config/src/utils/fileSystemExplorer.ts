/**
 * File System Explorer Utility
 *
 * Provides functions to recursively explore the file system and detect MCP configuration files.
 */

import type { DetectedConfig, FileSystemEntry, PlatformConfig } from '../types';
import { PLATFORM_CONFIGS } from '../types';

/**
 * Maximum depth to explore directories (prevent infinite loops)
 */
const MAX_DEPTH = 10;

/**
 * Directories to skip during exploration
 */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  'vendor',
  '__pycache__',
]);

/**
 * Recursively explore a directory and collect all file entries
 */
export async function exploreFileSystem(
  directoryHandle: FileSystemDirectoryHandle,
  currentPath = '',
  depth = 0
): Promise<FileSystemEntry[]> {
  if (depth > MAX_DEPTH) {
    console.warn(`Maximum depth ${MAX_DEPTH} reached at ${currentPath}`);
    return [];
  }

  const entries: FileSystemEntry[] = [];

  try {
    // @ts-expect-error - File System Access API entries() method
    for await (const [name, handle] of directoryHandle.entries()) {
      const path = currentPath ? `${currentPath}/${name}` : name;

      if (handle.kind === 'directory') {
        // Skip known large/unnecessary directories
        if (SKIP_DIRECTORIES.has(name)) {
          continue;
        }

        entries.push({
          name,
          path,
          handle,
          isDirectory: true,
          directoryHandle: handle as FileSystemDirectoryHandle,
        });

        // Recursively explore subdirectory
        try {
          const subEntries = await exploreFileSystem(
            handle as FileSystemDirectoryHandle,
            path,
            depth + 1
          );
          entries.push(...subEntries);
        } catch (error) {
          console.warn(`Failed to explore directory ${path}:`, error);
        }
      } else if (handle.kind === 'file') {
        entries.push({
          name,
          path,
          handle,
          isDirectory: false,
          fileHandle: handle as FileSystemFileHandle,
        });
      }
    }
  } catch (error) {
    console.error(`Error exploring directory ${currentPath}:`, error);
  }

  return entries;
}

/**
 * Check if a file matches a platform configuration pattern
 */
function matchesPlatformConfig(entry: FileSystemEntry, platformConfig: PlatformConfig): boolean {
  const fileName = entry.name.toLowerCase();
  const filePath = entry.path.toLowerCase();

  // Check if the file name matches
  const fileNameMatches = platformConfig.fileNames.some(
    (pattern) => fileName === pattern.toLowerCase()
  );

  if (!fileNameMatches) {
    return false;
  }

  // For generic file names like "mcp.json", check if they're in the right directory
  if (fileName === 'mcp.json' || fileName === 'config.json') {
    // Check if the path contains platform-specific directory indicators
    const pathIndicators: Record<string, string[]> = {
      cursor: ['.cursor', 'cursor'],
      vscode: ['.vscode', 'vscode'],
      windsurf: ['windsurf', '.codeium'],
      cline: ['cline'],
    };

    const indicators = pathIndicators[platformConfig.platform];
    if (indicators) {
      return indicators.some((indicator) => filePath.includes(indicator.toLowerCase()));
    }
  }

  // For specific file names like "claude_desktop_config.json", the name match is enough
  return fileNameMatches;
}

/**
 * Detect MCP configuration files from the explored entries
 * @deprecated Use detectConfigFilesWithParents instead for proper parent directory tracking
 */
export async function detectConfigFiles(_entries: FileSystemEntry[]): Promise<DetectedConfig[]> {
  console.warn(
    'detectConfigFiles is deprecated. Use exploreFileSystemWithParents + detectConfigFilesWithParents instead.'
  );

  // Return empty array since this function cannot work without parent map
  return [];
}

/**
 * Enhanced version that preserves directory relationships
 */
export async function exploreFileSystemWithParents(
  directoryHandle: FileSystemDirectoryHandle,
  currentPath = '',
  depth = 0,
  parentMap: Map<string, FileSystemDirectoryHandle> = new Map()
): Promise<{
  entries: FileSystemEntry[];
  parentMap: Map<string, FileSystemDirectoryHandle>;
}> {
  if (depth > MAX_DEPTH) {
    console.warn(`Maximum depth ${MAX_DEPTH} reached at ${currentPath}`);
    return { entries: [], parentMap };
  }

  const entries: FileSystemEntry[] = [];

  try {
    // @ts-expect-error - File System Access API entries() method
    for await (const [name, handle] of directoryHandle.entries()) {
      const path = currentPath ? `${currentPath}/${name}` : name;

      if (handle.kind === 'directory') {
        if (SKIP_DIRECTORIES.has(name)) {
          continue;
        }

        const dirHandle = handle as FileSystemDirectoryHandle;
        entries.push({
          name,
          path,
          handle,
          isDirectory: true,
          directoryHandle: dirHandle,
        });

        // Recursively explore subdirectory
        try {
          const result = await exploreFileSystemWithParents(dirHandle, path, depth + 1, parentMap);
          entries.push(...result.entries);
        } catch (error) {
          console.warn(`Failed to explore directory ${path}:`, error);
        }
      } else if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;

        // Store the parent directory for this file
        parentMap.set(path, directoryHandle);

        entries.push({
          name,
          path,
          handle,
          isDirectory: false,
          fileHandle,
        });
      }
    }
  } catch (error) {
    console.error(`Error exploring directory ${currentPath}:`, error);
  }

  return { entries, parentMap };
}

/**
 * Enhanced detect function that uses the parent map
 */
export async function detectConfigFilesWithParents(
  entries: FileSystemEntry[],
  parentMap: Map<string, FileSystemDirectoryHandle>
): Promise<DetectedConfig[]> {
  const detectedConfigs: DetectedConfig[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || !entry.fileHandle) {
      continue;
    }

    for (const platformConfig of PLATFORM_CONFIGS) {
      if (matchesPlatformConfig(entry, platformConfig)) {
        try {
          const file = await entry.fileHandle.getFile();
          const parentDir = parentMap.get(entry.path);

          if (parentDir) {
            detectedConfigs.push({
              path: entry.path,
              fileName: entry.name,
              fileHandle: entry.fileHandle,
              directoryHandle: parentDir,
              platform: platformConfig.platform,
              format: platformConfig.format,
              lastModified: file.lastModified,
              isUpdated: false,
            });
          }
        } catch (error) {
          console.warn(`Failed to read file ${entry.path}:`, error);
        }
      }
    }
  }

  detectedConfigs.sort((a, b) => {
    if (a.platform !== b.platform) {
      return a.platform.localeCompare(b.platform);
    }
    return a.path.localeCompare(b.path);
  });

  return detectedConfigs;
}
