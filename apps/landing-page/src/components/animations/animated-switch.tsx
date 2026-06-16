import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { createContext, useContext, type ReactNode } from 'react';

interface SwitchContainerProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}

type SwitchItemProps = {
  value: string;
  label?: string;
  disabled?: boolean;
  badge?: {
    text: string;
    className?: string;
  };
  children?: ReactNode;
};

interface SwitchContextValue {
  value: string;
  onValueChange: (value: string) => void;
  borderRadius?: string;
}

const SwitchContext = createContext<SwitchContextValue | null>(null);

function useSwitchContext(): SwitchContextValue {
  const ctx = useContext(SwitchContext);
  if (!ctx) {
    throw new Error('SwitchItem must be used within a SwitchContainer');
  }
  return ctx;
}

export function SwitchContainer({
  value,
  onValueChange,
  className,
  children,
}: SwitchContainerProps) {
  const hasRoundedXl = className?.includes('rounded-xl');
  const borderRadiusClass = hasRoundedXl ? 'rounded-xl' : 'rounded-full';

  return (
    <div
      className={cn(
        'relative flex w-fit items-center justify-between px-px border backdrop-blur-sm cursor-pointer h-11 flex-row bg-muted',
        borderRadiusClass,
        className
      )}
    >
      <SwitchContext.Provider value={{ value, onValueChange, borderRadius: borderRadiusClass }}>
        {children}
      </SwitchContext.Provider>
    </div>
  );
}

export function SwitchItem({ value, label, disabled, badge, children }: SwitchItemProps) {
  const { value: activeValue, onValueChange, borderRadius = 'rounded-full' } = useSwitchContext();
  const isActive = activeValue === value;

  return (
    <button
      onClick={() => !disabled && onValueChange(value)}
      disabled={disabled}
      data-active={isActive ? 'true' : 'false'}
      className={cn(
        'group relative z-1 p-4 h-10 flex items-center justify-center w-full',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        {
          'z-0': isActive,
        }
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-tab"
          className={cn('absolute inset-0 bg-card border border-border', borderRadius)}
          transition={{
            duration: 0.2,
            type: 'spring',
            stiffness: 100,
            damping: 15,
            velocity: 1,
          }}
        />
      )}
      <span
        className={cn(
          'relative block text-sm font-medium duration-200 shrink-0',
          disabled
            ? 'text-muted-foreground/50'
            : isActive
              ? 'text-secondary-foreground'
              : 'text-muted-foreground'
        )}
      >
        {children ?? label ?? value.charAt(0).toUpperCase() + value.slice(1)}
        {badge && (
          <span
            className={cn(
              'ml-2 text-xs font-semibold text-secondary bg-card  border border-border py-0.5 w-[calc(100%+1rem)] px-1 rounded-full',
              badge.className
            )}
          >
            {badge.text}
          </span>
        )}
      </span>
    </button>
  );
}
