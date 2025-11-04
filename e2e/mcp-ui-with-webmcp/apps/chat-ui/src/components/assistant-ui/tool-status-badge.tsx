import { AlertCircle, CheckIcon, Clock, Loader2, XCircle } from 'lucide-react';
import type { FC } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Simplified tool status types that work for both execution panel and fallback
 */
export type ToolStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled' | 'waiting';

export type ToolStatusInfo = {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof CheckIcon;
  className?: string;
};

/**
 * Get status badge information based on status and error flag
 */
export function getToolStatusInfo(status: ToolStatus, isError?: boolean): ToolStatusInfo {
  if (status === 'running') {
    return {
      label: 'Running',
      variant: 'default',
      icon: Loader2,
      className: 'bg-blue-500 hover:bg-blue-500',
    };
  }

  if (status === 'waiting') {
    return {
      label: 'Waiting',
      variant: 'outline',
      icon: Clock,
      className: 'border-yellow-500 text-yellow-600',
    };
  }

  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      variant: 'secondary',
      icon: XCircle,
      className: '',
    };
  }

  if (status === 'error' || isError) {
    return {
      label: 'Error',
      variant: 'destructive',
      icon: AlertCircle,
      className: '',
    };
  }

  // completed
  return {
    label: 'Completed',
    variant: 'default',
    icon: CheckIcon,
    className: 'bg-green-500 hover:bg-green-500',
  };
}

export interface ToolStatusBadgeProps {
  status: ToolStatus;
  isError?: boolean;
  className?: string;
}

/**
 * Shared status badge component for tool execution display
 *
 * @example
 * ```tsx
 * <ToolStatusBadge status="running" />
 * <ToolStatusBadge status="completed" isError={false} />
 * <ToolStatusBadge status="completed" isError={true} />
 * ```
 */
export const ToolStatusBadge: FC<ToolStatusBadgeProps> = ({ status, isError, className }) => {
  const statusInfo = getToolStatusInfo(status, isError);
  const Icon = statusInfo.icon;
  const isRunning = status === 'running';

  return (
    <Badge variant={statusInfo.variant} className={cn('gap-1.5', statusInfo.className, className)}>
      <Icon className={cn('h-3 w-3', isRunning && 'animate-spin')} />
      <span>{statusInfo.label}</span>
    </Badge>
  );
};
