'use client';

import { useMemo, useRef } from 'react';
import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import { consent, toMcpAnnotations, type ConsentMetadata } from '@mcp-b/webmcp-plugins/consent';
import { useWebMCP } from 'usewebmcp';
import { useConsentBroker } from './ConsentBrokerProvider.js';

/**
 * Dev-mode-only guard against the documented "callers must pass a stable
 * `def.consent` reference" contract below. `useWebMCP` doesn't re-register on
 * plugin identity changes, so a caller who passes a fresh object literal each
 * render silently keeps whatever consent policy was captured on the first
 * render — with no error, just a stale policy applied forever after. This
 * makes that failure mode visible instead of silent.
 */
function useWarnOnUnstableConsent(name: string, value: ConsentMetadata): void {
  const previous = useRef<{ ref: ConsentMetadata; serialized: string } | null>(null);

  if (process.env.NODE_ENV !== 'production') {
    const serialized = JSON.stringify(value);
    const prev = previous.current;
    if (prev && prev.ref !== value && prev.serialized === serialized) {
      // Different object identity, same contents: almost certainly an
      // unmemoized object literal, not a genuine content change.
      console.warn(
        `useGuardedWebMCP("${name}"): \`consent\` was passed as a new object ` +
          'reference with unchanged contents. useWebMCP will NOT re-register ' +
          'the tool or refresh the consent policy in this case, so the ' +
          'previous policy silently keeps being used. Memoize `consent` ' +
          '(e.g. with useMemo) or pass a stable module-level constant.'
      );
    }
    previous.current = { ref: value, serialized };
  }
}

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
  useWarnOnUnstableConsent(def.name, def.consent);

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
    ...(def.consent && { annotations: toMcpAnnotations(def.consent) }),
    ...(def.enabled !== undefined && { enabled: def.enabled }),
    plugins,
    execute: ((args: Args) => def.execute(args)) as unknown as UseWebMCPConfig['execute'],
  });
}
