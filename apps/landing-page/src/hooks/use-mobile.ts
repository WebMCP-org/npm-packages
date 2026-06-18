import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile (< 768px)
 * @param breakpoint - The breakpoint in pixels (default: 768 for Tailwind's md breakpoint)
 * @returns boolean indicating if the viewport is mobile
 */
export function useMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Check on mount
    checkMobile();

    // Listen for resize events
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}
