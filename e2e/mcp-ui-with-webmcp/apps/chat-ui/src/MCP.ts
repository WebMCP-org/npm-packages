import { Client, type ClientOptions } from '@modelcontextprotocol/sdk/client';
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

export const createClient = (
  clientConfig: {
    _clientInfo: Implementation;
    options?: ClientOptions;
  },
  transportConfig: {
    url: URL;
    opts?: StreamableHTTPClientTransportOptions;
  }
) => {
  const client = new Client(clientConfig._clientInfo, clientConfig.options);

  const transport = new StreamableHTTPClientTransport(transportConfig.url, transportConfig.opts);

  return { client, transport };
};
