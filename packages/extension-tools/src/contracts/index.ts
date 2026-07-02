export * from './bookmarks';
export * from './core';
export * from './history';
export * from './storage';
export * from './tab-groups';
export * from './tabs';
export * from './windows';

import {
  BOOKMARKS_GROUP_CONTRACT,
  BOOKMARK_TOOL_CONTRACTS,
  type BookmarkToolName,
} from './bookmarks';
import type { AnyExtensionToolContract } from './core';
import { HISTORY_GROUP_CONTRACT, HISTORY_TOOL_CONTRACTS, type HistoryToolName } from './history';
import { STORAGE_GROUP_CONTRACT, STORAGE_TOOL_CONTRACTS, type StorageToolName } from './storage';
import {
  TAB_GROUPS_GROUP_CONTRACT,
  TAB_GROUP_TOOL_CONTRACTS,
  type TabGroupToolName,
} from './tab-groups';
import { TABS_GROUP_CONTRACT, TAB_TOOL_CONTRACTS, type TabToolName } from './tabs';
import { WINDOWS_GROUP_CONTRACT, WINDOW_TOOL_CONTRACTS, type WindowToolName } from './windows';

export const EXTENSION_TOOL_GROUP_CONTRACTS = [
  BOOKMARKS_GROUP_CONTRACT,
  HISTORY_GROUP_CONTRACT,
  STORAGE_GROUP_CONTRACT,
  TAB_GROUPS_GROUP_CONTRACT,
  TABS_GROUP_CONTRACT,
  WINDOWS_GROUP_CONTRACT,
] as const;

export const EXTENSION_TOOL_CONTRACT_GROUPS = {
  bookmarks: BOOKMARK_TOOL_CONTRACTS,
  history: HISTORY_TOOL_CONTRACTS,
  storage: STORAGE_TOOL_CONTRACTS,
  tabGroups: TAB_GROUP_TOOL_CONTRACTS,
  tabs: TAB_TOOL_CONTRACTS,
  windows: WINDOW_TOOL_CONTRACTS,
} as const;

export const EXTENSION_TOOL_CONTRACTS = [
  ...Object.values(BOOKMARK_TOOL_CONTRACTS),
  ...Object.values(HISTORY_TOOL_CONTRACTS),
  ...Object.values(STORAGE_TOOL_CONTRACTS),
  ...Object.values(TAB_GROUP_TOOL_CONTRACTS),
  ...Object.values(TAB_TOOL_CONTRACTS),
  ...Object.values(WINDOW_TOOL_CONTRACTS),
] as const;

export const EXTENSION_ACTION_CONTRACTS = EXTENSION_TOOL_CONTRACTS;

export type ExtensionToolName =
  | BookmarkToolName
  | HistoryToolName
  | StorageToolName
  | TabGroupToolName
  | TabToolName
  | WindowToolName;
export type ExtensionToolGroupId = (typeof EXTENSION_TOOL_GROUP_CONTRACTS)[number]['id'];
export type ExtensionToolActionId = (typeof EXTENSION_TOOL_CONTRACTS)[number]['actionId'];
type ExtensionToolContractEntry = (typeof EXTENSION_TOOL_CONTRACTS)[number];
export type ExtensionToolGroupActionKey<
  TContract extends ExtensionToolContractEntry = ExtensionToolContractEntry,
> = TContract extends {
  groupId: infer TGroupId extends string;
  actionId: infer TActionId extends string;
}
  ? `${TGroupId}.${TActionId}`
  : never;

export const EXTENSION_TOOL_CONTRACTS_BY_NAME = Object.fromEntries(
  EXTENSION_TOOL_CONTRACTS.map((contract) => [contract.name, contract])
) as {
  readonly [TName in ExtensionToolName]: Extract<
    (typeof EXTENSION_TOOL_CONTRACTS)[number],
    { name: TName }
  >;
};

export const EXTENSION_TOOL_GROUP_CONTRACTS_BY_ID = Object.fromEntries(
  EXTENSION_TOOL_GROUP_CONTRACTS.map((group) => [group.id, group])
) as {
  readonly [TGroupId in ExtensionToolGroupId]: Extract<
    (typeof EXTENSION_TOOL_GROUP_CONTRACTS)[number],
    { id: TGroupId }
  >;
};

export const EXTENSION_ACTION_CONTRACTS_BY_GROUP_ACTION_ID = Object.fromEntries(
  EXTENSION_TOOL_CONTRACTS.map((contract) => [
    `${contract.groupId}.${contract.actionId}` as ExtensionToolGroupActionKey<typeof contract>,
    contract,
  ])
) as {
  readonly [TKey in ExtensionToolGroupActionKey]: Extract<
    (typeof EXTENSION_TOOL_CONTRACTS)[number],
    AnyExtensionToolContract
  >;
};
