import { normalizeToolResponse } from '@mcp-b/webmcp-ts-sdk/schema';
import type { RegisteredTool, WebMcpToolObjectInput } from '@mcp-b/webmcp-ts-sdk';
import type { CallToolResult } from '@modelcontextprotocol/server';
/**
 * Shared browser utilities for the relay embed and widget.
 *
 * These are bundled inline by tsdown into each IIFE — they are NOT
 * imported at runtime across files.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export const RELAY_BROWSER_PROTOCOL = 'webmcp.v1';
export const RELAY_DISCOVERY_PROTOCOL = 'webmcp-discovery.v1';
export const RELAY_PORT_RANGE_START = 9333;
export const RELAY_PORT_RANGE_END = 9348;
export const RELAY_ENDPOINT_CACHE_KEY = '__webmcp_relay_endpoint';

const INPUT_REQUIRED_UNSUPPORTED_MESSAGE =
  'The WebMCP local relay cannot forward MCP input_required results. Multi-round tool flows require direct McpServer registration.';
const warnedDuplicateToolNames = new Set<string>();

/**
 * Checks if a value is a plain JSON object (not null, not an array).
 */
export function isJsonObject(value: unknown): value is WebMcpToolObjectInput {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts an `executeTool()` result to an MCP result. Only a JSON object is
 * structured; any other result, including numbers, keeps its original text.
 */
export function normalizeSerializedToolResult(serialized: string): CallToolResult {
  let rawResult: unknown;
  try {
    rawResult = JSON.parse(serialized);
  } catch {
    // Native declarative tools return plain text for string responses.
  }

  if (!isJsonObject(rawResult)) {
    return normalizeToolResponse(typeof rawResult === 'string' ? rawResult : serialized);
  }

  if (rawResult.resultType === 'input_required') {
    return {
      isError: true,
      content: [{ type: 'text', text: INPUT_REQUIRED_UNSUPPORTED_MESSAGE }],
    };
  }

  return normalizeToolResponse(rawResult);
}

/**
 * Keeps one tool per name. `getTools()` also returns tools from other
 * same-origin frames; a tool registered by `page` wins a name collision.
 */
export function selectRelayTools(tools: RegisteredTool[], page: Window): RegisteredTool[] {
  const selected = new Map<string, RegisteredTool>();
  for (const tool of tools) {
    const kept = selected.get(tool.name);
    if (kept) {
      if (!warnedDuplicateToolNames.has(tool.name)) {
        warnedDuplicateToolNames.add(tool.name);
        console.warn(
          `[webmcp-relay-widget] More than one frame registered a tool named "${tool.name}". Only one is relayed, preferring the host page's own tool.`
        );
      }
      if (kept.window === page || tool.window !== page) continue;
    }
    selected.set(tool.name, tool);
  }
  return [...selected.values()];
}

/**
 * Checks if a hostname is a loopback address.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Normalizes user-controlled values before writing them to plain-text logs.
 */
export function sanitizeLogText(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export interface SendableSocket {
  readyState: number;
  send(data: string): void;
}

/**
 * Sends data through a WebSocket, catching errors from closed/closing states.
 */
export function safeSend(ws: SendableSocket, data: string): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  } catch (err) {
    console.warn('[webmcp-relay] Failed to send message:', err);
  }
}

/**
 * Builds a sessionStorage key scoped to the embedding host origin and selectors.
 */
export function buildRelayEndpointCacheKey(options: {
  hostOrigin: string;
  relayId?: string | null;
  workspace?: string | null;
}): string {
  const suffix = [options.hostOrigin, options.relayId ?? '', options.workspace ?? '']
    .map((value) => encodeURIComponent(value))
    .join(':');
  return `${RELAY_ENDPOINT_CACHE_KEY}:${suffix}`;
}
