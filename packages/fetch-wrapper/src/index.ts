import type {
  HttpBodyType,
  HttpRequestHandler,
  HttpRequestPayload,
  HttpResponsePayload,
  HttpToolResult,
  McpFetchClient,
  McpFetchOptions,
  SerializedFormDataEntry,
} from './types.js';

export type {
  HttpBodyType,
  HttpRequestHandler,
  HttpRequestPayload,
  HttpResponsePayload,
  HttpToolResult,
  McpFetchClient,
  McpFetchOptions,
  SerializedFormDataEntry,
} from './types.js';

const DEFAULT_TOOL_NAME = 'http_request';

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);
const DEFAULT_RESPONSE_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
};

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('Base64 encoding is not available in this environment.');
  }
  return globalThis.btoa(binary);
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is not available in this environment.');
  }
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const normalized: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

async function serializeFormData(formData: FormData): Promise<SerializedFormDataEntry[]> {
  const entries: SerializedFormDataEntry[] = [];

  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') {
      entries.push({ name, value, encoding: 'text' });
      continue;
    }

    const bytes = new Uint8Array(await value.arrayBuffer());
    entries.push({
      name,
      value: encodeBase64(bytes),
      encoding: 'base64',
      filename: value.name,
      contentType: value.type || undefined,
    });
  }

  return entries;
}

async function serializeBody(request: Request): Promise<{
  body?: unknown;
  bodyType?: HttpBodyType;
}> {
  if (BODYLESS_METHODS.has(request.method.toUpperCase())) {
    return { bodyType: 'none' };
  }

  if (!request.body) {
    return { bodyType: 'none' };
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const clone = request.clone();

  if (contentType.includes('application/json')) {
    try {
      const json = await clone.json();
      return { body: json, bodyType: 'json' };
    } catch {
      const text = await clone.text();
      return { body: text, bodyType: 'text' };
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return { body: await clone.text(), bodyType: 'urlEncoded' };
  }

  if (contentType.includes('multipart/form-data')) {
    const formData = await clone.formData();
    return { body: await serializeFormData(formData), bodyType: 'formData' };
  }

  if (contentType.startsWith('text/')) {
    return { body: await clone.text(), bodyType: 'text' };
  }

  const arrayBuffer = await clone.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length === 0) {
    return { bodyType: 'none' };
  }
  return { body: encodeBase64(bytes), bodyType: 'base64' };
}

async function buildRequestPayload(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number
): Promise<HttpRequestPayload> {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init);

  const headers = normalizeHeaders(request.headers) ?? normalizeHeaders(init?.headers);
  const body = await serializeBody(request);

  return {
    method: request.method,
    url: request.url,
    headers,
    redirect: request.redirect,
    cache: request.cache,
    credentials: request.credentials,
    timeoutMs,
    ...body,
  };
}

function extractResponsePayload(result: {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): HttpResponsePayload {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as HttpResponsePayload;
  }

  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (!text) {
    throw new Error('http_request response missing structuredContent and text payload');
  }

  try {
    return JSON.parse(text) as HttpResponsePayload;
  } catch {
    throw new Error('http_request response text payload is not valid JSON');
  }
}

function deserializeFormData(entries: SerializedFormDataEntry[]): FormData {
  const formData = new FormData();
  for (const entry of entries) {
    if (entry.encoding === 'text') {
      formData.append(entry.name, entry.value);
    } else {
      const bytes = decodeBase64(entry.value);
      const blob = new Blob([bytes], { type: entry.contentType || undefined });
      if (entry.filename) {
        formData.append(entry.name, blob, entry.filename);
      } else {
        formData.append(entry.name, blob);
      }
    }
  }
  return formData;
}

function buildResponseBody(payload: HttpResponsePayload): BodyInit | null {
  const bodyType = payload.bodyType ?? 'none';
  const body = payload.body;

  if (bodyType === 'none') {
    return null;
  }

  if (bodyType === 'json') {
    return JSON.stringify(body ?? null);
  }

  if (bodyType === 'urlEncoded') {
    return typeof body === 'string' ? body : String(body ?? '');
  }

  if (bodyType === 'text') {
    return typeof body === 'string' ? body : String(body ?? '');
  }

  if (bodyType === 'base64') {
    if (typeof body !== 'string') {
      throw new Error('Expected base64 string response body');
    }
    return decodeBase64(body);
  }

  if (bodyType === 'formData') {
    if (!Array.isArray(body)) {
      throw new Error('Expected formData array response body');
    }
    return deserializeFormData(body as SerializedFormDataEntry[]);
  }

  return null;
}

function buildFetchResponse(payload: HttpResponsePayload): Response {
  const headers = new Headers(payload.headers ?? {});
  const body = buildResponseBody(payload);

  return new Response(body, {
    status: payload.status,
    statusText: payload.statusText,
    headers,
  });
}

function resolveSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (input instanceof Request) return input.signal;
  return undefined;
}

export function createHttpResponse(
  body: unknown,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    bodyType?: HttpBodyType;
    url?: string;
    redirected?: boolean;
  } = {}
): HttpResponsePayload {
  const status = init.status ?? 200;
  const bodyType = init.bodyType ?? (body === undefined ? 'none' : 'json');
  return {
    status,
    statusText: init.statusText,
    headers: { ...DEFAULT_RESPONSE_HEADERS, ...(init.headers ?? {}) },
    body,
    bodyType,
    url: init.url,
    redirected: init.redirected,
    ok: status >= 200 && status < 300,
  };
}

export function createHttpRequestTool(
  handler: HttpRequestHandler
): (args: HttpRequestPayload) => Promise<HttpToolResult> {
  return async (args: HttpRequestPayload): Promise<HttpToolResult> => {
    const response = await handler(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
      structuredContent: response,
      isError: response.status >= 400,
    };
  };
}

export function createMcpFetch(
  client: McpFetchClient,
  options: McpFetchOptions = {}
): typeof fetch {
  const toolName = options.toolName ?? DEFAULT_TOOL_NAME;
  const baseFetch = options.baseFetch ?? globalThis.fetch;

  if (!baseFetch) {
    throw new Error('Global fetch is not available. Provide a baseFetch option.');
  }

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const shouldHandle = options.shouldHandle?.(input, init) ?? true;
    if (!shouldHandle) {
      return baseFetch(input, init);
    }

    const payload = await buildRequestPayload(input, init, options.timeoutMs);
    const signal = resolveSignal(input, init);

    const result = await client.callTool(
      { name: toolName, arguments: payload as Record<string, unknown> },
      undefined,
      signal ? { signal } : undefined
    );

    const responsePayload = extractResponsePayload(result);
    return buildFetchResponse(responsePayload);
  };
}

export function initMcpFetch(client: McpFetchClient, options: McpFetchOptions = {}): () => void {
  const baseFetch = options.baseFetch ?? globalThis.fetch;

  if (!baseFetch) {
    throw new Error('Global fetch is not available. Provide a baseFetch option.');
  }

  const mcpFetch = createMcpFetch(client, { ...options, baseFetch });
  globalThis.fetch = mcpFetch;

  return () => {
    globalThis.fetch = baseFetch;
  };
}
