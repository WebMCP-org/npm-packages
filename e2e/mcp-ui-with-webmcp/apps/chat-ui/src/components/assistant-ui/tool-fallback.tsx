import type { ToolCallMessagePartComponent } from '@assistant-ui/react';
import { ChevronDown, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMCP } from '@/hooks/useMCP';
import { formatMcpResult } from '@/lib/mcp-utils';
import { cn } from '@/lib/utils';
import { ToolSourceBadge } from './tool-source-badge';
import { type ToolStatus, ToolStatusBadge } from './tool-status-badge';

type ToolCallStatus =
  | { type: 'running' }
  | { type: 'complete' }
  | {
      type: 'incomplete';
      reason: 'cancelled' | 'length' | 'content-filter' | 'other' | 'error';
      error?: unknown;
    }
  | { type: 'requires-action'; reason: 'interrupt' };

/**
 * Map assistant-ui status to simplified ToolStatus type
 */
function mapToToolStatus(status: ToolCallStatus, isError?: boolean): ToolStatus {
  if (status.type === 'running') return 'running';
  if (status.type === 'requires-action') return 'waiting';
  if (status.type === 'incomplete') {
    return status.reason === 'cancelled' ? 'cancelled' : 'error';
  }
  // status.type === "complete"
  return isError ? 'error' : 'completed';
}

/**
 * Determine if the tool call should auto-expand based on status
 */
function shouldAutoExpandStatus(status: ToolCallStatus): boolean {
  if (status.type === 'running') return false;
  if (status.type === 'requires-action') return true;
  if (status.type === 'incomplete') return true;
  return false; // complete - will be handled by isError check
}

/**
 * Get border color based on status and error state
 */
function getBorderColor(status: ToolCallStatus, isError?: boolean): string {
  if (status.type === 'running') return 'border-blue-500';
  if (status.type === 'requires-action') return 'border-yellow-500';
  if (status.type === 'incomplete') {
    return status.reason === 'cancelled' ? 'border-gray-500' : 'border-destructive';
  }
  // complete
  return isError ? 'border-destructive' : 'border-green-500';
}

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
  isError,
}) => {
  // Get tool metadata from MCP context to extract sourceId
  const { tools } = useMCP();
  const tool = tools.find((t) => t.name === toolName);
  const sourceId = tool ? (tool as typeof tool & { _sourceId?: string })._sourceId : undefined;

  // Parse MCP result if available
  const formattedResult = result !== undefined ? formatMcpResult(result) : null;
  const resultIsError = formattedResult?.isError || isError;

  // Determine if should auto-expand
  const shouldExpand = shouldAutoExpandStatus(status) || resultIsError;
  const [isCollapsed, setIsCollapsed] = useState(!shouldExpand);

  const isRunning = status.type === 'running';
  const toolStatus = mapToToolStatus(status, resultIsError);
  const borderColor = getBorderColor(status, resultIsError);

  return (
    <div
      className={cn(
        'aui-tool-fallback-root mb-4 flex w-full max-w-full flex-col gap-3 rounded-lg border py-3 transition-colors',
        borderColor
      )}
    >
      <div className="aui-tool-fallback-header flex items-center gap-2 px-3 sm:px-4">
        <p className="aui-tool-fallback-title flex-grow flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm min-w-0">
          <span className="text-muted-foreground shrink-0">Used tool:</span>{' '}
          <b className="font-semibold truncate">{toolName}</b>
          <ToolSourceBadge sourceId={sourceId} iconOnly />
        </p>
        <ToolStatusBadge status={toolStatus} isError={resultIsError} className="shrink-0" />
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
          disabled={isRunning}
          aria-label={isCollapsed ? 'Expand tool details' : 'Collapse tool details'}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="aui-tool-fallback-content flex flex-col gap-3 border-t pt-3 min-w-0">
          <div className="aui-tool-fallback-args-root px-3 sm:px-4 min-w-0">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Parameters:</p>
            <pre className="aui-tool-fallback-args-value rounded-md bg-muted p-2 text-xs sm:p-3 overflow-x-auto max-w-full">
              {argsText}
            </pre>
          </div>

          {result !== undefined && formattedResult && (
            <div className="aui-tool-fallback-result-root border-t px-3 sm:px-4 pt-3 space-y-2 min-w-0">
              <p
                className={cn(
                  'text-xs font-semibold',
                  resultIsError ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {resultIsError ? 'Error:' : 'Result:'}
              </p>

              {/* Display formatted text prominently */}
              <div
                className={cn(
                  'aui-tool-fallback-result-content rounded-md p-2 text-xs sm:p-3 whitespace-pre-wrap break-words max-w-full',
                  resultIsError
                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                    : 'bg-muted'
                )}
              >
                {formattedResult.displayText}
              </div>

              {/* Collapsible full response */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className="h-3 w-3 transition-transform duration-200 data-[state=open]:rotate-180" />
                  <span>View Full Response</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 text-xs bg-muted/30 p-2 rounded border border-border/30 overflow-x-auto max-w-full">
                    {JSON.stringify(formattedResult.rawResult, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Show error details for incomplete status */}
          {status.type === 'incomplete' && status.error !== undefined && (
            <div className="aui-tool-fallback-error-root border-t border-destructive/20 px-3 sm:px-4 pt-3 min-w-0">
              <p className="mb-2 text-xs font-semibold text-destructive">Error Details:</p>
              <pre className="rounded-md bg-destructive/10 p-2 text-xs sm:p-3 text-destructive overflow-x-auto border border-destructive/20 max-w-full">
                {status.error instanceof Error
                  ? status.error.message
                  : typeof status.error === 'string'
                    ? status.error
                    : JSON.stringify(status.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
