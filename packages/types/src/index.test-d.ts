import { expectTypeOf, test } from 'vitest';
import type { CallToolResult, RegistrationHandle, Resource } from './common.js';
import type { ModelContext, ModelContextInput, ToolCallEvent } from './index.js';
import type { Prompt, PromptDescriptor } from './prompt.js';
import type { ResourceDescriptor, ResourceTemplateInfo } from './resource.js';
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

// === Resources ===
test('ModelContext.registerResource accepts ResourceDescriptor', () => {
  expectTypeOf<ModelContext['registerResource']>().parameter(0).toEqualTypeOf<ResourceDescriptor>();
  expectTypeOf<ModelContext['registerResource']>().returns.toEqualTypeOf<RegistrationHandle>();
});

test('ModelContext.listResources returns Resource[]', () => {
  expectTypeOf<ModelContext['listResources']>().returns.toEqualTypeOf<Resource[]>();
});

test('ModelContext.listResourceTemplates returns ResourceTemplateInfo[]', () => {
  expectTypeOf<ModelContext['listResourceTemplates']>().returns.toEqualTypeOf<
    ResourceTemplateInfo[]
  >();
});

// === Prompts ===
test('ModelContext.registerPrompt accepts PromptDescriptor', () => {
  expectTypeOf<ModelContext['registerPrompt']>().parameter(0).toMatchTypeOf<PromptDescriptor>();
  expectTypeOf<ModelContext['registerPrompt']>().returns.toEqualTypeOf<RegistrationHandle>();
});

test('ModelContext.listPrompts returns Prompt[]', () => {
  expectTypeOf<ModelContext['listPrompts']>().returns.toEqualTypeOf<Prompt[]>();
});

// === General ===
test('ModelContext.clearContext returns void', () => {
  expectTypeOf<ModelContext['clearContext']>().returns.toEqualTypeOf<void>();
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
