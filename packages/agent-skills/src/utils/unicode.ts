/**
 * Unicode utilities for Agent Skills
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */

/**
 * Normalize string using NFKC (Normalization Form Compatibility Composition).
 * Matches Python's unicodedata.normalize("NFKC", str) behavior.
 *
 * NFKC normalization:
 * - Decomposes characters into their base form
 * - Then recomposes them into the composed form
 * - Example: "café" with combining accent becomes "café" with precomposed é
 *
 * This is critical for i18n support and consistent validation across platforms.
 *
 * @param str - Input string to normalize.
 * @returns NFKC-normalized string.
 * @example
 * ```ts
 * const normalized = normalizeNFKC("cafe\u0301")
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */
export function normalizeNFKC(str: string): string {
  return str.normalize('NFKC');
}
