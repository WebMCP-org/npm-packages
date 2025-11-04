import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { withTheme } from '@rjsf/core';
import { Theme as shadcnTheme } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { type UIEmbeddedResource, useUIResources } from '@/contexts/UIResourceContext';
import { formatMcpResult } from '@/lib/mcp-utils';
import { cn } from '@/lib/utils';
import { ToolSourceBadge } from './tool-source-badge';
import { type ToolStatus, ToolStatusBadge } from './tool-status-badge';

// Type for tool call result that may contain UI resources
type ToolResultContent = {
  content?: Array<{
    type: string;
    resource?: UIEmbeddedResource;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

// Type guard to check if an item is a UI resource
function isUIResource(item: unknown): item is { type: string; resource: UIEmbeddedResource } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    item.type === 'resource' &&
    'resource' in item
  );
}

const Form = withTheme(shadcnTheme);

type ToolCallState =
  | { status: 'idle' }
  | { status: 'loading'; params: Record<string, unknown> }
  | { status: 'success'; params: Record<string, unknown>; result: unknown }
  | { status: 'error'; params: Record<string, unknown>; error: string };

interface ToolExecutionPanelProps {
  /** Array of tools to display and execute */
  tools: Tool[];

  /** Callback to execute a tool */
  onToolCall: (
    toolName: string,
    args: Record<string, unknown>,
    sourceId?: string
  ) => Promise<unknown>;

  /** Optional title for the panel header */
  title?: string;

  /** Optional class name for the container */
  className?: string;

  /** Whether to show the close button */
  showClose?: boolean;

  /** Callback when close button is clicked */
  onClose?: () => void;
}

/**
 * Reusable tool execution panel component that displays a list of tools
 * with auto-generated forms for execution.
 *
 * Features:
 * - Auto-generated forms using React JSON Schema Form
 * - Loading/success/error states for each tool
 * - Automatic UI resource extraction and display (for manual tool calls)
 * - Auto-clearing success state after 3 seconds
 *
 * Note: This handles manual tool execution. AI-initiated calls use McpToolBridge.
 * Both paths extract resources, with deduplication handled by UIResourceContext.
 */
export const ToolExecutionPanel: FC<ToolExecutionPanelProps> = ({
  tools,
  onToolCall,
  title = 'Available Tools',
  className,
  showClose = false,
  onClose,
}) => {
  const { addResource } = useUIResources();
  const [toolStates, setToolStates] = useState<Record<string, ToolCallState>>({});

  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      // Set loading state with params
      setToolStates((prev) => ({
        ...prev,
        [toolName]: { status: 'loading', params: args },
      }));

      try {
        // Extract sourceId from the tool to route to correct client
        const tool = tools.find((t) => t.name === toolName);
        const sourceId = tool ? (tool as Tool & { _sourceId?: string })._sourceId : undefined;

        const result = await onToolCall(toolName, args, sourceId);

        // Set success state with params and result
        setToolStates((prev) => ({
          ...prev,
          [toolName]: { status: 'success', params: args, result },
        }));

        // Extract and add UI resources to side panel
        // Note: Deduplication is handled by UIResourceContext to prevent duplicates
        if (result && typeof result === 'object') {
          const resultObj = result as ToolResultContent;
          if (resultObj.content && Array.isArray(resultObj.content)) {
            resultObj.content.forEach((item) => {
              if (isUIResource(item) && item.resource) {
                addResource({
                  toolName,
                  resource: item.resource,
                });
              }
            });
          }
        }

        // Clear success state after 3 seconds
        setTimeout(() => {
          setToolStates((prev) => {
            const newState = { ...prev };
            if (newState[toolName]?.status === 'success') {
              delete newState[toolName];
            }
            return newState;
          });
        }, 3000);
      } catch (error) {
        // Set error state with params
        const errorMessage = error instanceof Error ? error.message : 'Failed to call tool';
        setToolStates((prev) => ({
          ...prev,
          [toolName]: { status: 'error', params: args, error: errorMessage },
        }));
      }
    },
    [tools, onToolCall, addResource]
  );

  if (tools.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur-sm',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">({tools.length})</span>
        </div>
        {showClose && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tools.map((tool) => {
          const toolState = toolStates[tool.name] || { status: 'idle' };
          const isLoading = toolState.status === 'loading';
          const isSuccess = toolState.status === 'success';
          const isError = toolState.status === 'error';
          const hasExecuted = isLoading || isSuccess || isError;

          // Parse MCP result if success
          const formattedResult =
            isSuccess && 'result' in toolState ? formatMcpResult(toolState.result) : null;
          const resultIsError = formattedResult?.isError || isError;

          // Map internal status to ToolStatus type
          const displayStatus: ToolStatus = isLoading
            ? 'running'
            : isError || resultIsError
              ? 'error'
              : isSuccess
                ? 'completed'
                : 'idle';

          return (
            <Collapsible
              key={tool.name}
              defaultOpen={hasExecuted}
              open={hasExecuted ? true : undefined}
            >
              <div
                className={cn(
                  'rounded-lg border transition-colors',
                  resultIsError && 'border-destructive/50 bg-destructive/5',
                  isSuccess && !resultIsError && 'border-green-500/50 bg-green-500/5',
                  !hasExecuted && 'border-border/40 bg-muted/20'
                )}
              >
                <CollapsibleTrigger className="w-full p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                      <span className="font-medium text-sm">{tool.name}</span>
                      <ToolSourceBadge
                        sourceId={(tool as Tool & { _sourceId?: string })._sourceId}
                        iconOnly
                      />
                    </div>
                    {hasExecuted && (
                      <ToolStatusBadge status={displayStatus} isError={resultIsError} />
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-3">
                    {tool.description && (
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {tool.description}
                      </div>
                    )}

                    {/* Input Parameters (shown after execution) */}
                    {hasExecuted && 'params' in toolState && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Input:</div>
                        <pre className="text-xs bg-muted/50 p-2 rounded border border-border/40 overflow-x-auto">
                          {JSON.stringify(toolState.params, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Output - Formatted or Raw */}
                    {isSuccess && formattedResult && (
                      <div className="space-y-2">
                        <div
                          className={cn(
                            'text-xs font-medium',
                            resultIsError ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {resultIsError ? 'Error:' : 'Output:'}
                        </div>

                        {/* Display formatted text prominently */}
                        <div
                          className={cn(
                            'text-xs p-3 rounded-md whitespace-pre-wrap',
                            resultIsError
                              ? 'bg-destructive/10 text-destructive border border-destructive/20'
                              : 'bg-muted/50 border border-border/40'
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
                            <pre className="mt-2 text-xs bg-muted/30 p-2 rounded border border-border/30 overflow-x-auto">
                              {JSON.stringify(formattedResult.rawResult, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    {/* Error message (for non-MCP errors) */}
                    {isError && 'error' in toolState && (
                      <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive border border-destructive/20">
                        {toolState.error}
                      </div>
                    )}

                    {/* Form (hidden after execution starts) */}
                    {!hasExecuted && (
                      <Form
                        // @ts-expect-error - Tool inputSchema type from MCP SDK doesn't match RJSF schema type exactly
                        schema={tool.inputSchema}
                        validator={validator}
                        disabled={isLoading}
                        onSubmit={(data) => {
                          handleToolCall(tool.name, data.formData as Record<string, unknown>);
                        }}
                      />
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};
