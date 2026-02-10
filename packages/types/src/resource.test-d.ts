import { expectTypeOf, test } from 'vitest';
import type { ResourceContents } from './common.js';
import type { ResourceDescriptor, ResourceTemplateInfo } from './resource.js';

test('ResourceDescriptor has required fields', () => {
  expectTypeOf<ResourceDescriptor>().toHaveProperty('uri');
  expectTypeOf<ResourceDescriptor>().toHaveProperty('name');
  expectTypeOf<ResourceDescriptor>().toHaveProperty('read');
});

test('ResourceDescriptor.uri is string', () => {
  expectTypeOf<ResourceDescriptor['uri']>().toEqualTypeOf<string>();
});

test('ResourceDescriptor.name is string', () => {
  expectTypeOf<ResourceDescriptor['name']>().toEqualTypeOf<string>();
});

test('ResourceDescriptor.description is optional string', () => {
  expectTypeOf<ResourceDescriptor>().toHaveProperty('description');
  expectTypeOf<Required<ResourceDescriptor>['description']>().toEqualTypeOf<string>();
});

test('ResourceDescriptor.mimeType is optional string', () => {
  expectTypeOf<ResourceDescriptor>().toHaveProperty('mimeType');
  expectTypeOf<Required<ResourceDescriptor>['mimeType']>().toEqualTypeOf<string>();
});

test('ResourceDescriptor.read returns Promise with contents array', () => {
  expectTypeOf<ResourceDescriptor['read']>().parameter(0).toEqualTypeOf<URL>();
  expectTypeOf<ResourceDescriptor['read']>().returns.toEqualTypeOf<
    Promise<{ contents: ResourceContents[] }>
  >();
});

test('ResourceDescriptor.read accepts optional params', () => {
  expectTypeOf<ResourceDescriptor['read']>()
    .parameter(1)
    .toEqualTypeOf<Record<string, string> | undefined>();
});

test('ResourceTemplateInfo has required fields', () => {
  expectTypeOf<ResourceTemplateInfo>().toHaveProperty('uriTemplate');
  expectTypeOf<ResourceTemplateInfo>().toHaveProperty('name');
  expectTypeOf<ResourceTemplateInfo['uriTemplate']>().toEqualTypeOf<string>();
  expectTypeOf<ResourceTemplateInfo['name']>().toEqualTypeOf<string>();
});

test('ResourceTemplateInfo has optional description and mimeType', () => {
  expectTypeOf<ResourceTemplateInfo>().toHaveProperty('description');
  expectTypeOf<ResourceTemplateInfo>().toHaveProperty('mimeType');
});
