import type { Server as McpServer } from '@mcp-b/webmcp-ts-sdk';
import { describe, expect, it } from 'vitest';
import {
  requireCreateMessageCapability,
  requireElicitInputCapability,
} from './tab-server-capabilities.js';
import type {
  ElicitationParams,
  ElicitationResult,
  SamplingRequestParams,
  SamplingResult,
} from './types.js';

interface CapabilityHost {
  marker: string;
  createMessage?: (params: SamplingRequestParams) => Promise<SamplingResult>;
  elicitInput?: (params: ElicitationParams) => Promise<ElicitationResult>;
}

function toServer(capabilities: CapabilityHost): McpServer {
  return { server: capabilities } as unknown as McpServer;
}

describe('tab-server capability requirements', () => {
  it('binds createMessage capability to its owning object', async () => {
    const capabilities: CapabilityHost = {
      marker: 'bound-create',
      createMessage(this: CapabilityHost, params) {
        void params;
        return Promise.resolve({
          model: 'test-model',
          role: 'assistant',
          content: { type: 'text', text: this.marker },
        });
      },
    };

    const createMessage = requireCreateMessageCapability(toServer(capabilities));

    await expect(
      createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
        maxTokens: 16,
      })
    ).resolves.toMatchObject({ content: { text: 'bound-create' } });
  });

  it('binds elicitInput capability to its owning object', async () => {
    const capabilities: CapabilityHost = {
      marker: 'bound-elicit',
      elicitInput(this: CapabilityHost, params) {
        void params;
        return Promise.resolve({
          action: 'accept',
          content: { answer: this.marker },
        });
      },
    };

    const elicitInput = requireElicitInputCapability(toServer(capabilities));

    await expect(
      elicitInput({
        message: 'Need input',
        requestedSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      })
    ).resolves.toEqual({
      action: 'accept',
      content: { answer: 'bound-elicit' },
    });
  });

  it('throws explicit errors when capabilities are unavailable', () => {
    const serverWithoutCapabilities = toServer({ marker: 'none' });

    expect(() => requireCreateMessageCapability(serverWithoutCapabilities)).toThrow(
      /sampling is not supported/i
    );
    expect(() => requireElicitInputCapability(serverWithoutCapabilities)).toThrow(
      /elicitation is not supported/i
    );
  });
});
