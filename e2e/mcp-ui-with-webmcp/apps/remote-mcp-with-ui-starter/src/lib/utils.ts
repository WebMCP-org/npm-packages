import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes with proper precedence
 * Combines clsx for conditional classes and tw-merge for Tailwind deduplication
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500', 'hover:bg-blue-600')
 * // Returns: 'px-2 py-1 bg-blue-500 hover:bg-blue-600' (if condition is true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
