'use client';

import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { useWebMCP } from 'usewebmcp';
import { toMcpAnnotations } from './consent-annotations.js';
import type { ConsentMetadata } from './consent-types.js';
import { useConsentBroker } from './ConsentBrokerProvider.js';

/**
 * Definition for a guarded tool that requires consent before execution.
 *
 * @template Args - The argument type for the tool execution
 * @template Result - The return type of the tool execution
 */
export interface GuardedToolDef<Args, Result> {
  /** Unique registered tool name. */
  name: string;
  /** Human-readable description shown to the AI agent. */
  description: string;
  /**
   * JSON schema (or Zod schema) describing the tool's input.
   * Must match whatever `useWebMCP`'s `inputSchema` field accepts.
   */
  inputSchema?: ToolInputSchema;
  /**
   * Consent metadata that drives both the MCP annotation hints and the
   * on-page {@link ConsentBroker} approval flow.
   */
  consent: ConsentMetadata;
  /** The real tool implementation, called only after consent is granted. */
  execute: (args: Args) => Promise<Result>;
}

/**
 * Drop-in replacement for `useWebMCP` that gates every tool invocation behind
 * an in-page consent prompt when `consent.requiresApproval` evaluates to true.
 *
 * ### How it works
 *
 * 1. Registers the tool via the existing `useWebMCP` hook (no changes to MCP
 *    registration behaviour).
 * 2. Maps `ConsentMetadata` to MCP `ToolAnnotations` so native agent runtimes
 *    already equipped with approval UI (e.g. the MCP-B Agent extension) receive
 *    real signal rather than empty hints.
 * 3. On each invocation, evaluates `consent.requiresApproval`:
 *    - `false` (or predicate returns `false`): calls `execute` directly.
 *    - `true` (or predicate returns `true`): suspends in `broker.request()`
 *      until the user resolves the consent card (or a 30-second timeout
 *      auto-denies).
 * 4. On denial returns `{ success: false, error: '…' }` rather than throwing,
 *    so the MCP client receives a structured tool-error response.
 *
 * Must be rendered inside a {@link ConsentBrokerProvider}.
 *
 * @template Args - The argument type for the tool execution
 * @template Result - The return type of the tool execution
 *
 * @public
 */
export function useGuardedWebMCP<Args, Result>(def: GuardedToolDef<Args, Result>) {
  const broker = useConsentBroker();

  // NOTE: useWebMCP's real config field is `execute`, not `handler` — confirmed
  // in NOTES.md against usewebmcp's actual WebMCPConfig type. `def.execute` (the
  // caller's real handler) and the `execute:` field below (passed to useWebMCP)
  // are two different functions with the same name — this one wraps that one.
  return useWebMCP({
    name: def.name,
    description: def.description,
    ...(def.inputSchema && { inputSchema: def.inputSchema }),
    ...(def.consent && { annotations: toMcpAnnotations(def.consent) }),
    execute: (async (args: Args) => {
      const needsApproval =
        typeof def.consent.requiresApproval === 'function'
          ? def.consent.requiresApproval(args)
          : def.consent.requiresApproval;

      if (!needsApproval) {
        broker.recordDecision(
          {
            toolName: def.name,
            // NOTE: reflects the registering page's origin, not the verified sender.
            // The MCP tabServer transport receives the real caller's origin in the MessageEvent
            // but discards it before the tool's execute callback is invoked. See NOTES.md.
            origin: window.location.origin,
            args,
            consent: def.consent,
          },
          { approved: true, reason: 'user' }
        );
        return def.execute(args);
      }

      const decision = await broker.request({
        toolName: def.name,
        // NOTE: reflects the registering page's origin, not the verified sender.
        // The MCP tabServer transport receives the real caller's origin in the MessageEvent
        // but discards it before the tool's execute callback is invoked. See NOTES.md.
        origin: window.location.origin,
        args,
        consent: def.consent,
      });

      if (!decision.approved) {
        return { success: false, error: `Action denied by user (${decision.reason}).` };
      }
      return def.execute(args);
    }) as any,
  });
}
