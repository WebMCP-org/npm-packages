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
    Reflect.get(data, 'channel') === channelId &&
    Reflect.get(data, 'type') === 'mcp' &&
    Reflect.get(data, 'direction') === direction &&
    Reflect.has(data, 'payload')
  );
}

export function postMcpMessage(
  target: Window,
  targetOrigin: string,
  channelId: string,
  direction: McpMessageDirection,
  payload: unknown
): void {
  target.postMessage({ channel: channelId, type: 'mcp', direction, payload }, targetOrigin);
}
