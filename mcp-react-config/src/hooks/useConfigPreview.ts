import { useCallback, useState } from 'react';
import type { DetectedConfig, MCPServerConfig } from '../types';
import { formatConfig, generateConfigForPlatform, mergeConfig } from '../utils/configGenerator';

export interface UseConfigPreviewOptions {
  serverName: string;
  mcpServerConfig: MCPServerConfig;
  onError?: (error: Error) => void;
  onConfigUpdated?: (config: DetectedConfig) => void;
}

export interface UseConfigPreviewReturn {
  selectedConfig: DetectedConfig | null;
  diffContent: { original: string; updated: string } | null;
  isUpdating: boolean;
  previewConfig: (config: DetectedConfig) => Promise<void>;
  applyConfig: () => Promise<void>;
  cancelPreview: () => void;
}

export function useConfigPreview(options: UseConfigPreviewOptions): UseConfigPreviewReturn {
  const { serverName, mcpServerConfig, onError, onConfigUpdated } = options;

  const [selectedConfig, setSelectedConfig] = useState<DetectedConfig | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [diffContent, setDiffContent] = useState<{ original: string; updated: string } | null>(
    null
  );

  const previewConfig = useCallback(
    async (config: DetectedConfig) => {
      try {
        setSelectedConfig(config);

        const file = await config.fileHandle.getFile();
        const originalContent = await file.text();

        const newConfig = generateConfigForPlatform(config.platform, mcpServerConfig);

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

  const applyConfig = useCallback(async () => {
    if (!selectedConfig || !diffContent) return;

    setIsUpdating(true);

    try {
      const writable = await selectedConfig.fileHandle.createWritable();

      await writable.write(diffContent.updated);
      await writable.close();

      onConfigUpdated?.(selectedConfig);

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

  const cancelPreview = useCallback(() => {
    setSelectedConfig(null);
    setDiffContent(null);
  }, []);

  return {
    selectedConfig,
    diffContent,
    isUpdating,
    previewConfig,
    applyConfig,
    cancelPreview,
  };
}
