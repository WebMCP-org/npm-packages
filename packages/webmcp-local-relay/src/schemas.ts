import { z } from 'zod';

/**
 * Generic JSON object schema used for tool schemas and arguments.
 */
const JsonRecordSchema = z.record(z.string(), z.unknown());

/**
 * Schema for a browser-published tool descriptor.
 */
export const BrowserToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: JsonRecordSchema.optional(),
  outputSchema: JsonRecordSchema.optional(),
  annotations: JsonRecordSchema.optional(),
});

/**
 * Schema for source identity bootstrap message.
 */
export const BrowserHelloMessageSchema = z.object({
  type: z.literal('hello'),
  tabId: z.string().min(1),
  origin: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
});

/**
 * Schema for full tool-list synchronization message.
 */
export const BrowserToolsListMessageSchema = z.object({
  type: z.literal('tools/list'),
  tools: z.array(BrowserToolSchema),
});

/**
 * Schema for tool-set replacement notification message.
 *
 * Semantically identical to `tools/list` — the full tool set replaces any
 * previously registered tools for the connection.
 */
export const BrowserToolsChangedMessageSchema = z.object({
  type: z.literal('tools/changed'),
  tools: z.array(BrowserToolSchema),
});

/**
 * Schema for invocation response payloads sent by browser sources.
 */
export const BrowserToolResultMessageSchema = z.object({
  type: z.literal('result'),
  callId: z.string().min(1),
  result: z.unknown(),
});

/**
 * Schema for browser heartbeat acknowledgement.
 */
export const BrowserPongMessageSchema = z.object({
  type: z.literal('pong'),
});

/**
 * Union schema for all browser-to-relay protocol messages.
 */
export const BrowserToRelayMessageSchema = z.discriminatedUnion('type', [
  BrowserHelloMessageSchema,
  BrowserToolsListMessageSchema,
  BrowserToolsChangedMessageSchema,
  BrowserToolResultMessageSchema,
  BrowserPongMessageSchema,
]);

/**
 * Browser-to-relay message payload.
 */
export type BrowserToRelayMessage = z.infer<typeof BrowserToRelayMessageSchema>;

/**
 * Browser-published tool descriptor.
 */
export type BrowserTool = z.infer<typeof BrowserToolSchema>;

/**
 * Browser source bootstrap message.
 */
export type BrowserHelloMessage = z.infer<typeof BrowserHelloMessageSchema>;

/**
 * Schema for relay invocation messages sent to browser sources.
 */
export const RelayInvokeMessageSchema = z.object({
  type: z.literal('invoke'),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  args: JsonRecordSchema.optional(),
});

/**
 * Schema for relay heartbeat messages sent to browser sources.
 */
export const RelayPingMessageSchema = z.object({
  type: z.literal('ping'),
});

/**
 * Union schema for all relay-to-browser protocol messages.
 */
export const RelayToBrowserMessageSchema = z.discriminatedUnion('type', [
  RelayInvokeMessageSchema,
  RelayPingMessageSchema,
]);

/**
 * Relay-to-browser message payload.
 */
export type RelayToBrowserMessage = z.infer<typeof RelayToBrowserMessageSchema>;
