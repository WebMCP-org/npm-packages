import { withTheme } from '@rjsf/core';
import { Theme as shadcnTheme } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useState } from 'react';
import { formatMcpResult } from '../lib/mcp-utils';
import { cn } from '../lib/utils';
import type { ToolInfo } from '../types';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

const Form = withTheme(shadcnTheme);

type ToolCallState =
  | { status: 'idle' }
  | { status: 'loading'; params: Record<string, unknown> }
  | { status: 'success'; params: Record<string, unknown>; result: unknown }
  | { status: 'error'; params: Record<string, unknown>; error: string };

interface ToolExecutionPanelProps {
  /** Array of tools to display and execute */
  tools: ToolInfo[];

  /** Callback to execute a tool - receives toolName and args, returns raw JSON string result */
  onToolCall: (toolName: string, argsJson: string) => Promise<string>;

  /** Optional title for the panel header */
  title?: string;

  /** Optional class name for the container */
  className?: string;
}

/**
 * Tool execution panel component that displays a list of tools
 * with auto-generated forms for execution.
 */
export const ToolExecutionPanel: FC<ToolExecutionPanelProps> = ({
  tools,
  onToolCall,
  title = 'Interactive Tool Executor',
  className,
}) => {
  const [toolStates, setToolStates] = useState<Record<string, ToolCallState>>({});

  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      // Set loading state with params
      setToolStates((prev) => ({
        ...prev,
        [toolName]: { status: 'loading', params: args },
      }));

      try {
        const argsJson = JSON.stringify(args);
        const resultString = await onToolCall(toolName, argsJson);

        // Try to parse as JSON, but if it fails, treat as plain string
        let result: unknown;
        try {
          result = JSON.parse(resultString);
        } catch {
          // If JSON parsing fails, the result is a plain string
          result = resultString;
        }

        // Set success state with params and result
        setToolStates((prev) => ({
          ...prev,
          [toolName]: { status: 'success', params: args, result },
        }));

        // Clear success state after 3 seconds
        setTimeout(() => {
          setToolStates((prev) => {
            const newState = { ...prev };
            if (newState[toolName]?.status === 'success') {
              delete newState[toolName];
            }
            return newState;
          });
        }, 5000);
      } catch (error) {
        // Set error state with params
        const errorMessage = error instanceof Error ? error.message : 'Failed to call tool';
        setToolStates((prev) => ({
          ...prev,
          [toolName]: { status: 'error', params: args, error: errorMessage },
        }));
      }
    },
    [onToolCall]
  );

  if (tools.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
        <p className="text-sm text-muted-foreground">No tools available</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">{title}</h3>
        <Badge variant="secondary">{tools.length} tools</Badge>
      </div>

      <div className="space-y-3">
        {tools.map((tool) => {
          const toolState = toolStates[tool.name] || { status: 'idle' };
          const isLoading = toolState.status === 'loading';
          const isSuccess = toolState.status === 'success';
          const isError = toolState.status === 'error';
          const hasExecuted = isLoading || isSuccess || isError;

          // Parse the inputSchema from JSON string
          let parsedSchema: unknown;
          try {
            parsedSchema = JSON.parse(tool.inputSchema);
          } catch (e) {
            console.error(`Failed to parse schema for tool ${tool.name}:`, e);
            parsedSchema = { type: 'object', properties: {} };
          }

          // Parse MCP result if success
          const formattedResult =
            isSuccess && 'result' in toolState ? formatMcpResult(toolState.result) : null;
          const resultIsError = formattedResult?.isError || isError;

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
                  !hasExecuted && 'border-border bg-muted/20'
                )}
              >
                <CollapsibleTrigger className="w-full p-4 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                      <span className="font-medium text-sm">{tool.name}</span>
                    </div>
                    {hasExecuted && (
                      <Badge
                        variant={
                          isLoading ? 'secondary' : resultIsError ? 'destructive' : 'default'
                        }
                      >
                        {isLoading ? 'Running...' : resultIsError ? 'Error' : 'Success'}
                      </Badge>
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-3">
                    {tool.description && (
                      <div className="text-sm text-muted-foreground leading-relaxed">
                        {tool.description}
                      </div>
                    )}

                    {/* Input Parameters (shown after execution) */}
                    {hasExecuted && 'params' in toolState && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Input:</div>
                        <pre className="text-xs bg-muted/50 p-3 rounded border border-border/40 overflow-x-auto font-mono">
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
                            'text-sm p-3 rounded-md whitespace-pre-wrap font-mono',
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
                            <pre className="mt-2 text-xs bg-muted/30 p-3 rounded border border-border/30 overflow-x-auto font-mono">
                              {JSON.stringify(formattedResult.rawResult, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    {/* Error message (for non-MCP errors) */}
                    {isError && 'error' in toolState && (
                      <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive border border-destructive/20">
                        {toolState.error}
                      </div>
                    )}

                    {/* Form (hidden after execution starts) */}
                    {!hasExecuted && (
                      <div className="pt-2">
                        <Form
                          schema={parsedSchema as Record<string, unknown>}
                          validator={validator}
                          disabled={isLoading}
                          onSubmit={(data) => {
                            handleToolCall(tool.name, data.formData as Record<string, unknown>);
                          }}
                        />
                      </div>
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
