import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';

import { zodSchemaToJsonSchemaCompat } from '../zod-json-schema-compat.js';
import {
  alarmsContracts,
  cookiesContracts,
  downloadsContracts,
  permissionsContracts,
  runtimeContractList,
  scriptingContractList,
  userScriptsContracts,
  type ClearAlarmInput,
  type ClearAlarmOutput,
  type ContainsPermissionsOutput,
  type ExecuteScriptInput,
  type ExecuteScriptOutput,
  type GetAllCookiesOutput,
  type RuntimeGetManifestOutput,
  type SearchDownloadsInput,
  type UserScriptExecuteOutput,
} from './index.ts';

type IsAssignable<T, U> = T extends U ? true : false;
type Assert<T extends true> = T;
type _ClearAlarmInput = Assert<IsAssignable<ClearAlarmInput, { name?: string }>>;
type _ClearAlarmOutput = Assert<IsAssignable<ClearAlarmOutput, { name: string; cleared: boolean }>>;
type _ExecuteScriptInput = Assert<
  IsAssignable<ExecuteScriptInput, { code: string; tabId?: number }>
>;
type _ExecuteScriptOutput = Assert<IsAssignable<ExecuteScriptOutput, { injectionCount: number }>>;
type _SearchDownloadsInput = Assert<
  IsAssignable<SearchDownloadsInput, { id?: number; limit?: number }>
>;
type _GetAllCookiesOutput = Assert<
  IsAssignable<GetAllCookiesOutput, { count: number; cookies: unknown[] }>
>;
type _RuntimeManifestOutput = Assert<
  IsAssignable<RuntimeGetManifestOutput, { name: string; permissions: string[] }>
>;
type _ContainsPermissionsOutput = Assert<
  IsAssignable<ContainsPermissionsOutput, { hasPermissions: boolean }>
>;
type _UserScriptExecuteOutput = Assert<
  IsAssignable<UserScriptExecuteOutput, { injectionCount: number }>
>;

const groups = [
  ['alarms', alarmsContracts],
  ['cookies', cookiesContracts],
  ['downloads', downloadsContracts],
  ['permissions', permissionsContracts],
  ['runtime', runtimeContractList],
  ['scripting', scriptingContractList],
  ['userScripts', userScriptsContracts],
] as const;

describe('raw Chrome API contracts', () => {
  it('can be imported without chrome globals', async () => {
    const originalChrome = Reflect.get(globalThis, 'chrome');
    Reflect.deleteProperty(globalThis, 'chrome');
    await import('./index.js');
    assert.equal(Reflect.get(globalThis, 'chrome'), undefined);
    if (originalChrome !== undefined) Reflect.set(globalThis, 'chrome', originalChrome);
  });

  it('exports valid MCP tool descriptors with object-root schemas', () => {
    for (const [_group, contracts] of groups) {
      for (const contract of contracts) {
        const descriptor = {
          ...contract,
          inputSchema: zodSchemaToJsonSchemaCompat(contract.inputSchema),
          outputSchema: contract.outputSchema
            ? zodSchemaToJsonSchemaCompat(contract.outputSchema)
            : undefined,
        };

        assert.doesNotThrow(() => ToolSchema.parse(descriptor), contract.name);
        assert.equal(descriptor.inputSchema.type, 'object', contract.name);
        if (descriptor.outputSchema)
          assert.equal(descriptor.outputSchema.type, 'object', contract.name);
        assert.ok(contract.annotations, contract.name);

        const extension = contract._meta.extension;
        assert.ok(extension.groupId, contract.name);
        assert.ok(extension.actionId, contract.name);
        assert.match(extension.chromeApi, /^chrome\./, contract.name);
        assert.equal(Array.isArray(extension.permissions), true, contract.name);
        for (const field of ['actionId', 'chromeApi', 'groupId', 'permissions']) {
          assert.ok(field in extension, `${contract.name} missing ${field}`);
        }
      }
    }
  });

  it('keeps permissions escalations non-default in metadata', () => {
    for (const contract of permissionsContracts) {
      const extension = contract._meta.extension;
      if (
        ['request', 'remove', 'addHostAccessRequest', 'removeHostAccessRequest'].includes(
          extension.actionId
        )
      ) {
        assert.equal(extension.modelFacing, false, contract.name);
        assert.equal(extension.risk, 'high', contract.name);
      }
    }
  });

  it('infers representative handler input and output types from schemas', () => {
    assert.ok(true);
  });
});
