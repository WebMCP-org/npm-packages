'use client';

import { useMemo } from 'react';
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

  // Investigation of usewebmcp's useWebMCP implementation:
  // useWebMCP destructures `plugins: _plugins` out of config and does not include
  // it in `registrationInputs` or `descriptorKey` (which only tracks serialized metadata,
  // schema, preparation error, enabled, and explicit deps). During tool execution,
  // invocation plugins are read from the latest committed config ref via `getInvocationConfig`.
  // Therefore, useWebMCP does not re-register the tool on plugins referential changes (neither
  // shallow/deep nor strict reference comparison triggers registration).
  //
  // However, memoizing the plugin array ensures referential stability, avoids allocating
  // new plugin objects and arrays on every render (advancing #332's zero owner re-render
  // overhead goal), and protects against re-registration if downstream consumers or future
  // versions perform referential-equality checks.
  // Note: Callers are expected to pass a stable `def.consent` object reference (or memoize
  // dynamic consent metadata) across renders.
  const plugins = useMemo(() => [consent(broker, def.consent)], [broker, def.consent]);

  return useWebMCP({
    name: def.name,
    description: def.description,
    ...(def.inputSchema && { inputSchema: def.inputSchema }),
    ...(def.consent && { annotations: toMcpAnnotations(def.consent) }),
    ...(def.enabled !== undefined && { enabled: def.enabled }),
    plugins,
    execute: ((args: Args) => def.execute(args)) as any,
  });
}
