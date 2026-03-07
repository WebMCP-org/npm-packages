/**
 * Shared browser utilities for the relay embed and widget.
 *
 * These are bundled inline by tsdown into each IIFE — they are NOT
 * imported at runtime across files.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Checks if a value is a plain JSON object (not null, not an array).
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks if a hostname is a loopback address.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Creates a random request/tab ID using crypto.randomUUID with fallback.
 */
export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;
}

/**
 * Normalizes user-controlled values before writing them to plain-text logs.
 */
export function sanitizeLogText(value: unknown): string {
  return String(value).replace(/[\r\n]/g, '');
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
