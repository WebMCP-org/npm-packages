/**
 * ConfigDiffViewer Component
 *
 * Displays a side-by-side diff view of configuration changes.
 */

import type React from 'react';
import { useMemo } from 'react';
import type { ConfigPlatform } from './types';

export interface ConfigDiffViewerProps {
  /**
   * Original file content
   */
  original: string;

  /**
   * Updated file content
   */
  updated: string;

  /**
   * File name for display
   */
  fileName: string;

  /**
   * Platform type (affects syntax highlighting)
   */
  platform: ConfigPlatform;

  /**
   * Custom CSS class name
   */
  className?: string;
}

interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'added' | 'removed' | 'unchanged' | 'modified';
}

/**
 * Simple diff algorithm to compare two texts line by line
 */
function computeLineDiff(
  original: string,
  updated: string
): {
  originalLines: DiffLine[];
  updatedLines: DiffLine[];
} {
  const originalLines = original.split('\n');
  const updatedLines = updated.split('\n');

  const originalDiff: DiffLine[] = [];
  const updatedDiff: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < updatedLines.length) {
    if (i >= originalLines.length) {
      // Only updated lines remain
      updatedDiff.push({
        lineNumber: j + 1,
        content: updatedLines[j] ?? '',
        type: 'added',
      });
      j++;
    } else if (j >= updatedLines.length) {
      // Only original lines remain
      originalDiff.push({
        lineNumber: i + 1,
        content: originalLines[i] ?? '',
        type: 'removed',
      });
      i++;
    } else if (originalLines[i] === updatedLines[j]) {
      // Lines are the same
      originalDiff.push({
        lineNumber: i + 1,
        content: originalLines[i] ?? '',
        type: 'unchanged',
      });
      updatedDiff.push({
        lineNumber: j + 1,
        content: updatedLines[j] ?? '',
        type: 'unchanged',
      });
      i++;
      j++;
    } else {
      // Lines are different - check if it's a modification or insertion/deletion
      const currentOriginal = originalLines[i] ?? '';
      const currentUpdated = updatedLines[j] ?? '';
      const nextOriginalMatch = updatedLines.slice(j).indexOf(currentOriginal);
      const nextUpdatedMatch = originalLines.slice(i).indexOf(currentUpdated);

      if (
        nextOriginalMatch !== -1 &&
        (nextUpdatedMatch === -1 || nextOriginalMatch < nextUpdatedMatch)
      ) {
        // Lines were added in updated
        for (let k = 0; k < nextOriginalMatch; k++) {
          updatedDiff.push({
            lineNumber: j + k + 1,
            content: updatedLines[j + k] ?? '',
            type: 'added',
          });
        }
        j += nextOriginalMatch;
      } else if (nextUpdatedMatch !== -1) {
        // Lines were removed from original
        for (let k = 0; k < nextUpdatedMatch; k++) {
          originalDiff.push({
            lineNumber: i + k + 1,
            content: originalLines[i + k] ?? '',
            type: 'removed',
          });
        }
        i += nextUpdatedMatch;
      } else {
        // Lines are modified
        originalDiff.push({
          lineNumber: i + 1,
          content: currentOriginal,
          type: 'modified',
        });
        updatedDiff.push({
          lineNumber: j + 1,
          content: currentUpdated,
          type: 'modified',
        });
        i++;
        j++;
      }
    }
  }

  return { originalLines: originalDiff, updatedLines: updatedDiff };
}

export const ConfigDiffViewer: React.FC<ConfigDiffViewerProps> = ({
  original,
  updated,
  fileName,
  platform,
  className,
}) => {
  const { originalLines, updatedLines } = useMemo(
    () => computeLineDiff(original, updated),
    [original, updated]
  );

  const renderLines = (lines: DiffLine[]) => {
    return lines.map((line, index) => (
      <div
        key={`${line.lineNumber}-${line.type}-${index}`}
        className={`diff-line diff-line--${line.type}`}
        data-line-number={line.lineNumber}
      >
        <span className="diff-line__number">{line.lineNumber}</span>
        <span className="diff-line__indicator">
          {line.type === 'added' && '+'}
          {line.type === 'removed' && '-'}
          {line.type === 'unchanged' && ' '}
          {line.type === 'modified' && '~'}
        </span>
        <code className="diff-line__content">{line.content || ' '}</code>
      </div>
    ));
  };

  const addedCount = updatedLines.filter((l) => l.type === 'added' || l.type === 'modified').length;
  const removedCount = originalLines.filter(
    (l) => l.type === 'removed' || l.type === 'modified'
  ).length;

  return (
    <div className={`config-diff-viewer ${className || ''}`}>
      <div className="config-diff-viewer__header">
        <div className="config-diff-viewer__file-info">
          <span className="config-diff-viewer__file-name">{fileName}</span>
          <span className="config-diff-viewer__platform">{platform}</span>
        </div>
        <div className="config-diff-viewer__stats">
          {addedCount > 0 && (
            <span className="config-diff-viewer__stat config-diff-viewer__stat--added">
              +{addedCount}
            </span>
          )}
          {removedCount > 0 && (
            <span className="config-diff-viewer__stat config-diff-viewer__stat--removed">
              -{removedCount}
            </span>
          )}
        </div>
      </div>

      <div className="config-diff-viewer__content">
        <div className="config-diff-viewer__side config-diff-viewer__side--original">
          <div className="config-diff-viewer__side-header">Original</div>
          <div className="config-diff-viewer__lines">{renderLines(originalLines)}</div>
        </div>

        <div className="config-diff-viewer__side config-diff-viewer__side--updated">
          <div className="config-diff-viewer__side-header">Updated</div>
          <div className="config-diff-viewer__lines">{renderLines(updatedLines)}</div>
        </div>
      </div>
    </div>
  );
};

export default ConfigDiffViewer;
