import { z } from 'zod/v4';
import {
  CallToolResultSchema,
  InboundToolSchema,
  NormalizedToolSchema,
  normalizeInboundTool,
  RelayInvokeArgsSchema,
  type RelayTool,
} from './protocol.js';

function normalizeSupportedInboundTools(tools: z.infer<typeof InboundToolSchema>[]): RelayTool[] {
  return tools
    .map(normalizeInboundTool)
    .filter((tool) => tool.execution?.taskSupport !== 'required');
}

const BrowserHelloMessageSchema = z.object({
  type: z.literal('hello'),
  tabId: z.string().min(1),
  origin: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
});

const BrowserToolsListMessageSchema = z.object({
  type: z.literal('tools/list'),
  tools: z.array(InboundToolSchema).transform(normalizeSupportedInboundTools),
});

const BrowserToolsChangedMessageSchema = z.object({
  type: z.literal('tools/changed'),
  tools: z.array(InboundToolSchema).transform(normalizeSupportedInboundTools),
});

const BrowserToolResultMessageSchema = z.object({
  type: z.literal('result'),
  callId: z.string().min(1),
  result: z.unknown(),
});

const BrowserPongMessageSchema = z.object({
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
 * Shared relay identity used for discovery and attach verification.
 */
export const RelayDescriptorSchema = z.object({
  host: z.string().min(1),
  instanceId: z.string().min(1),
  label: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535),
  relayId: z.string().min(1).optional(),
  workspace: z.string().min(1).optional(),
});

/**
 * Relay identity used for discovery and attach verification.
 */
export type RelayDescriptor = z.infer<typeof RelayDescriptorSchema>;

/**
 * Schema for server hello messages sent immediately after WebSocket connect.
 */
export const ServerHelloMessageSchema = z.object({
  type: z.literal('server-hello'),
  service: z.literal('webmcp-local-relay'),
  version: z.literal(1),
  ...RelayDescriptorSchema.shape,
});

/**
 * Server hello payload.
 */
export type ServerHelloMessage = z.infer<typeof ServerHelloMessageSchema>;

/**
 * Schema for acceptance of a browser source hello message.
 */
export const RelayHelloAcceptedMessageSchema = z.object({
  type: z.literal('hello/accepted'),
});

/**
 * Acceptance payload for a browser source hello message.
 */
export type RelayHelloAcceptedMessage = z.infer<typeof RelayHelloAcceptedMessageSchema>;

/**
 * Schema for rejection of a browser source hello message.
 */
export const RelayHelloRejectedMessageSchema = z.object({
  type: z.literal('hello/rejected'),
  reason: z.string().min(1),
  message: z.string().min(1),
});

/**
 * Rejection payload for a browser source hello message.
 */
export type RelayHelloRejectedMessage = z.infer<typeof RelayHelloRejectedMessageSchema>;

const RelayInvokeMessageSchema = z.object({
  type: z.literal('invoke'),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  args: RelayInvokeArgsSchema,
});

const RelayCancelMessageSchema = z.object({
  type: z.literal('cancel'),
  callId: z.string().min(1),
});

const RelayPingMessageSchema = z.object({
  type: z.literal('ping'),
});

const RelayReloadMessageSchema = z.object({
  type: z.literal('reload'),
});

/**
 * Union schema for all relay-to-browser protocol messages.
 */
export const RelayToBrowserMessageSchema = z.discriminatedUnion('type', [
  ServerHelloMessageSchema,
  RelayHelloAcceptedMessageSchema,
  RelayHelloRejectedMessageSchema,
  RelayInvokeMessageSchema,
  RelayCancelMessageSchema,
  RelayPingMessageSchema,
  RelayReloadMessageSchema,
]);

/**
 * Relay-to-browser message payload.
 */
export type RelayToBrowserMessage = z.infer<typeof RelayToBrowserMessageSchema>;

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

const RelayClientHelloSchema = z.object({
  type: z.literal('relay/hello'),
});

const RelayClientListToolsSchema = z.object({
  type: z.literal('relay/list-tools'),
});

const RelayClientInvokeSchema = z.object({
  type: z.literal('relay/invoke'),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  args: RelayInvokeArgsSchema,
});

const RelayClientCancelSchema = z.object({
  type: z.literal('relay/cancel'),
  callId: z.string().min(1),
});

/**
 * Union schema for all relay-client-to-server messages.
 */
export const RelayClientToServerMessageSchema = z.discriminatedUnion('type', [
  RelayClientHelloSchema,
  RelayClientListToolsSchema,
  RelayClientInvokeSchema,
  RelayClientCancelSchema,
]);

/**
 * Relay client to server message payload.
 */
export type RelayClientToServerMessage = z.infer<typeof RelayClientToServerMessageSchema>;

const RelayToolsPayloadFields = {
  tools: z.array(NormalizedToolSchema),
  sources: z.array(RelaySourceInfoSchema),
  toolSourceMap: z.record(z.string(), z.array(z.string())),
};

const RelayServerToolsSchema = z.object({
  type: z.literal('relay/tools'),
  ...RelayToolsPayloadFields,
});

const RelayServerResultSchema = z.object({
  type: z.literal('relay/result'),
  callId: z.string().min(1),
  result: CallToolResultSchema,
});

const RelayServerToolsChangedSchema = z.object({
  type: z.literal('relay/tools-changed'),
  ...RelayToolsPayloadFields,
});

/**
 * Union schema for all relay-server-to-client messages.
 */
export const RelayServerToClientMessageSchema = z.discriminatedUnion('type', [
  ServerHelloMessageSchema,
  RelayServerToolsSchema,
  RelayServerResultSchema,
  RelayServerToolsChangedSchema,
]);

/**
 * Relay server to client message payload.
 */
export type RelayServerToClientMessage = z.infer<typeof RelayServerToClientMessageSchema>;
