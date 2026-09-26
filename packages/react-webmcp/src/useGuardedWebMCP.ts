'use client';

import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { consent, toMcpAnnotations, type ConsentMetadata } from '@mcp-b/webmcp-plugins/consent';
import { useWebMCP } from 'usewebmcp';
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
   * on-page {@link ConsentGuard} approval flow.
   */
  consent: ConsentMetadata;
  /** Forwarded to the underlying useWebMCP call. Defaults to true. */
  enabled?: boolean;
  /** The real tool implementation, called only after consent is granted. */
  execute: (args: Args) => Promise<Result>;
}

/**
 * Drop-in replacement for `useWebMCP` that gates every tool invocation behind
 * an in-page consent prompt when `consent.requiresApproval` evaluates to true.
 *
 * Internally, this hook acts as a thin translator that wires the consent
 * policy plugin from `@mcp-b/webmcp-plugins/consent` into `useWebMCP`.
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

  // `useWebMCP`'s `execute` type is derived from its own schema-inference
  // generics, which don't know about `GuardedToolDef`'s independent `Args`/
  // `Result` type parameters — the two can't be unified structurally. Rather
  // than opting out of checking entirely with `as any`, anchor the cast to
  // `useWebMCP`'s own declared parameter type, so a future signature change
  // in `useWebMCP` still surfaces as a type error here instead of silently
  // continuing to compile.
  type UseWebMCPConfig = Parameters<typeof useWebMCP>[0];

  return useWebMCP({
    name: def.name,
    description: def.description,
    ...(def.inputSchema && { inputSchema: def.inputSchema }),
    annotations: toMcpAnnotations(def.consent),
    ...(def.enabled !== undefined && { enabled: def.enabled }),
    plugins: [consent(broker, def.consent)],
    execute: ((args: Args) => def.execute(args)) as unknown as UseWebMCPConfig['execute'],
  });
}
