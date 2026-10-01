import type { JSONRPCMessage } from '@modelcontextprotocol/server';

/**
 * Channel discriminators. Both ends of a pair must agree or the envelope check in
 * `isMcpMessage` silently drops every message — no error, just a hang.
 */
export const DEFAULT_TAB_CHANNEL_ID = 'mcp-default';
export const DEFAULT_IFRAME_CHANNEL_ID = 'mcp-iframe';

type McpMessageDirection = 'client-to-server' | 'server-to-client';

interface McpMessageEnvelope {
  payload: unknown;
}

export function isMcpMessage(
  data: unknown,
  channelId: string,
  direction: McpMessageDirection
): data is McpMessageEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    'channel' in data &&
    data.channel === channelId &&
    'type' in data &&
    data.type === 'mcp' &&
    'direction' in data &&
    data.direction === direction &&
    'payload' in data
  );
}

export function postMcpMessage(
  target: Window,
  targetOrigin: string,
  channelId: string,
  direction: McpMessageDirection,
  payload: JSONRPCMessage | 'mcp-server-ready' | 'mcp-server-stopped' | 'mcp-check-ready'
): void {
  target.postMessage({ channel: channelId, type: 'mcp', direction, payload }, targetOrigin);
}
