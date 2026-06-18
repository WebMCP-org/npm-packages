'use client';

import { cn } from '@/lib/utils';
import { motion, useInView } from 'motion/react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Icons } from '@/components/icons';

type OrbitingIconName = 'vercel';

export type OrbitingItem = {
  id: number;
  delay: number;
  rayIndex: number;
  distance: number;
  className: string;
  icon: ReactNode | OrbitingIconName;
};

type OrbitingIconsBurstProps = {
  items: OrbitingItem[];
  lineCount?: number;
  centerIcon?: ReactNode | OrbitingIconName;
  showConnectingLines?: boolean;
  className?: string;
  inView?: boolean;
};

function renderIcon(icon: ReactNode | OrbitingIconName | undefined, className: string) {
  if (!icon) {
    return null;
  }

  if (typeof icon !== 'string') {
    return icon;
  }

  switch (icon) {
    case 'vercel':
      return <Icons.vercel className={className} />;
    default:
      return null;
  }
}

export function OrbitingIconsBurst({
  items,
  lineCount = 32,
  centerIcon,
  showConnectingLines = true,
  className,
  inView,
}: OrbitingIconsBurstProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: false, margin: '-100px' });
  const isInView = inView !== undefined ? inView : inViewResult;

  const safeLineCount = Math.max(1, lineCount);
  const rays = Array.from({ length: safeLineCount }, (_, index) => ({
    id: index,
    angle: (360 / safeLineCount) * index,
  }));

  const normalizedItems = items.map((item) => {
    const normalizedRay = ((item.rayIndex % safeLineCount) + safeLineCount) % safeLineCount;

    return {
      ...item,
      normalizedRay,
    };
  });

  const itemsGroupedByRay = normalizedItems.reduce(
    (acc, item) => {
      if (!acc[item.normalizedRay]) {
        acc[item.normalizedRay] = [];
      }
      acc[item.normalizedRay].push(item);
      acc[item.normalizedRay].sort((a, b) => a.distance - b.distance);
      return acc;
    },
    {} as Record<number, Array<(typeof normalizedItems)[number]>>
  );

  return (
    <div
      ref={ref}
      className={cn('w-full flex items-center justify-center relative overflow-hidden', className)}
    >
      {rays.map((ray) => (
        <div
          key={`ray-${ray.id}`}
          className="absolute left-1/2 top-1/2 -z-5"
          style={{
            transform: `translate(-50%, -50%) rotate(${ray.angle}deg)`,
          }}
        ></div>
      ))}

      {/* Center Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: isInView ? 1 : 0 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
          delay: 0.2,
        }}
        className="size-10 z-20 rounded-full flex items-center justify-center"
      >
        {renderIcon(centerIcon, 'size-full')}
      </motion.div>

      {/* Connecting Lines - Render first so they appear behind icons */}
      {showConnectingLines &&
        rays.map((ray) => {
          const itemsOnRay = itemsGroupedByRay[ray.id] ?? [];
          const nearestItem = itemsOnRay[0];

          return (
            <div
              key={`line-wrapper-${ray.id}`}
              className="absolute left-1/2 top-1/2 z-10"
              style={{
                transform: `translate(-50%, -50%) rotate(${ray.angle}deg)`,
              }}
            >
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{
                  scaleX: isInView ? 1 : 0,
                  opacity: isInView ? (nearestItem ? 0.5 : 0.35) : 0,
                }}
                transition={{
                  delay: nearestItem ? nearestItem.delay + 0.2 : 0.25,
                  duration: 0.4,
                }}
                className="h-[1.5px] origin-left bg-border dark:bg-border w-screen"
              />
            </div>
          );
        })}

      {/* Orbiting Icons */}
      {normalizedItems.map((icon) => {
        const ray = rays[icon.normalizedRay];
        const angleInRadians = (ray.angle * Math.PI) / 180;
        const iconDistance = icon.distance;
        // Calculate position and offset by half icon size (20px for size-10)
        // so the line passes through the icon's center
        const iconOffset = 20;
        const x = Math.cos(angleInRadians) * iconDistance - iconOffset;
        const y = Math.sin(angleInRadians) * iconDistance - iconOffset;

        return (
          <motion.div
            key={icon.id}
            initial={{ scale: 0, x: -iconOffset, y: -iconOffset }}
            animate={{
              scale: isInView ? 1 : 0,
              x: isInView ? x : -iconOffset,
              y: isInView ? y : -iconOffset,
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: icon.delay,
            }}
            className={cn(
              'size-10 absolute left-1/2 top-1/2 z-30 rounded-full flex items-center justify-center',
              icon.className
            )}
          >
            {renderIcon(icon.icon, 'size-full')}
          </motion.div>
        );
      })}
    </div>
  );
}
