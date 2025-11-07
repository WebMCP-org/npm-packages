import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { ToolExecutionPanel } from './components/ToolExecutionPanel';
import type { ToolInfo } from './types';

let reactRoot: Root | null = null;

/**
 * Mount or update the React tool executor component
 */
export function mountReactToolExecutor(
  container: HTMLElement,
  tools: ToolInfo[],
  onToolCall: (toolName: string, argsJson: string) => Promise<string>
): void {
  // Create root on first call
  if (!reactRoot) {
    reactRoot = createRoot(container);
  }

  // Render the tool execution panel
  reactRoot.render(
    <StrictMode>
      <ToolExecutionPanel tools={tools} onToolCall={onToolCall} />
    </StrictMode>
  );
}
