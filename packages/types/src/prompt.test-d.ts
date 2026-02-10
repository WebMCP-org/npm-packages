import { expectTypeOf, test } from 'vitest';
import type { InputSchema } from './common.js';
import type { Prompt, PromptDescriptor, PromptMessage } from './prompt.js';

test('PromptDescriptor has required fields', () => {
  expectTypeOf<PromptDescriptor>().toHaveProperty('name');
  expectTypeOf<PromptDescriptor>().toHaveProperty('get');
});

test('PromptDescriptor.name is string', () => {
  expectTypeOf<PromptDescriptor['name']>().toEqualTypeOf<string>();
});

test('PromptDescriptor.description is optional string', () => {
  expectTypeOf<PromptDescriptor>().toHaveProperty('description');
  expectTypeOf<Required<PromptDescriptor>['description']>().toEqualTypeOf<string>();
});

test('PromptDescriptor.argsSchema is optional InputSchema', () => {
  expectTypeOf<PromptDescriptor>().toHaveProperty('argsSchema');
  expectTypeOf<Required<PromptDescriptor>['argsSchema']>().toEqualTypeOf<InputSchema>();
});

test('PromptDescriptor.get accepts Record and returns Promise with messages', () => {
  expectTypeOf<PromptDescriptor['get']>().parameter(0).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf<PromptDescriptor['get']>().returns.toEqualTypeOf<
    Promise<{ messages: PromptMessage[] }>
  >();
});

test('Prompt has name and optional description and arguments', () => {
  expectTypeOf<Prompt>().toHaveProperty('name');
  expectTypeOf<Prompt['name']>().toEqualTypeOf<string>();
  expectTypeOf<Prompt>().toHaveProperty('description');
  expectTypeOf<Prompt>().toHaveProperty('arguments');
});

test('PromptMessage has role and content', () => {
  expectTypeOf<PromptMessage>().toHaveProperty('role');
  expectTypeOf<PromptMessage>().toHaveProperty('content');
});
