import { expectTypeOf, test } from 'vitest';
import type { WebMCP } from './index.js';

test('type-only import activates global Document.modelContext typing', () => {
  expectTypeOf<Document>().toHaveProperty('modelContext');
  expectTypeOf<NonNullable<Document['modelContext']>>().toHaveProperty('registerTool');
});

test('Document.modelContext is optional so feature detection narrows it', () => {
  const useWhenPresent = (doc: Document) => {
    if (!doc.modelContext) return;
    expectTypeOf(doc.modelContext).toEqualTypeOf<WebMCP.ModelContext>();
  };
  expectTypeOf(useWhenPresent).toBeFunction();
});

test('type-only import activates deprecated global Navigator.modelContext typing', () => {
  expectTypeOf<Navigator>().toHaveProperty('modelContext');
  expectTypeOf<NonNullable<Navigator['modelContext']>>().toHaveProperty('registerTool');
});

test('type-only import activates the declarative SubmitEvent surface', () => {
  expectTypeOf<SubmitEvent['agentInvoked']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>()
    .parameter(0)
    .toEqualTypeOf<Promise<unknown>>();
  expectTypeOf<NonNullable<SubmitEvent['respondWith']>>().returns.toBeVoid();

  const assign = (event: SubmitEvent) => {
    // @ts-expect-error agentInvoked is a readonly Web IDL attribute.
    event.agentInvoked = true;
  };
  expectTypeOf(assign).toBeFunction();
});

test('declarative SubmitEvent members are feature-detectable', () => {
  const handleAgentSubmit = (event: SubmitEvent) => {
    if (!event.agentInvoked || !event.respondWith) return;
    event.preventDefault();
    event.respondWith(Promise.resolve({ content: [] }));
  };
  expectTypeOf(handleAgentSubmit).toBeFunction();
});
