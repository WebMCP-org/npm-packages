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
