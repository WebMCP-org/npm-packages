import { Cloud, Layout } from 'lucide-react';
import type { FC } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getToolSourceType } from '@/lib/mcp-utils';
import { cn } from '@/lib/utils';

export interface ToolSourceBadgeProps {
  sourceId?: string;
  className?: string;
  iconOnly?: boolean;
}

/**
 * Badge component that displays the source of a tool (Remote MCP or WebMCP)
 * with a tooltip explaining what each source type means.
 *
 * @example
 * ```tsx
 * // Remote MCP tool (no sourceId)
 * <ToolSourceBadge />
 *
 * // WebMCP tool (has sourceId)
 * <ToolSourceBadge sourceId="iframe-123" />
 *
 * // Icon only (for compact display)
 * <ToolSourceBadge sourceId="iframe-123" iconOnly />
 * ```
 */
export const ToolSourceBadge: FC<ToolSourceBadgeProps> = ({
  sourceId,
  className,
  iconOnly = false,
}) => {
  const sourceType = getToolSourceType(sourceId);

  const isRemote = sourceType === 'remote';
  const Icon = isRemote ? Cloud : Layout;
  const label = isRemote ? 'Remote MCP' : 'WebMCP';
  const tooltipText = isRemote
    ? 'Tool from HTTP MCP server'
    : 'Tool that runs in client JavaScript (no external server required)';

  // Color classes for badges
  const badgeClassName = isRemote
    ? 'bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'
    : 'bg-green-500/10 text-green-700 border-green-500/20 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'cursor-help',
            iconOnly ? 'gap-0 px-1.5' : 'gap-1.5',
            badgeClassName,
            className
          )}
        >
          <Icon className="h-3 w-3" />
          {!iconOnly && <span>{label}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
