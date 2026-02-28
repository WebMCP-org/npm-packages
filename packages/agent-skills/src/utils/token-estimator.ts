/**
 * Token estimation utilities
 *
 * Provides rough token count estimates for context management.
 */

/**
 * Estimate token count for text.
 * Uses rough approximation: ~1 token per 4 characters.
 *
 * This is intentionally simple and conservative. For production,
 * consider using a proper tokenizer like tiktoken or @anthropic-ai/tokenizer.
 *
 * The 4-character heuristic tends to overestimate slightly, which is safer
 * for context limits than underestimating.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 * @example
 * ```ts
 * const tokens = estimateTokens("Hello world")
 * ```
 * @see https://agentskills.io/specification
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}
