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
  configureWorldInputSchema,
  cookieContracts,
  normalizeExtensionToolMeta,
  registerUserScriptsInputSchema,
  type ClearAlarmInput,
  type ClearAlarmOutput,
  type ContainsPermissionsOutput,
  type ExecuteScriptInput,
  type ExecuteScriptOutput,
  type GetAllCookiesOutput,
  type RuntimeGetManifestOutput,
  type SearchDownloadsInput,
  updateUserScriptsInputSchema,
  userScriptExecuteInputSchema,
  userScriptExecuteOutputSchema,
  userScriptContracts,
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

  it('keeps extension metadata machine-consumable with documented defaults', () => {
    const allowedFields = new Set([
      'actionId',
      'chromeApi',
      'groupId',
      'hostPermissions',
      'modelFacing',
      'permissions',
      'requiresActiveTab',
      'risk',
    ]);

    for (const [_group, contracts] of groups) {
      for (const contract of contracts) {
        const extension = contract._meta.extension;
        for (const field of Object.keys(extension)) {
          assert.ok(
            allowedFields.has(field),
            `${contract.name} has unexpected _meta field ${field}`
          );
        }

        const normalized = normalizeExtensionToolMeta(extension);
        assert.equal(typeof normalized.modelFacing, 'boolean', contract.name);
        assert.ok(['default', 'high'].includes(normalized.risk), contract.name);

        if (!('modelFacing' in extension))
          assert.equal(normalized.modelFacing, true, contract.name);
        if (!('risk' in extension)) assert.equal(normalized.risk, 'default', contract.name);
        if ('requiresActiveTab' in extension)
          assert.equal(extension.requiresActiveTab, true, contract.name);
      }
    }
  });

  it('does not overstate static host or activeTab requirements in metadata', () => {
    assert.equal(
      'hostPermissions' in cookieContracts.getAllCookieStores._meta.extension,
      false,
      'cookie store listing does not require static host permissions'
    );
    assert.equal(
      'requiresActiveTab' in userScriptContracts.register._meta.extension,
      false,
      'registering user scripts does not require an active tab at call time'
    );
    assert.equal(
      'requiresActiveTab' in userScriptContracts.update._meta.extension,
      false,
      'updating user scripts does not require an active tab at call time'
    );
    assert.equal(userScriptContracts.execute._meta.extension.requiresActiveTab, true);
  });

  it('infers representative handler input and output types from schemas', () => {
    assert.ok(true);
  });

  it('models current userScripts API validation constraints', () => {
    assert.equal(
      registerUserScriptsInputSchema.safeParse({
        scripts: [{ id: 'script-1', matches: ['*://example.com/*'] }],
      }).success,
      false,
      'register requires non-empty js sources'
    );

    assert.equal(
      registerUserScriptsInputSchema.safeParse({
        scripts: [
          {
            id: '_reserved',
            matches: ['*://example.com/*'],
            js: [{ code: '1' }],
          },
        ],
      }).success,
      false,
      'registered script IDs cannot start with underscore'
    );

    assert.equal(
      updateUserScriptsInputSchema.safeParse({
        scripts: [{ id: '_reserved' }],
      }).success,
      false,
      'updated script IDs cannot start with underscore'
    );

    assert.equal(
      configureWorldInputSchema.safeParse({ worldId: '_reserved' }).success,
      false,
      'world IDs cannot start with underscore'
    );

    assert.equal(
      userScriptExecuteInputSchema.safeParse({
        target: { tabId: 1, frameIds: [0], allFrames: true },
        js: [{ code: 'location.href' }],
      }).success,
      false,
      'allFrames cannot be combined with frameIds'
    );

    assert.equal(
      userScriptExecuteInputSchema.safeParse({
        target: { tabId: 1, frameIds: [0], documentIds: ['document'] },
        js: [{ code: 'location.href' }],
      }).success,
      false,
      'documentIds cannot be combined with frameIds'
    );

    assert.equal(
      userScriptExecuteInputSchema.safeParse({
        target: { tabId: 1 },
        js: [{ code: 'location.href' }],
        world: 'MAIN',
        worldId: 'world',
      }).success,
      false,
      'worldId cannot be combined with MAIN world'
    );

    assert.equal(
      userScriptExecuteOutputSchema.safeParse({
        injectionCount: 1,
        results: [{ frameId: 0 }],
      }).success,
      false,
      'userScripts injection results require documentId'
    );
  });
});
