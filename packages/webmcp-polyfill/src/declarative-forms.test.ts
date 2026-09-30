import { runDeclarativeFormConformanceSuite } from '../../../conformance/declarative-forms-conformance.shared.js';
import { expect, it } from 'vitest';
import { installWebMCP } from './index.js';

runDeclarativeFormConformanceSuite({
  suiteName: 'Standalone polyfill declarative tools',
  install: installWebMCP,
});

it('cancels a pending manual-review call when the execute signal aborts', async () => {
  installWebMCP();
  const context = document.modelContext;
  if (!context) throw new Error('Expected document.modelContext to be installed');
  const name = 'declarative_abort_manual';
  document.body.insertAdjacentHTML(
    'beforeend',
    `<form toolname="${name}" tooldescription="Prepare a message">
      <input name="message">
      <button type="submit">Send</button>
    </form>`
  );
  const form = document.querySelector<HTMLFormElement>(`form[toolname="${name}"]`);
  const input = form?.elements.namedItem('message');
  const button = form?.querySelector<HTMLButtonElement>('button');
  if (!form || !(input instanceof HTMLInputElement) || !button) {
    throw new Error('Expected the manual declarative form fixture');
  }
  await expect
    .poll(async () => (await context.getTools()).some((candidate) => candidate.name === name))
    .toBe(true);
  const tool = (await context.getTools()).find((candidate) => candidate.name === name);
  if (!tool) throw new Error('Expected the declarative form to register a tool');
  const activated = new Promise<Event>((resolve) => {
    context.addEventListener('toolactivated', resolve, { once: true });
  });
  const cancelled = new Promise<Event>((resolve) => {
    context.addEventListener('toolcancel', resolve, { once: true });
  });

  const controller = new AbortController();
  const execution = context.executeTool(
    tool,
    { message: 'review me' },
    { signal: controller.signal }
  );
  await expect.poll(() => input.value).toBe('review me');
  expect(await activated).toHaveProperty('toolName', name);
  controller.abort();

  await expect(execution).rejects.toMatchObject({ name: 'AbortError' });
  expect(await cancelled).toHaveProperty('toolName', name);

  let agentInvoked: boolean | undefined;
  let respondWithError: unknown;
  form.addEventListener('submit', (event) => {
    agentInvoked = event.agentInvoked;
    event.preventDefault();
    try {
      event.respondWith?.(Promise.resolve('late'));
    } catch (error) {
      respondWithError = error;
    }
  });
  button.click();

  expect(agentInvoked).toBe(false);
  expect(respondWithError).toMatchObject({ name: 'InvalidStateError' });
  form.remove();
});
