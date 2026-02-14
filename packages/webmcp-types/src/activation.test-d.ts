import { expectTypeOf, test } from 'vitest';
import type {} from './index.js';

test('type-only import activates global Navigator.modelContext typing', () => {
  expectTypeOf<Navigator>().toHaveProperty('modelContext');
  expectTypeOf<Navigator['modelContext']>().toHaveProperty('registerTool');
});
