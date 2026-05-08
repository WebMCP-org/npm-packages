import type {
  ExtensionToolHandler,
  InferExtensionToolInput,
  InferExtensionToolOutput,
} from './contracts/core';
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
