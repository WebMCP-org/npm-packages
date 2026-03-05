import { z } from 'zod/v4';
import {
  CallToolResultSchema,
  InboundToolSchema,
  NormalizedToolSchema,
  normalizeInboundTool,
  RelayInvokeArgsSchema,
  type RelayTool,
} from './protocol.js';

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
 *
 * Inbound tools are permissively parsed then normalized to SDK Tool shape.
 */
export const BrowserToolsListMessageSchema = z.object({
  type: z.literal('tools/list'),
  tools: z
    .array(InboundToolSchema)
    .transform((tools): RelayTool[] => tools.map(normalizeInboundTool)),
});

/**
 * Schema for tool-set replacement notification pushed after initial registration.
 *
 * Processing is identical to `tools/list` — the full tool set replaces any
 * previously registered tools — but the distinct type signals a dynamic update
 * rather than an initial handshake.
 */
export const BrowserToolsChangedMessageSchema = z.object({
  type: z.literal('tools/changed'),
  tools: z
    .array(InboundToolSchema)
    .transform((tools): RelayTool[] => tools.map(normalizeInboundTool)),
});

/**
 * Schema for invocation response payloads sent by browser sources.
 *
 * `result` remains permissive and is normalized later to preserve runtime
 * behavior for malformed tool responses.
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
  args: RelayInvokeArgsSchema,
});

/**
 * Schema for relay heartbeat messages sent to browser sources.
 */
export const RelayPingMessageSchema = z.object({
  type: z.literal('ping'),
});

/**
 * Schema for relay reload messages sent to browser sources.
 */
export const RelayReloadMessageSchema = z.object({
  type: z.literal('reload'),
});

/**
 * Union schema for all relay-to-browser protocol messages.
 */
export const RelayToBrowserMessageSchema = z.discriminatedUnion('type', [
  RelayInvokeMessageSchema,
  RelayPingMessageSchema,
  RelayReloadMessageSchema,
]);

/**
 * Relay-to-browser message payload.
 */
export type RelayToBrowserMessage = z.infer<typeof RelayToBrowserMessageSchema>;

/**
 * Relay-to-relay protocol (client mode <-> server mode).
 */

/**
 * Schema for source metadata transmitted in relay-to-relay messages.
 */
export const RelaySourceInfoSchema = z.object({
  sourceId: z.string(),
  tabId: z.string(),
  origin: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
  connectedAt: z.number(),
  lastSeenAt: z.number(),
  toolCount: z.number(),
});

/**
 * Source metadata transmitted in relay-to-relay messages.
 */
export type RelaySourceInfo = z.infer<typeof RelaySourceInfoSchema>;

/**
 * Schema for relay client identification message.
 */
export const RelayClientHelloSchema = z.object({
  type: z.literal('relay/hello'),
});

/**
 * Schema for relay client tool list request.
 */
export const RelayClientListToolsSchema = z.object({
  type: z.literal('relay/list-tools'),
});

/**
 * Schema for relay client tool invocation request.
 */
export const RelayClientInvokeSchema = z.object({
  type: z.literal('relay/invoke'),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  args: RelayInvokeArgsSchema,
});

/**
 * Union schema for all relay-client-to-server messages.
 */
export const RelayClientToServerMessageSchema = z.discriminatedUnion('type', [
  RelayClientHelloSchema,
  RelayClientListToolsSchema,
  RelayClientInvokeSchema,
]);

/**
 * Relay client to server message payload.
 */
export type RelayClientToServerMessage = z.infer<typeof RelayClientToServerMessageSchema>;

const RelayToolsPayloadFields = {
  tools: z.array(NormalizedToolSchema),
  sources: z.array(RelaySourceInfoSchema).optional().default([]),
  toolSourceMap: z.record(z.string(), z.array(z.string())).optional().default({}),
};

/**
 * Schema for relay server tool list response.
 */
export const RelayServerToolsSchema = z.object({
  type: z.literal('relay/tools'),
  ...RelayToolsPayloadFields,
});

/**
 * Schema for relay server invocation result response.
 */
export const RelayServerResultSchema = z.object({
  type: z.literal('relay/result'),
  callId: z.string().min(1),
  result: CallToolResultSchema,
});

/**
 * Schema for relay server push notification when tools change.
 */
export const RelayServerToolsChangedSchema = z.object({
  type: z.literal('relay/tools-changed'),
  ...RelayToolsPayloadFields,
});

/**
 * Union schema for all relay-server-to-client messages.
 */
export const RelayServerToClientMessageSchema = z.discriminatedUnion('type', [
  RelayServerToolsSchema,
  RelayServerResultSchema,
  RelayServerToolsChangedSchema,
]);

/**
 * Relay server to client message payload.
 */
export type RelayServerToClientMessage = z.infer<typeof RelayServerToClientMessageSchema>;
