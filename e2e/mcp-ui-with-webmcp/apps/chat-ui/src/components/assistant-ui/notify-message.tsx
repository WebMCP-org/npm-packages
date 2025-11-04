import { Bell, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NotifyMessageProps {
  message: string;
  timestamp?: Date;
  className?: string;
}

/**
 * Get preview text (first line or truncated)
 */
function getPreviewText(message: string, maxLength = 80): string {
  // Get first line
  const firstLine = message.split('\n')[0];

  // Truncate if too long
  if (firstLine.length > maxLength) {
    return `${firstLine.substring(0, maxLength)}...`;
  }

  return firstLine;
}

/**
 * NotifyMessage Component
 * Displays notification messages from iframe resources in a collapsible format
 */
export const NotifyMessage: React.FC<NotifyMessageProps> = ({ message, timestamp, className }) => {
  // Collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(true);

  const previewText = getPreviewText(message);
  const hasMultipleLines = message.includes('\n') || message.length > 80;

  return (
    <div
      className={cn(
        'notify-message-root flex w-full flex-col gap-3 rounded-lg border border-blue-500/50 bg-blue-500/5 py-3 transition-colors',
        className
      )}
    >
      <div className="notify-message-header flex items-center gap-2 px-4">
        <Bell className="size-4 text-blue-500 shrink-0" />
        <p className="notify-message-title flex-grow">
          <span className="text-muted-foreground">MCP-UI Notification</span>
          {timestamp && (
            <span className="text-xs text-muted-foreground/70 ml-2">
              {timestamp.toLocaleTimeString()}
            </span>
          )}
        </p>
        {hasMultipleLines && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand notification' : 'Collapse notification'}
          >
            {isCollapsed ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronUpIcon className="size-4" />
            )}
          </Button>
        )}
      </div>

      {/* Preview when collapsed */}
      {isCollapsed && (
        <div className="notify-message-preview px-4">
          <div className="text-sm text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewText}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Full content when expanded */}
      {!isCollapsed && (
        <div className="notify-message-content border-t border-blue-500/20 pt-3 px-4">
          <div className="rounded-md bg-muted/30 p-3 text-sm prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
