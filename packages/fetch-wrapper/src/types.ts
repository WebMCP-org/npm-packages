export type HttpBodyType = 'none' | 'json' | 'text' | 'formData' | 'urlEncoded' | 'base64';

export type SerializedFormDataEntry = {
  name: string;
  value: string;
  encoding: 'text' | 'base64';
  filename?: string;
  contentType?: string;
};

export interface HttpRequestPayload {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  bodyType?: HttpBodyType;
  redirect?: RequestRedirect;
  cache?: RequestCache;
  credentials?: RequestCredentials;
  timeoutMs?: number;
}

export interface HttpResponsePayload {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body?: unknown;
  bodyType?: HttpBodyType;
  url?: string;
  redirected?: boolean;
  ok?: boolean;
}

export interface HttpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: HttpResponsePayload;
  isError?: boolean;
}

export type HttpRequestHandler = (
  request: HttpRequestPayload
) => Promise<HttpResponsePayload> | HttpResponsePayload;

export interface McpFetchOptions {
  toolName?: string;
  baseFetch?: typeof fetch;
  shouldHandle?: (input: RequestInfo | URL, init?: RequestInit) => boolean;
  timeoutMs?: number;
}

export interface McpFetchClient {
  callTool: (
    request: { name: string; arguments?: Record<string, unknown> },
    options?: unknown,
    requestOptions?: { signal?: AbortSignal }
  ) => Promise<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
  }>;
}
