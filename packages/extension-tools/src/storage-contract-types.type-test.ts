import type {
  ExtensionToolHandler,
  InferExtensionToolInput,
  InferExtensionToolOutput,
} from './contracts/core';
import {
  BOOKMARK_TOOL_CONTRACTS,
  type BookmarkCreateInput,
  type BookmarkCreateOutput,
} from './contracts/bookmarks';
import {
  HISTORY_TOOL_CONTRACTS,
  type HistorySearchInput,
  type HistorySearchOutput,
} from './contracts/history';
import {
  STORAGE_TOOL_CONTRACTS,
  type StorageGetBytesInUseInput,
  type StorageGetBytesInUseOutput,
  type StorageGetInput,
  type StorageGetOutput,
  type StorageRemoveInput,
  type StorageRemoveOutput,
  type StorageSetInput,
  type StorageSetOutput,
} from './contracts/storage';
import {
  TAB_GROUP_TOOL_CONTRACTS,
  type TabGroupGetInput,
  type TabGroupGetOutput,
  type TabGroupMoveInput,
  type TabGroupMoveOutput,
  type TabGroupQueryInput,
  type TabGroupQueryOutput,
  type TabGroupUpdateInput,
  type TabGroupUpdateOutput,
} from './contracts/tab-groups';
import { TAB_TOOL_CONTRACTS, type TabCreateInput, type TabCreateOutput } from './contracts/tabs';
import {
  WINDOW_TOOL_CONTRACTS,
  type WindowCreateInput,
  type WindowCreateOutput,
} from './contracts/windows';

type IsEqual<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends <T>() => T extends TExpected ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type _GetInput = Assert<
  IsEqual<InferExtensionToolInput<typeof STORAGE_TOOL_CONTRACTS.getStorage>, StorageGetInput>
>;
export type _GetOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof STORAGE_TOOL_CONTRACTS.getStorage>, StorageGetOutput>
>;
export type _SetInput = Assert<
  IsEqual<InferExtensionToolInput<typeof STORAGE_TOOL_CONTRACTS.setStorage>, StorageSetInput>
>;
export type _SetOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof STORAGE_TOOL_CONTRACTS.setStorage>, StorageSetOutput>
>;
export type _RemoveInput = Assert<
  IsEqual<InferExtensionToolInput<typeof STORAGE_TOOL_CONTRACTS.removeStorage>, StorageRemoveInput>
>;
export type _RemoveOutput = Assert<
  IsEqual<
    InferExtensionToolOutput<typeof STORAGE_TOOL_CONTRACTS.removeStorage>,
    StorageRemoveOutput
  >
>;
export type _BytesInput = Assert<
  IsEqual<
    InferExtensionToolInput<typeof STORAGE_TOOL_CONTRACTS.getBytesInUse>,
    StorageGetBytesInUseInput
  >
>;
export type _BytesOutput = Assert<
  IsEqual<
    InferExtensionToolOutput<typeof STORAGE_TOOL_CONTRACTS.getBytesInUse>,
    StorageGetBytesInUseOutput
  >
>;

const setStorageHandler: ExtensionToolHandler<typeof STORAGE_TOOL_CONTRACTS.setStorage> = (
  input
) => {
  input.area satisfies 'local' | 'session' | 'sync';
  input.data satisfies Record<string, unknown>;

  return {
    keys: Object.keys(input.data),
  };
};

setStorageHandler satisfies (
  input: StorageSetInput
) => Promise<StorageSetOutput> | StorageSetOutput;

export type _TabGroupGetInput = Assert<
  IsEqual<InferExtensionToolInput<typeof TAB_GROUP_TOOL_CONTRACTS.get>, TabGroupGetInput>
>;
export type _TabGroupGetOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof TAB_GROUP_TOOL_CONTRACTS.get>, TabGroupGetOutput>
>;
export type _TabGroupQueryInput = Assert<
  IsEqual<InferExtensionToolInput<typeof TAB_GROUP_TOOL_CONTRACTS.query>, TabGroupQueryInput>
>;
export type _TabGroupQueryOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof TAB_GROUP_TOOL_CONTRACTS.query>, TabGroupQueryOutput>
>;
export type _TabGroupUpdateInput = Assert<
  IsEqual<InferExtensionToolInput<typeof TAB_GROUP_TOOL_CONTRACTS.update>, TabGroupUpdateInput>
>;
export type _TabGroupUpdateOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof TAB_GROUP_TOOL_CONTRACTS.update>, TabGroupUpdateOutput>
>;
export type _TabGroupMoveInput = Assert<
  IsEqual<InferExtensionToolInput<typeof TAB_GROUP_TOOL_CONTRACTS.move>, TabGroupMoveInput>
>;
export type _TabGroupMoveOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof TAB_GROUP_TOOL_CONTRACTS.move>, TabGroupMoveOutput>
>;

const tabGroupUpdateHandler: ExtensionToolHandler<typeof TAB_GROUP_TOOL_CONTRACTS.update> = (
  input
) => {
  input.groupId satisfies number;
  input.color satisfies
    | 'blue'
    | 'cyan'
    | 'green'
    | 'grey'
    | 'orange'
    | 'pink'
    | 'purple'
    | 'red'
    | 'yellow'
    | undefined;

  return {
    id: input.groupId,
    color: input.color ?? 'grey',
    collapsed: input.collapsed ?? false,
    windowId: 1,
    ...(input.title !== undefined ? { title: input.title } : {}),
  };
};

tabGroupUpdateHandler satisfies (
  input: TabGroupUpdateInput
) => Promise<TabGroupUpdateOutput> | TabGroupUpdateOutput;

export type _BookmarkCreateInput = Assert<
  IsEqual<InferExtensionToolInput<typeof BOOKMARK_TOOL_CONTRACTS.create>, BookmarkCreateInput>
>;
export type _BookmarkCreateOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof BOOKMARK_TOOL_CONTRACTS.create>, BookmarkCreateOutput>
>;
export type _HistorySearchInput = Assert<
  IsEqual<InferExtensionToolInput<typeof HISTORY_TOOL_CONTRACTS.search>, HistorySearchInput>
>;
export type _HistorySearchOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof HISTORY_TOOL_CONTRACTS.search>, HistorySearchOutput>
>;
export type _TabCreateInput = Assert<
  IsEqual<InferExtensionToolInput<typeof TAB_TOOL_CONTRACTS.createTab>, TabCreateInput>
>;
export type _TabCreateOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof TAB_TOOL_CONTRACTS.createTab>, TabCreateOutput>
>;
export type _WindowCreateInput = Assert<
  IsEqual<InferExtensionToolInput<typeof WINDOW_TOOL_CONTRACTS.create>, WindowCreateInput>
>;
export type _WindowCreateOutput = Assert<
  IsEqual<InferExtensionToolOutput<typeof WINDOW_TOOL_CONTRACTS.create>, WindowCreateOutput>
>;

const bookmarkCreateHandler: ExtensionToolHandler<typeof BOOKMARK_TOOL_CONTRACTS.create> = (
  input
) => {
  input.parentId satisfies string | undefined;
  input.url satisfies string | undefined;

  return {
    id: '1',
    title: input.title ?? '',
    parentId: input.parentId ?? '0',
    index: input.index ?? 0,
    dateAdded: 0,
    type: input.url ? 'bookmark' : 'folder',
    ...(input.url !== undefined ? { url: input.url } : {}),
  };
};

bookmarkCreateHandler satisfies (
  input: BookmarkCreateInput
) => Promise<BookmarkCreateOutput> | BookmarkCreateOutput;

const historySearchHandler: ExtensionToolHandler<typeof HISTORY_TOOL_CONTRACTS.search> = (
  input
) => {
  input.maxResults satisfies number | undefined;

  return {
    query: input,
    resultCount: 0,
    results: [],
  };
};

historySearchHandler satisfies (
  input: HistorySearchInput
) => Promise<HistorySearchOutput> | HistorySearchOutput;

const tabCreateHandler: ExtensionToolHandler<typeof TAB_TOOL_CONTRACTS.createTab> = (input) => {
  input.active satisfies boolean | undefined;

  return {
    id: 1,
    index: 0,
    windowId: 1,
    active: input.active ?? false,
    pinned: input.pinned ?? false,
  };
};

tabCreateHandler satisfies (input: TabCreateInput) => Promise<TabCreateOutput> | TabCreateOutput;

const windowCreateHandler: ExtensionToolHandler<typeof WINDOW_TOOL_CONTRACTS.create> = (input) => {
  input.type satisfies 'normal' | 'panel' | 'popup' | undefined;

  return {
    id: 1,
    focused: input.focused ?? false,
    incognito: input.incognito ?? false,
    alwaysOnTop: false,
    state: input.state ?? 'normal',
    type: input.type ?? 'normal',
  };
};

windowCreateHandler satisfies (
  input: WindowCreateInput
) => Promise<WindowCreateOutput> | WindowCreateOutput;
