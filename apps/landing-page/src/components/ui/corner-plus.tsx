import { cn } from '@/lib/utils';

type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'all';

type CornerPlusProps = {
  position?: CornerPosition;
  className?: string;
};

function CornerPlusSingle({
  position,
  className,
}: {
  position: Exclude<CornerPosition, 'all'>;
  className?: string;
}) {
  const positionClasses = {
    'top-left': {
      h1: '-left-3 -top-px',
      h2: 'left-0 -top-px',
      v1: '-left-px -top-3',
      v2: '-left-px top-0',
    },
    'top-right': {
      h1: '-right-3 -top-px',
      h2: 'right-0 -top-px',
      v1: '-right-px -top-3',
      v2: '-right-px top-0',
    },
    'bottom-left': {
      h1: '-bottom-px -left-3',
      h2: '-bottom-px left-0',
      v1: '-bottom-3 -left-px',
      v2: '-left-px bottom-0',
    },
    'bottom-right': {
      h1: '-bottom-px -right-3',
      h2: '-bottom-px right-0',
      v1: '-bottom-3 -right-px',
      v2: '-right-px bottom-0',
    },
  };

  const classes = positionClasses[position];

  return (
    <>
      <div className={cn('absolute z-40 h-px w-3 bg-current', classes.h1, className)} />
      <div className={cn('absolute z-40 h-px w-3 bg-current', classes.h2, className)} />
      <div className={cn('absolute z-40 h-3 w-px bg-current', classes.v1, className)} />
      <div className={cn('absolute z-40 h-3 w-px bg-current', classes.v2, className)} />
    </>
  );
}

export function CornerPlus({ position = 'all', className }: CornerPlusProps) {
  if (position === 'all') {
    return (
      <>
        <CornerPlusSingle position="top-left" className={className} />
        <CornerPlusSingle position="top-right" className={className} />
        <CornerPlusSingle position="bottom-left" className={className} />
        <CornerPlusSingle position="bottom-right" className={className} />
      </>
    );
  }

  return <CornerPlusSingle position={position} className={className} />;
}
