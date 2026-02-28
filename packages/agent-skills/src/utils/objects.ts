/**
 * Builds a Record from string-keyed entries with type retention.
 *
 * @param entries - Iterable of `[key, value]` tuples.
 * @returns Object record containing each key-value pair.
 * @example
 * ```ts
 * const map = entriesToRecord([
 *   ["name", "demo"],
 *   ["description", "Demo skill"]
 * ])
 * ```
 */
export function entriesToRecord<V>(entries: Iterable<readonly [string, V]>): Record<string, V> {
  const result: Record<string, V> = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}
