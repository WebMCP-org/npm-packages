import type { ConsentMetadata } from './consent-types.js';

/**
 * The subset of MCP ToolAnnotations produced by {@link toMcpAnnotations}.
 *
 * These are the three behaviour-hint fields defined in the MCP spec; `title` is
 * intentionally omitted here because it is supplied by the guarded hook rather
 * than derived from risk metadata.
 */
export interface McpToolAnnotations {
  /** True when the tool only reads state and never modifies it. */
  readOnlyHint?: boolean;
  /** True when the tool may permanently alter or delete state. */
  destructiveHint?: boolean;
  /** True when repeating the call with the same inputs is safe. */
  idempotentHint?: boolean;
}

/**
 * Derives MCP behaviour hints from consent metadata so that native agent
 * runtimes (e.g. MCP-B Agent extension) receive real signal.
 *
 * ## Mapping rationale
 *
 * | Annotation       | Condition                                  | Reasoning |
 * |------------------|--------------------------------------------|-----------|
 * | `readOnlyHint`   | `riskLevel === 'low' && reversible`        | Only pure reads are both low-risk *and* inherently reversible (nothing was written). A medium-risk reversible call still mutates state, so it is not read-only. |
 * | `destructiveHint`| `!reversible`                              | MCP defines "destructive" as an action that changes or deletes state in a way that cannot be undone. This maps cleanly to `reversible === false`. |
 * | `idempotentHint` | `reversible && riskLevel !== 'high'`       | High-risk calls (e.g. forced rollback) may be reversible in theory but should never be treated as safe to repeat blindly. All other reversible calls are safe to retry if needed. |
 *
 * This is intentionally a first-draft heuristic; callers that need finer
 * control can override individual fields after calling this function.
 */
export function toMcpAnnotations(consent: ConsentMetadata): McpToolAnnotations {
  return {
    readOnlyHint: consent.riskLevel === 'low' && consent.reversible,
    destructiveHint: !consent.reversible,
    idempotentHint: consent.reversible && consent.riskLevel !== 'high',
  };
}
