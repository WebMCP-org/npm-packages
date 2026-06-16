import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type HeaderBadgeProps = {
  icon: ReactNode;
  text: string;
  className?: string;
};

export function HeaderBadge({ icon, text, className }: HeaderBadgeProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-1.5 rounded-full shadow-badge bg-card max-w-full overflow-hidden',
        className
      )}
    >
      <span className="shrink-0 w-4 h-4">{icon}</span>
      <span className="text-sm font-medium text-foreground truncate">{text}</span>
    </div>
  );
}
