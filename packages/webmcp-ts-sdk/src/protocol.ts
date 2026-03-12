import { JSONRPCMessageSchema as SDKJSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ZodType } from 'zod';
import type { JSONRPCMessage } from './public-types.js';

export const JSONRPCMessageSchema = SDKJSONRPCMessageSchema as unknown as ZodType<JSONRPCMessage>;

export type { JSONRPCMessage, Transport, TransportSendOptions } from './public-types.js';
