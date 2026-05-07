import { ListToolsResultSchema } from '@mcp-b/webmcp-ts-sdk';
import { describe, expect, it } from 'vitest';

import {
  EXTENSION_TOOLS_META_KEY,
  EXTENSION_TOOL_CONTRACTS,
  EXTENSION_TOOL_CONTRACTS_BY_NAME,
  EXTENSION_TOOL_GROUP_CONTRACTS,
  EXTENSION_TOOL_GROUP_CONTRACTS_BY_ID,
} from './contracts';
import { STORAGE_TOOL_CONTRACTS } from './contracts/storage';

function toMcpTool(contract: (typeof EXTENSION_TOOL_CONTRACTS)[number]) {
  return {
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    ...(contract.outputSchema ? { outputSchema: contract.outputSchema } : {}),
    annotations: contract.annotations,
    _meta: contract._meta,
  };
}

describe('extension tool contracts', () => {
  it('exports MCP-valid tool descriptors for the direct action catalog', () => {
    expect(() =>
      ListToolsResultSchema.parse({
        tools: EXTENSION_TOOL_CONTRACTS.map(toMcpTool),
      })
    ).not.toThrow();
  });

  it('keeps contract-only imports independent of extension globals', () => {
    expect(EXTENSION_TOOL_CONTRACTS.length).toBeGreaterThan(0);
    expect(EXTENSION_TOOL_GROUP_CONTRACTS.length).toBeGreaterThan(0);
  });

  it('exports unique stable names and catalog maps', () => {
    const names = EXTENSION_TOOL_CONTRACTS.map((contract) => contract.name);

    expect(new Set(names).size).toBe(names.length);
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      expect(EXTENSION_TOOL_CONTRACTS_BY_NAME[contract.name]).toBe(contract);
    }
    for (const group of EXTENSION_TOOL_GROUP_CONTRACTS) {
      expect(EXTENSION_TOOL_GROUP_CONTRACTS_BY_ID[group.id]).toBe(group);
    }
  });

  it('uses object-root JSON Schemas and declares complete MCP annotations', () => {
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      expect(contract.inputSchema.type).toBe('object');
      expect(contract.inputSchema).toHaveProperty('properties');

      if (contract.outputSchema) {
        expect(contract.outputSchema.type).toBe('object');
      }

      expect(contract.annotations).toMatchObject({
        title: contract.title,
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it('uses sampled concrete output schemas for real-browser storage conformance tools', () => {
    expect(STORAGE_TOOL_CONTRACTS.getStorage.outputSchema).toMatchObject({
      type: 'object',
      required: ['area', 'data', 'keyCount'],
      properties: {
        area: { enum: ['sync', 'local', 'session'] },
        data: { type: 'object' },
        keyCount: { type: 'number' },
      },
    });
    expect(STORAGE_TOOL_CONTRACTS.setStorage.outputSchema).toMatchObject({
      type: 'object',
      required: ['keys'],
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
  });

  it('carries namespaced MCP-B and Chrome extension metadata for each action', () => {
    for (const contract of EXTENSION_TOOL_CONTRACTS) {
      expect(contract.name).toMatch(/^extension_tool_/);
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(0);
      expect(contract.groupId.length).toBeGreaterThan(0);
      expect(contract.actionId.length).toBeGreaterThan(0);

      const meta = contract._meta[EXTENSION_TOOLS_META_KEY];
      expect(meta).toMatchObject({
        packageName: '@mcp-b/extension-tools',
        versionFamily: expect.any(String),
        kind: expect.any(String),
        groupId: contract.groupId,
        actionId: contract.actionId,
        chromeApi: expect.any(String),
        requiredPermissions: expect.any(Array),
        optionalPermissions: expect.any(Array),
        manifestVersion: 3,
        runtimeContext: expect.any(Array),
        hostPermissionsRequired: expect.any(Boolean),
        activeTabRequired: expect.any(Boolean),
        tabIdRequired: expect.any(Boolean),
        frameIdSupported: expect.any(Boolean),
        originRequired: expect.any(Boolean),
        urlRequired: expect.any(Boolean),
        userGestureRequired: expect.any(Boolean),
        effect: expect.stringMatching(/^(delete|execute|mutate|navigate|read)$/),
        riskLevel: expect.stringMatching(/^(low|medium|high)$/),
      });
    }
  });
});
