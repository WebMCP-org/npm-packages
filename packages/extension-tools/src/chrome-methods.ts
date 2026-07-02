import type { CallToolResult } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';

import {
  BOOKMARK_TOOL_CONTRACTS,
  HISTORY_TOOL_CONTRACTS,
  STORAGE_TOOL_CONTRACTS,
  TAB_TOOL_CONTRACTS,
  USER_SCRIPTS_TOOL_CONTRACTS,
  type AnyExtensionToolContract,
} from './contracts';
import {
  createExecutableExtensionTools,
  type CreateExecutableExtensionToolsOptions,
  type ExecutableExtensionTool,
} from './executable-tools';

type ToolInput = Record<string, unknown>;

export interface ChromeMethodCall {
  path: string;
  args: unknown[];
}

export interface ChromeMethodContract {
  path: string;
  signature: string;
  description: string;
  action: AnyExtensionToolContract;
  argsSchema: z.ZodType<unknown[]>;
  toActionInput(args: unknown[]): ToolInput;
}

export interface ChromeApiExecutor {
  readonly methods: readonly ChromeMethodContract[];
  invoke(call: ChromeMethodCall): Promise<unknown>;
}

const noArgs = z.array(z.unknown()).length(0);
const zeroOrOneArg = z.array(z.unknown()).max(1);
const oneArg = z.array(z.unknown()).length(1);
const oneOrTwoArgs = z.array(z.unknown()).min(1).max(2);
const twoArgs = z.array(z.unknown()).length(2);

export const CHROME_METHOD_CONTRACTS = [
  chromeMethod({
    path: 'bookmarks.create',
    signature: 'chrome.bookmarks.create(bookmark)',
    action: BOOKMARK_TOOL_CONTRACTS.create,
    argsSchema: oneArg,
    toActionInput: ([createDetails]) => objectInput(createDetails),
  }),
  chromeMethod({
    path: 'bookmarks.get',
    signature: 'chrome.bookmarks.get(idOrIdList)',
    action: BOOKMARK_TOOL_CONTRACTS.get,
    argsSchema: oneArg,
    toActionInput: ([idOrIdList]) => ({ idOrIdList }),
  }),
  chromeMethod({
    path: 'bookmarks.getChildren',
    signature: 'chrome.bookmarks.getChildren(id)',
    action: BOOKMARK_TOOL_CONTRACTS.getChildren,
    argsSchema: oneArg,
    toActionInput: ([id]) => ({ id }),
  }),
  chromeMethod({
    path: 'bookmarks.getRecent',
    signature: 'chrome.bookmarks.getRecent(numberOfItems)',
    action: BOOKMARK_TOOL_CONTRACTS.getRecent,
    argsSchema: oneArg,
    toActionInput: ([numberOfItems]) => ({ numberOfItems }),
  }),
  chromeMethod({
    path: 'bookmarks.getSubTree',
    signature: 'chrome.bookmarks.getSubTree(id)',
    action: BOOKMARK_TOOL_CONTRACTS.getSubTree,
    argsSchema: oneArg,
    toActionInput: ([id]) => ({ id }),
  }),
  chromeMethod({
    path: 'bookmarks.getTree',
    signature: 'chrome.bookmarks.getTree()',
    action: BOOKMARK_TOOL_CONTRACTS.getTree,
    argsSchema: noArgs,
    toActionInput: () => ({}),
  }),
  chromeMethod({
    path: 'bookmarks.move',
    signature: 'chrome.bookmarks.move(id, destination)',
    action: BOOKMARK_TOOL_CONTRACTS.move,
    argsSchema: twoArgs,
    toActionInput: ([id, destination]) => ({ id, ...objectInput(destination) }),
  }),
  chromeMethod({
    path: 'bookmarks.remove',
    signature: 'chrome.bookmarks.remove(id)',
    action: BOOKMARK_TOOL_CONTRACTS.remove,
    argsSchema: oneArg,
    toActionInput: ([id]) => ({ id }),
  }),
  chromeMethod({
    path: 'bookmarks.removeTree',
    signature: 'chrome.bookmarks.removeTree(id)',
    action: BOOKMARK_TOOL_CONTRACTS.removeTree,
    argsSchema: oneArg,
    toActionInput: ([id]) => ({ id }),
  }),
  chromeMethod({
    path: 'bookmarks.search',
    signature: 'chrome.bookmarks.search(query)',
    action: BOOKMARK_TOOL_CONTRACTS.search,
    argsSchema: oneArg,
    toActionInput: ([query]) => ({ query }),
  }),
  chromeMethod({
    path: 'bookmarks.update',
    signature: 'chrome.bookmarks.update(id, changes)',
    action: BOOKMARK_TOOL_CONTRACTS.update,
    argsSchema: twoArgs,
    toActionInput: ([id, changes]) => ({ id, ...objectInput(changes) }),
  }),
  chromeMethod({
    path: 'history.addUrl',
    signature: 'chrome.history.addUrl(details)',
    action: HISTORY_TOOL_CONTRACTS.addUrl,
    argsSchema: oneArg,
    toActionInput: ([details]) => objectInput(details),
  }),
  chromeMethod({
    path: 'history.getVisits',
    signature: 'chrome.history.getVisits(details)',
    action: HISTORY_TOOL_CONTRACTS.getVisits,
    argsSchema: oneArg,
    toActionInput: ([details]) => objectInput(details),
  }),
  chromeMethod({
    path: 'history.search',
    signature: 'chrome.history.search(query)',
    action: HISTORY_TOOL_CONTRACTS.search,
    argsSchema: oneArg,
    toActionInput: ([query]) => objectInput(query),
  }),
  ...storageMethods('local'),
  ...storageMethods('session'),
  ...storageMethods('sync'),
  chromeMethod({
    path: 'tabs.create',
    signature: 'chrome.tabs.create(createProperties)',
    action: TAB_TOOL_CONTRACTS.createTab,
    argsSchema: oneArg,
    toActionInput: ([createProperties]) => objectInput(createProperties),
  }),
  chromeMethod({
    path: 'tabs.get',
    signature: 'chrome.tabs.get(tabId)',
    action: TAB_TOOL_CONTRACTS.getTab,
    argsSchema: oneArg,
    toActionInput: ([tabId]) => ({ tabId }),
  }),
  chromeMethod({
    path: 'tabs.query',
    signature: 'chrome.tabs.query(queryInfo)',
    action: TAB_TOOL_CONTRACTS.getAllTabs,
    argsSchema: zeroOrOneArg,
    toActionInput: ([queryInfo]) => objectInput(queryInfo),
  }),
  chromeMethod({
    path: 'tabs.remove',
    signature: 'chrome.tabs.remove(tabIds)',
    action: TAB_TOOL_CONTRACTS.closeTabs,
    argsSchema: oneArg,
    toActionInput: ([tabIds]) => ({ tabIds: normalizeNumberArray(tabIds) }),
  }),
  chromeMethod({
    path: 'tabs.update',
    signature: 'chrome.tabs.update(tabId?, updateProperties)',
    action: TAB_TOOL_CONTRACTS.updateTab,
    argsSchema: oneOrTwoArgs,
    toActionInput: ([tabIdOrProperties, updateProperties]) => {
      if (typeof tabIdOrProperties === 'number') {
        return { tabId: tabIdOrProperties, ...objectInput(updateProperties) };
      }
      return objectInput(tabIdOrProperties);
    },
  }),
  chromeMethod({
    path: 'userScripts.register',
    signature: 'chrome.userScripts.register(scripts)',
    action: USER_SCRIPTS_TOOL_CONTRACTS.register,
    argsSchema: oneArg,
    toActionInput: ([scripts]) => ({ scripts }),
  }),
  chromeMethod({
    path: 'userScripts.getScripts',
    signature: 'chrome.userScripts.getScripts(filter?)',
    action: USER_SCRIPTS_TOOL_CONTRACTS.getScripts,
    argsSchema: zeroOrOneArg,
    toActionInput: ([filter]) => objectInput(filter),
  }),
  chromeMethod({
    path: 'userScripts.update',
    signature: 'chrome.userScripts.update(scripts)',
    action: USER_SCRIPTS_TOOL_CONTRACTS.update,
    argsSchema: oneArg,
    toActionInput: ([scripts]) => ({ scripts }),
  }),
  chromeMethod({
    path: 'userScripts.unregister',
    signature: 'chrome.userScripts.unregister(filter?)',
    action: USER_SCRIPTS_TOOL_CONTRACTS.unregister,
    argsSchema: zeroOrOneArg,
    toActionInput: ([filter]) => objectInput(filter),
  }),
  chromeMethod({
    path: 'userScripts.execute',
    signature: 'chrome.userScripts.execute(injection)',
    action: USER_SCRIPTS_TOOL_CONTRACTS.execute,
    argsSchema: oneArg,
    toActionInput: ([injection]) => objectInput(injection),
  }),
] as const satisfies readonly ChromeMethodContract[];

export const CHROME_METHOD_CONTRACTS_BY_PATH = Object.fromEntries(
  CHROME_METHOD_CONTRACTS.map((contract) => [contract.path, contract])
) as Record<string, ChromeMethodContract | undefined>;

export function createChromeApiExecutor(
  options: CreateExecutableExtensionToolsOptions = {}
): ChromeApiExecutor {
  const toolsByName = new Map(
    createExecutableExtensionTools(options).map((tool) => [tool.name, tool])
  );

  return {
    methods: CHROME_METHOD_CONTRACTS,
    async invoke(call) {
      return invokeChromeMethod(call, toolsByName);
    },
  };
}

async function invokeChromeMethod(
  call: ChromeMethodCall,
  toolsByName: ReadonlyMap<string, ExecutableExtensionTool>
): Promise<unknown> {
  const method = CHROME_METHOD_CONTRACTS_BY_PATH[call.path];
  if (!method) {
    throw new Error(`chrome.${call.path} is not available in this run.`);
  }

  const tool = toolsByName.get(method.action.name);
  if (!tool) {
    throw new Error(
      `chrome.${call.path} is mapped to missing extension tool ${method.action.name}.`
    );
  }

  const args = parseChromeMethodArgs(method, call.args);
  const actionInput = toActionInput(method, args);
  const result = await tool.execute(actionInput);
  if (result.isError) {
    throw new Error(`chrome.${method.path}: ${toolResultText(result)}`);
  }

  return result.structuredContent;
}

function parseChromeMethodArgs(method: ChromeMethodContract, args: unknown[]): unknown[] {
  try {
    return method.argsSchema.parse(args);
  } catch (error) {
    throw new Error(`chrome.${method.path}: invalid arguments\n${errorMessage(error)}`);
  }
}

function toActionInput(method: ChromeMethodContract, args: unknown[]): ToolInput {
  try {
    return method.toActionInput(args);
  } catch (error) {
    throw new Error(`chrome.${method.path}: invalid arguments\n${errorMessage(error)}`);
  }
}

function chromeMethod(contract: Omit<ChromeMethodContract, 'description'>): ChromeMethodContract {
  return {
    ...contract,
    description: contract.action.description,
  };
}

function storageMethods(area: 'local' | 'session' | 'sync'): ChromeMethodContract[] {
  return [
    chromeMethod({
      path: `storage.${area}.clear`,
      signature: `chrome.storage.${area}.clear()`,
      action: STORAGE_TOOL_CONTRACTS.clearStorage,
      argsSchema: noArgs,
      toActionInput: () => ({ area, confirm: true }),
    }),
    chromeMethod({
      path: `storage.${area}.get`,
      signature: `chrome.storage.${area}.get(keys?)`,
      action: STORAGE_TOOL_CONTRACTS.getStorage,
      argsSchema: zeroOrOneArg,
      toActionInput: ([keys]) => ({ area, keys: keys ?? null }),
    }),
    chromeMethod({
      path: `storage.${area}.getBytesInUse`,
      signature: `chrome.storage.${area}.getBytesInUse(keys?)`,
      action: STORAGE_TOOL_CONTRACTS.getBytesInUse,
      argsSchema: zeroOrOneArg,
      toActionInput: ([keys]) => ({ area, keys: keys ?? null }),
    }),
    chromeMethod({
      path: `storage.${area}.remove`,
      signature: `chrome.storage.${area}.remove(keys)`,
      action: STORAGE_TOOL_CONTRACTS.removeStorage,
      argsSchema: oneArg,
      toActionInput: ([keys]) => ({ area, keys: normalizeStringArray(keys) }),
    }),
    chromeMethod({
      path: `storage.${area}.set`,
      signature: `chrome.storage.${area}.set(items)`,
      action: STORAGE_TOOL_CONTRACTS.setStorage,
      argsSchema: oneArg,
      toActionInput: ([data]) => ({ area, data: objectInput(data) }),
    }),
  ];
}

function objectInput(input: unknown): ToolInput {
  if (input === undefined || input === null) {
    return {};
  }
  if (isRecord(input)) {
    return input;
  }
  throw new Error('Expected an object argument.');
}

function normalizeStringArray(input: unknown): unknown {
  if (typeof input === 'string') {
    return [input];
  }
  return input;
}

function normalizeNumberArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [input];
}

function toolResultText(result: CallToolResult): string {
  const firstText = result.content.find(
    (content): content is { type: 'text'; text: string } =>
      content.type === 'text' && typeof content.text === 'string'
  );
  return firstText?.text ?? '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
