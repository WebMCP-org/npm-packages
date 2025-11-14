import { useCallback, useState } from 'react';
import type { DetectedConfig } from '../types';
import {
  detectConfigFilesWithParents,
  exploreFileSystemWithParents,
} from '../utils/fileSystemExplorer';

export interface UseFileSystemExplorerOptions {
  onError?: (error: Error) => void;
}

export interface UseFileSystemExplorerReturn {
  detectedConfigs: DetectedConfig[];
  isExploring: boolean;
  exploreFileSystem: () => Promise<void>;
  clearConfigs: () => void;
}

export function useFileSystemExplorer(
  options: UseFileSystemExplorerOptions = {}
): UseFileSystemExplorerReturn {
  const { onError } = options;

  const [isExploring, setIsExploring] = useState(false);
  const [detectedConfigs, setDetectedConfigs] = useState<DetectedConfig[]>([]);

  const exploreFileSystem = useCallback(async () => {
    setIsExploring(true);
    setDetectedConfigs([]);

    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      const { entries, parentMap } = await exploreFileSystemWithParents(directoryHandle);
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

  const clearConfigs = useCallback(() => {
    setDetectedConfigs([]);
  }, []);

  return {
    detectedConfigs,
    isExploring,
    exploreFileSystem,
    clearConfigs,
  };
}
