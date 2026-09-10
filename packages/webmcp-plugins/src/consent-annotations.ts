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
 * | `readOnlyHint`   | explicit `readOnly`, or fallback: `riskLevel === 'low' && reversible` | Backwards-compatible: if the caller omits `readOnly`, the old inference is preserved. Explicit `readOnly` takes precedence. |
 * | `destructiveHint`| `!reversible`                              | MCP defines "destructive" as an action that changes or deletes state in a way that cannot be undone. This maps cleanly to `reversible === false`. |
 * | `idempotentHint` | `consent.idempotent ?? false`              | Idempotency is caller-declared. Reversible ≠ safe to repeat (e.g. increment + decrement); irreversible ≠ non-idempotent (e.g. archive). Omitted defaults to false. |
 *
 * ### Migration note (Step 3.3 — option (a) chosen)
 *
 * `readOnlyHint` falls back to the old inferred value
 * (`riskLevel === 'low' && reversible`) when `consent.readOnly` is `undefined`.
 * This preserves backwards compatibility — no existing tool silently changes
 * its hint. Callers can override by setting `readOnly` explicitly.
 */
export function toMcpAnnotations(consent: ConsentMetadata): McpToolAnnotations {
  return {
    readOnlyHint: consent.readOnly ?? (consent.riskLevel === 'low' && consent.reversible),
    destructiveHint: !consent.reversible,
    idempotentHint: consent.idempotent ?? false,
  };
}
