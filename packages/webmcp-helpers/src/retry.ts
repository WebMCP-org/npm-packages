/**
 * Retry and polling utilities for WebMCP userscripts.
 */

/**
 * Options for retry operations.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between attempts in ms (default: 100) */
  delay?: number;
  /** Whether to use exponential backoff (default: false) */
  exponentialBackoff?: boolean;
  /** Maximum delay when using exponential backoff (default: 5000) */
  maxDelay?: number;
}

/**
 * Retry a function until the predicate returns true.
 * Useful for waiting for async state changes.
 *
 * @param fn - Async function to execute
 * @param predicate - Function to test the result
 * @param options - Retry options
 * @returns The result that satisfied the predicate
 * @throws Error if predicate never satisfied within max attempts
 *
 * @example
 * // Wait for data to load
 * const data = await retryUntil(
 *   () => fetchData(),
 *   (result) => result.loaded === true,
 *   { maxAttempts: 5, delay: 200 }
 * );
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 100, exponentialBackoff = false, maxDelay = 5000 } = options;

  let lastResult: T | undefined;
  let currentDelay = delay;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = await fn();

    if (predicate(lastResult)) {
      return lastResult;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, currentDelay));

      if (exponentialBackoff) {
        currentDelay = Math.min(currentDelay * 2, maxDelay);
      }
    }
  }

  throw new Error(`Predicate not satisfied after ${maxAttempts} attempts`);
}

/**
 * Retry a function that may throw, with configurable attempts.
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns The successful result
 * @throws The last error if all attempts fail
 *
 * @example
 * const data = await retry(
 *   () => riskyApiCall(),
 *   { maxAttempts: 3, delay: 500 }
 * );
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, delay = 100, exponentialBackoff = false, maxDelay = 5000 } = options;

  let lastError: Error | undefined;
  let currentDelay = delay;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, currentDelay));

        if (exponentialBackoff) {
          currentDelay = Math.min(currentDelay * 2, maxDelay);
        }
      }
    }
  }

  throw lastError;
}

/**
 * Poll a condition until it becomes true.
 * Similar to waitForElement but for arbitrary conditions.
 *
 * @param condition - Function returning boolean or Promise<boolean>
 * @param timeout - Maximum time to wait (default: 5000)
 * @param interval - Polling interval in ms (default: 100)
 * @throws Error if condition not met within timeout
 *
 * @example
 * // Wait for a global variable to be set
 * await pollUntil(() => window.myApp?.initialized === true);
 *
 * // Wait for network idle
 * await pollUntil(() => document.readyState === 'complete', 10000);
 */
export async function pollUntil(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for a specified duration.
 * Use sparingly - prefer waitForElement or pollUntil when possible.
 *
 * @param ms - Duration to wait in milliseconds
 *
 * @example
 * await sleep(500); // Wait 500ms
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Debounce a function - only execute after delay with no new calls.
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * const debouncedSearch = debounce((query) => search(query), 300);
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function - execute at most once per interval.
 *
 * @param fn - Function to throttle
 * @param interval - Minimum interval between executions
 * @returns Throttled function
 *
 * @example
 * const throttledScroll = throttle(() => updatePosition(), 100);
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= interval) {
      lastRun = now;
      fn(...args);
    }
  };
}
