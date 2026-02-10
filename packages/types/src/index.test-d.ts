import { expectTypeOf, test } from 'vitest';
import type { CallToolResult, RegistrationHandle } from './common.js';
import type {
  ElicitationParams,
  ElicitationResult,
  ModelContext,
  ModelContextInput,
  SamplingRequestParams,
  SamplingResult,
  ToolCallEvent,
} from './index.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

// === Producer API ===
test('ModelContext.registerTool accepts ToolDescriptor and returns RegistrationHandle', () => {
  expectTypeOf<ModelContext['registerTool']>().parameter(0).toMatchTypeOf<ToolDescriptor>();
  expectTypeOf<ModelContext['registerTool']>().returns.toEqualTypeOf<RegistrationHandle>();
});

test('ModelContext.unregisterTool accepts name string', () => {
  expectTypeOf<ModelContext['unregisterTool']>().parameter(0).toEqualTypeOf<string>();
});

test('ModelContext.listTools returns ToolListItem[]', () => {
  expectTypeOf<ModelContext['listTools']>().returns.toEqualTypeOf<ToolListItem[]>();
});

test('ModelContext.provideContext accepts ModelContextInput', () => {
  expectTypeOf<ModelContext['provideContext']>().parameter(0).toEqualTypeOf<ModelContextInput>();
});

// === Consumer API ===
test('ModelContext.callTool returns Promise<CallToolResult>', () => {
  expectTypeOf<ModelContext['callTool']>().returns.toEqualTypeOf<Promise<CallToolResult>>();
});

// === General ===
test('ModelContext.clearContext returns void', () => {
  expectTypeOf<ModelContext['clearContext']>().returns.toEqualTypeOf<void>();
});

// === Sampling + elicitation ===
test('ModelContext.createMessage accepts SamplingRequestParams and returns SamplingResult', () => {
  expectTypeOf<ModelContext['createMessage']>().parameter(0).toEqualTypeOf<SamplingRequestParams>();
  expectTypeOf<ModelContext['createMessage']>().returns.toEqualTypeOf<Promise<SamplingResult>>();
});

test('ModelContext.elicitInput accepts ElicitationParams and returns ElicitationResult', () => {
  expectTypeOf<ModelContext['elicitInput']>().parameter(0).toEqualTypeOf<ElicitationParams>();
  expectTypeOf<ModelContext['elicitInput']>().returns.toEqualTypeOf<Promise<ElicitationResult>>();
});

// === Events ===
test('ToolCallEvent extends Event with name, arguments, respondWith', () => {
  expectTypeOf<ToolCallEvent>().toMatchTypeOf<Event>();
  expectTypeOf<ToolCallEvent>().toHaveProperty('name');
  expectTypeOf<ToolCallEvent>().toHaveProperty('arguments');
  expectTypeOf<ToolCallEvent>().toHaveProperty('respondWith');
});

// === Global augmentation ===
test('navigator.modelContext is typed as ModelContext', () => {
  expectTypeOf<Navigator['modelContext']>().toEqualTypeOf<ModelContext>();
});
