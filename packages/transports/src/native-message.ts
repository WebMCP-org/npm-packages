import type { JSONRPCMessage } from '@mcp-b/webmcp-ts-sdk';

const HEADER_SEPARATOR = '\r\n\r\n';
const CONTENT_LENGTH_HEADER = 'content-length:';

export function serializeMessage(message: JSONRPCMessage): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}${HEADER_SEPARATOR}${body}`;
}

export class ReadBuffer {
  private _buffer = Buffer.alloc(0);

  append(chunk: Buffer | Uint8Array | string): void {
    const nextChunk =
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);

    this._buffer = Buffer.concat([this._buffer, nextChunk]);
  }

  readMessage(): JSONRPCMessage | null {
    const headerEnd = this._buffer.indexOf(HEADER_SEPARATOR);
    if (headerEnd === -1) {
      return null;
    }

    const header = this._buffer.subarray(0, headerEnd).toString('utf8');
    const lengthLine = header
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith(CONTENT_LENGTH_HEADER));

    if (!lengthLine) {
      throw new Error('Missing Content-Length header');
    }

    const contentLength = Number.parseInt(
      lengthLine.slice(CONTENT_LENGTH_HEADER.length).trim(),
      10
    );
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new Error(`Invalid Content-Length header: ${lengthLine}`);
    }

    const bodyStart = headerEnd + HEADER_SEPARATOR.length;
    const bodyEnd = bodyStart + contentLength;
    if (this._buffer.length < bodyEnd) {
      return null;
    }

    const body = this._buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    this._buffer = this._buffer.subarray(bodyEnd);

    return JSON.parse(body) as JSONRPCMessage;
  }

  clear(): void {
    this._buffer = Buffer.alloc(0);
  }
}
