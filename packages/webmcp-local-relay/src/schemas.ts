import { z } from 'zod';

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const BrowserToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: JsonRecordSchema.optional(),
  outputSchema: JsonRecordSchema.optional(),
  annotations: JsonRecordSchema.optional(),
});

export const BrowserHelloMessageSchema = z.object({
  type: z.literal('hello'),
  tabId: z.string().min(1),
  origin: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
});

export const BrowserToolsListMessageSchema = z.object({
  type: z.literal('tools/list'),
  tools: z.array(BrowserToolSchema),
});

export const BrowserToolsChangedMessageSchema = z.object({
  type: z.literal('tools/changed'),
  tools: z.array(BrowserToolSchema),
});

export const BrowserToolResultMessageSchema = z.object({
  type: z.literal('result'),
  callId: z.string().min(1),
  result: z.unknown(),
});

export const BrowserPongMessageSchema = z.object({
  type: z.literal('pong'),
});

export const BrowserToRelayMessageSchema = z.discriminatedUnion('type', [
  BrowserHelloMessageSchema,
  BrowserToolsListMessageSchema,
  BrowserToolsChangedMessageSchema,
  BrowserToolResultMessageSchema,
  BrowserPongMessageSchema,
]);

export type BrowserToRelayMessage = z.infer<typeof BrowserToRelayMessageSchema>;
export type BrowserTool = z.infer<typeof BrowserToolSchema>;
export type BrowserHelloMessage = z.infer<typeof BrowserHelloMessageSchema>;

export const RelayInvokeMessageSchema = z.object({
  type: z.literal('invoke'),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  args: JsonRecordSchema.optional(),
});

export const RelayPingMessageSchema = z.object({
  type: z.literal('ping'),
});

export const RelayToBrowserMessageSchema = z.discriminatedUnion('type', [
  RelayInvokeMessageSchema,
  RelayPingMessageSchema,
]);

export type RelayToBrowserMessage = z.infer<typeof RelayToBrowserMessageSchema>;
