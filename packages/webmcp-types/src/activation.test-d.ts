import { expectTypeOf, test } from 'vitest';
import type {} from './index.js';

test('type-only import activates global Document.modelContext typing', () => {
  expectTypeOf<Document>().toHaveProperty('modelContext');
  expectTypeOf<Document['modelContext']>().toHaveProperty('registerTool');
});

test('type-only import activates deprecated global Navigator.modelContext typing', () => {
  expectTypeOf<Navigator>().toHaveProperty('modelContext');
  expectTypeOf<Navigator['modelContext']>().toHaveProperty('registerTool');
});
