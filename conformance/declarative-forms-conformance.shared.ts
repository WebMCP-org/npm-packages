import type { WebMCP } from '../packages/webmcp-polyfill/src/index.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

interface DeclarativeFormConformanceOptions {
  suiteName: string;
  install?(): void | Promise<void>;
  cleanup?(): void | Promise<void>;
  supportsFormRemovalCancellation?: boolean;
}

const FIXTURE_ATTRIBUTE = 'data-webmcp-declarative-conformance';

/**
 * WebMCP is optional in browser runtimes. This suite runs after `install()`, so
 * absence is a harness failure rather than a supported state.
 */
function requireModelContext(): NonNullable<Document['modelContext']> {
  const modelContext = document.modelContext;
  if (!modelContext) throw new Error('Expected document.modelContext to be installed');
  return modelContext;
}

/**
 * The WebMCP IDL does not define the declarative `SubmitEvent` hooks, so
 * `SubmitEvent.respondWith()` is optional. Native Chromium and `@mcp-b/webmcp-polyfill`
 * provide it; absence is a harness failure here.
 *
 * There is deliberately no matching helper for `agentInvoked`: synthetic
 * `Event('submit')` dispatches legitimately leave it `undefined`.
 */
function submitRespondWith(event: SubmitEvent, agentResponse: Promise<unknown>): void {
  if (!event.respondWith) throw new Error('Expected SubmitEvent.respondWith to be installed');
  event.respondWith(agentResponse);
}

function isToolActivatedEvent(event: Event): event is Event & { toolName: string } {
  return (
    event.type === 'toolactivated' && 'toolName' in event && typeof event.toolName === 'string'
  );
}

// Chrome 155 still dispatches toolactivated on window; Chrome 156 and the polyfill use the context.
function onToolActivated(name: string, handler: () => void): void {
  const targets = [requireModelContext(), window];
  const listener = (event: Event) => {
    if (!isToolActivatedEvent(event) || event.toolName !== name) return;
    for (const target of targets) target.removeEventListener('toolactivated', listener);
    handler();
  };
  for (const target of targets) target.addEventListener('toolactivated', listener);
}

async function waitForTool(
  name: string,
  predicate: (tool: WebMCP.RegisteredTool) => boolean = () => true
): Promise<WebMCP.RegisteredTool> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const tool = (await requireModelContext().getTools()).find(
      (candidate) => candidate.name === name
    );
    if (tool && predicate(tool)) return tool;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for declarative tool ${name}`);
}

async function waitForToolRemoval(name: string): Promise<void> {
  await waitForCondition(
    async () => !(await requireModelContext().getTools()).some((tool) => tool.name === name),
    `Timed out waiting for declarative tool ${name} to be removed`
  );
}

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  message: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

// Chrome returns a string passed to respondWith() as plain text rather than JSON.
async function executeTool(
  tool: WebMCP.RegisteredTool,
  input: Parameters<WebMCP.ModelContext['executeTool']>[1]
): Promise<Awaited<ReturnType<WebMCP.ToolExecuteCallback>>> {
  const serialized = await requireModelContext().executeTool(tool, input);
  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

function rejectAfter(milliseconds: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds));
}

export function runDeclarativeFormConformanceSuite(
  options: DeclarativeFormConformanceOptions
): void {
  describe(options.suiteName, () => {
    const toolNames = new Set<string>();

    /** Inserts `markup` in one step and returns the form that declares the generated tool name. */
    function declareForm(prefix: string, markup: (toolName: string) => string) {
      const name = `${prefix}_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML('beforeend', markup(name));
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error(`Expected the ${name} declarative form fixture`);
      return { name, form };
    }

    beforeAll(async () => {
      await options.cleanup?.();
      await options.install?.();
    });

    afterEach(async () => {
      document.querySelectorAll(`[${FIXTURE_ATTRIBUTE}]`).forEach((element) => element.remove());
      await Promise.all([...toolNames].map(waitForToolRemoval));
      toolNames.clear();
    });

    afterAll(async () => {
      await options.cleanup?.();
    });

    it('registers annotated forms with schemas derived from native controls', async () => {
      const { name } = declareForm(
        'declarative_schema',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooltitle="Search" tooldescription="Search the catalog">
          <input name="query" required toolparamdescription="The search query">
          <input name="limit" type="number" toolparamdescription="Maximum result count">
          <input name="safe_search" type="checkbox" toolparamdescription="Enable safe search">
        </form>`
      );

      const tool = await waitForTool(name);

      expect(tool).toMatchObject({
        name,
        title: 'Search',
        description: 'Search the catalog',
      });
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          limit: {
            type: 'number',
            multipleOf: 1,
            description: 'Maximum result count',
          },
          safe_search: { type: 'boolean', description: 'Enable safe search' },
        },
        required: ['query'],
      });
    });

    it('discovers annotated forms in open shadow roots', async () => {
      const name = `declarative_shadow_${String(Date.now())}`;
      toolNames.add(name);
      const host = document.createElement('div');
      host.setAttribute(FIXTURE_ATTRIBUTE, '');
      document.body.append(host);
      await new Promise((resolve) => setTimeout(resolve, 0));
      host.attachShadow({
        mode: 'open',
      }).innerHTML = `<form toolname="${name}" tooldescription="Search from a component">
          <input name="query" toolparamdescription="Search query">
        </form>`;

      const tool = await waitForTool(name);

      expect(tool.description).toBe('Search from a component');
      expect(tool.inputSchema).toMatchObject({
        properties: { query: { type: 'string', description: 'Search query' } },
      });
    });

    it('matches Chromium schema rules for associated, constrained, and omitted controls', async () => {
      const formId = `declarative-form-${String(Date.now())}`;
      const { name } = declareForm(
        'declarative_schema_edges',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} id="${formId}" toolname="${toolName}" tooldescription="Schema edges">
          <input name="invalid_pattern" pattern="[">
          <input name="distance" type="range">
          <input name="at" type="time" step="1">
          <input name="starts" type="datetime-local" step="0.1">
          <input name="token" type="hidden" toolparamdescription="Opaque token">
          <input name="ignored_hidden" type="hidden">
          <input name="ignored_disabled" disabled>
          <textarea name="ignored_readonly" readonly></textarea>
          <input name="readonly_checkbox" type="checkbox" readonly>
          <input name="duplicate_text">
          <input name="duplicate_text">
        </form>
        <input ${FIXTURE_ATTRIBUTE} form="${formId}" name="external" toolparamdescription="Associated control">`
      );

      const tool = await waitForTool(name);
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          invalid_pattern: { type: 'string' },
          distance: { type: 'number', minimum: 0, maximum: 100, multipleOf: 1 },
          at: {
            type: 'string',
            format: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
          },
          starts: {
            type: 'string',
            format:
              '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$',
          },
          token: { type: 'string', description: 'Opaque token' },
          readonly_checkbox: { type: 'boolean' },
          external: { type: 'string', description: 'Associated control' },
        },
        required: [],
      });
    });

    it('matches Chromium schema rules for choice, date, and labelled controls', async () => {
      const { name } = declareForm(
        'declarative_schema_choices',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Choice controls">
          <label>Gift wrap <input name="wrap" type="radio" value="yes"></label>
          <fieldset toolparamdescription="Delivery speed">
            <input name="speed" type="radio" value="standard">
            <input name="speed" type="radio" value="express">
          </fieldset>
          <label><input name="extras" type="checkbox" value="card"> Card</label>
          <input name="extras" type="checkbox" value="bag">
          <select name="size"><option value="s">Small</option><option>Large</option></select>
          <label>Notes <textarea name="notes"></textarea></label>
          <input name="day" type="date" toolparamdescription="Delivery day">
          <input name="month" type="month">
          <input name="week" type="week">
          <input name="color" type="color" aria-description="Ribbon color">
          <input name="count" type="number" pattern="[0-9]+">
        </form>`
      );

      const tool = await waitForTool(name);
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          wrap: {
            type: 'string',
            anyOf: [{ type: 'string', const: 'yes', title: 'Gift wrap' }],
            enum: ['yes'],
            description: 'Gift wrap',
          },
          speed: {
            type: 'string',
            anyOf: [
              { type: 'string', const: 'standard' },
              { type: 'string', const: 'express' },
            ],
            enum: ['standard', 'express'],
            description: 'Delivery speed',
          },
          extras: {
            type: 'array',
            items: {
              type: 'string',
              anyOf: [
                { type: 'string', const: 'card', title: 'Card' },
                { type: 'string', const: 'bag' },
              ],
              enum: ['card', 'bag'],
            },
            uniqueItems: true,
          },
          size: {
            type: 'string',
            anyOf: [
              { type: 'string', const: 's', title: 'Small' },
              { type: 'string', const: 'Large', title: 'Large' },
            ],
            enum: ['s', 'Large'],
          },
          notes: { type: 'string', description: 'Notes' },
          day: {
            type: 'string',
            format: 'date',
            description: "Delivery day (Dates MUST be provided in 'YYYY-MM-DD' format.)",
          },
          month: { type: 'string', format: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
          week: { type: 'string', format: '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' },
          color: { type: 'string', format: '^#[0-9a-zA-Z]{6}$', description: 'Ribbon color' },
          count: { type: 'number', multipleOf: 1, pattern: '[0-9]+' },
        },
        required: [],
      });
    });

    it('normalizes parameter names without trusting clobberable form properties', async () => {
      const parameterNames = [
        'spaced',
        '__proto__',
        'elements',
        'getAttribute',
        'hasAttribute',
        'addEventListener',
        'removeEventListener',
        'checkValidity',
        'requestSubmit',
        'ownerDocument',
        'isConnected',
        'shadowRoot',
        'submit',
      ];
      const { name, form } = declareForm(
        'declarative_clobber',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Clobbering-safe form" toolautosubmit>
          <input name="  spaced  ">
          ${parameterNames
            .slice(1)
            .map((parameter) => `<input name="${parameter}">`)
            .join('')}
          <button type="submit">Submit</button>
        </form>`
      );
      EventTarget.prototype.addEventListener.call(
        form,
        'submit',
        (event: Event) => {
          if (!(event instanceof SubmitEvent)) return;
          event.preventDefault();
          submitRespondWith(event, Promise.resolve('clobber-ok'));
        },
        { once: true }
      );

      const tool = await waitForTool(name);
      const schema = tool.inputSchema;
      if (
        !schema ||
        !('properties' in schema) ||
        !schema.properties ||
        typeof schema.properties !== 'object'
      ) {
        throw new Error('Expected an object properties schema');
      }
      const properties = schema.properties;

      expect(Object.keys(properties)).toEqual(parameterNames);
      expect(Object.hasOwn(properties, '__proto__')).toBe(true);
      await expect(
        executeTool(
          tool,
          Object.fromEntries(parameterNames.map((parameter) => [parameter, parameter]))
        )
      ).resolves.toBe('clobber-ok');
    });

    it('fills controls, dispatches native events, and returns the submit response', async () => {
      const { name, form } = declareForm(
        'declarative_execute',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Update search" toolautosubmit>
          <input id="declarative-query" name="query">
          <input id="declarative-limit" name="limit" type="number">
          <input id="declarative-safe" name="safe" type="checkbox">
          <input id="declarative-sort-new" name="sort" type="radio" value="new">
          <input id="declarative-sort-top" name="sort" type="radio" value="top">
          <input id="declarative-alert" name="alert" type="radio" value="on">
          <input id="declarative-source-docs" name="sources" type="checkbox" value="docs" checked>
          <input id="declarative-source-code" name="sources" type="checkbox" value="code">
          <textarea id="declarative-notes" name="notes"></textarea>
          <select id="declarative-tags" name="tags" multiple>
            <option value="typescript">TypeScript</option>
            <option value="webmcp">WebMCP</option>
            <option value="testing">Testing</option>
          </select>
          <button type="submit">Apply</button>
        </form>`
      );

      const changed = new Set<string>();
      form.querySelectorAll<HTMLElement>('input, textarea, select').forEach((control) => {
        control.addEventListener('input', () => changed.add(`${control.id}:input`));
        control.addEventListener('change', () => changed.add(`${control.id}:change`));
      });
      let agentInvoked: boolean | undefined;
      window.addEventListener(
        'submit',
        (event) => {
          if (event.target !== form) return;
          agentInvoked = event.agentInvoked;
          event.preventDefault();
          submitRespondWith(event, Promise.resolve({ accepted: false }));
          submitRespondWith(event, Promise.resolve({ accepted: true }));
          event.stopImmediatePropagation();
        },
        { capture: true, once: true }
      );

      const result = await executeTool(await waitForTool(name), {
        query: 'declarative tools',
        limit: 25,
        safe: true,
        sort: 'top',
        alert: 'on',
        sources: ['code'],
        notes: 'browser parity',
        tags: ['typescript', 'testing'],
      });

      expect(agentInvoked).toBe(true);
      expect(result).toEqual({ accepted: true });
      expect(form.elements.namedItem('query')).toHaveProperty('value', 'declarative tools');
      expect(form.elements.namedItem('limit')).toHaveProperty('value', '25');
      expect(form.elements.namedItem('safe')).toHaveProperty('checked', true);
      expect(document.querySelector('#declarative-sort-top')).toHaveProperty('checked', true);
      expect(form.elements.namedItem('alert')).toHaveProperty('checked', true);
      expect(document.querySelector('#declarative-source-docs')).toHaveProperty('checked', false);
      expect(document.querySelector('#declarative-source-code')).toHaveProperty('checked', true);
      expect(form.elements.namedItem('notes')).toHaveProperty('value', 'browser parity');
      expect(
        [...form.querySelectorAll<HTMLOptionElement>('#declarative-tags option')]
          .filter((option) => option.selected)
          .map((option) => option.value)
      ).toEqual(['typescript', 'testing']);
      expect(changed).toEqual(
        new Set([
          'declarative-query:input',
          'declarative-query:change',
          'declarative-limit:input',
          'declarative-limit:change',
          'declarative-safe:input',
          'declarative-safe:change',
          'declarative-sort-top:input',
          'declarative-sort-top:change',
          'declarative-alert:input',
          'declarative-alert:change',
          'declarative-source-docs:input',
          'declarative-source-docs:change',
          'declarative-source-code:input',
          'declarative-source-code:change',
          'declarative-notes:input',
          'declarative-notes:change',
          'declarative-tags:input',
          'declarative-tags:change',
        ])
      );
    });

    it('reports agentInvoked for the running tool call but not for ordinary submissions', async () => {
      const userFormId = `declarative-user-form-${String(Date.now())}`;
      const { name, form: toolForm } = declareForm(
        'declarative_attribution',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Agent attribution" toolautosubmit>
          <input name="query">
          <button type="submit">Search</button>
        </form>
        <form ${FIXTURE_ATTRIBUTE} id="${userFormId}">
          <input name="query">
          <button type="submit">Search</button>
        </form>`
      );
      const userForm = document.querySelector<HTMLFormElement>(`#${userFormId}`);
      const userButton = userForm?.querySelector<HTMLButtonElement>('button');
      if (!userForm || !userButton) throw new Error('Expected the user form fixture');

      let agentSubmitInvoked: boolean | undefined;
      toolForm.addEventListener('submit', (event) => {
        agentSubmitInvoked = event.agentInvoked;
        event.preventDefault();
        submitRespondWith(event, Promise.resolve('searched'));
      });
      let userSubmitInvoked: boolean | undefined;
      let userRespondWithError: unknown;
      userForm.addEventListener('submit', (event) => {
        userSubmitInvoked = event.agentInvoked;
        event.preventDefault();
        try {
          submitRespondWith(event, Promise.resolve('not the agent'));
        } catch (error) {
          userRespondWithError = error;
        }
      });

      await expect(executeTool(await waitForTool(name), { query: 'agent' })).resolves.toBe(
        'searched'
      );
      expect(agentSubmitInvoked).toBe(true);

      userButton.click();

      expect(userSubmitInvoked).toBe(false);
      expect(userRespondWithError).toMatchObject({ name: 'InvalidStateError' });
    });

    it('dispatches autosubmit before announcing tool activation', async () => {
      const { name, form } = declareForm(
        'declarative_autosubmit_order',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Autosubmit order" toolautosubmit></form>`
      );
      const events: string[] = [];
      form.addEventListener('submit', (event) => {
        events.push('submit');
        event.preventDefault();
        submitRespondWith(event, Promise.resolve());
      });
      onToolActivated(name, () => events.push('activated'));

      await executeTool(await waitForTool(name), {});

      expect(events).toEqual(['submit', 'activated']);
    });

    it('honors native validation, novalidate, and formnovalidate during autosubmit', async () => {
      for (const validationBypass of ['novalidate', 'formnovalidate'] as const) {
        const { name, form } = declareForm(
          `declarative_${validationBypass}`,
          (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Skip validation" toolautosubmit ${
          validationBypass === 'novalidate' ? 'novalidate' : ''
        }>
            <input name="required_value" required>
            <button type="submit" ${
              validationBypass === 'formnovalidate' ? 'formnovalidate' : ''
            }>Submit</button>
          </form>`
        );
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submitRespondWith(event, Promise.resolve(validationBypass));
        });

        await expect(executeTool(await waitForTool(name), {})).resolves.toBe(validationBypass);
      }

      const { name, form } = declareForm(
        'declarative_validation',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Run validation" toolautosubmit>
          <input name="required_value" required>
          <button type="submit">Submit</button>
        </form>`
      );
      let submitted = false;
      form.addEventListener('submit', () => {
        submitted = true;
      });

      await expect(executeTool(await waitForTool(name), {})).rejects.toBeDefined();
      expect(submitted).toBe(false);
    });

    it('resolves an autosubmit call from the submit event when no response is provided', async () => {
      const frameName = `declarative-settle-frame-${String(Date.now())}`;
      const { name, form } = declareForm(
        'declarative_submit_settle',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Submit without responding" toolautosubmit target="${frameName}" action="about:blank">
          <input name="query">
        </form>
        <iframe ${FIXTURE_ATTRIBUTE} name="${frameName}"></iframe>`
      );

      let submitted = false;
      form.addEventListener('submit', () => {
        submitted = true;
      });

      await executeTool(await waitForTool(name), { query: 'settle me' });

      expect(submitted).toBe(true);
    });

    it('resolves when a submit handler performs a direct form submission', async () => {
      const frameName = `declarative-frame-${String(Date.now())}`;
      const { name, form } = declareForm(
        'declarative_direct_submit',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Submit directly" toolautosubmit target="${frameName}" action="about:blank">
        </form>
        <iframe ${FIXTURE_ATTRIBUTE} name="${frameName}"></iframe>`
      );

      let submitted = false;
      form.addEventListener('submit', (event) => {
        submitted = true;
        event.preventDefault();
        form.submit();
      });

      await executeTool(await waitForTool(name), {});

      expect(submitted).toBe(true);
    });

    it('resolves a manual invocation when script submits the active form directly', async () => {
      const frameName = `declarative-external-frame-${String(Date.now())}`;
      const { name, form } = declareForm(
        'declarative_external_submit',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Submit outside a handler" target="${frameName}" action="about:blank">
          <button type="submit">Submit</button>
        </form>
        <iframe ${FIXTURE_ATTRIBUTE} name="${frameName}"></iframe>`
      );
      const button = form.querySelector('button');
      if (!button) throw new Error('Expected the external-submit button');

      let settled = false;
      const execution = executeTool(await waitForTool(name), {}).finally(() => {
        settled = true;
      });
      await waitForCondition(
        () => document.activeElement === button,
        'Timed out waiting for external-submit form activation'
      );
      new FormData(form);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      form.submit();

      await expect(
        Promise.race([execution, rejectAfter(200, 'timed out waiting for direct submission')])
      ).resolves.toBeDefined();
    });

    it('keeps manual-review calls pending until the focused submit button is used', async () => {
      const { name, form } = declareForm(
        'declarative_manual',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Prepare a message">
          <input name="message">
          <button type="submit">Send</button>
        </form>`
      );
      const input = form.elements.namedItem('message');
      const button = form.querySelector('button');
      if (!(input instanceof HTMLInputElement) || !button) {
        throw new Error('Expected the manual form controls');
      }

      let activatedWithValue = '';
      let activatedWithFocusedSubmitter = false;
      onToolActivated(name, () => {
        activatedWithValue = input.value;
        activatedWithFocusedSubmitter = document.activeElement === button;
      });
      let syntheticAgentInvoked: boolean | undefined;
      form.addEventListener('submit', (event) => {
        if (!event.isTrusted) {
          syntheticAgentInvoked = event.agentInvoked;
          return;
        }
        event.preventDefault();
        submitRespondWith(event, Promise.resolve('sent'));
      });

      let settled = false;
      const execution = executeTool(await waitForTool(name), { message: 'review me' }).finally(
        () => {
          settled = true;
        }
      );
      await waitForCondition(
        () => activatedWithValue === 'review me',
        'Timed out waiting for manual declarative tool activation'
      );
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('reset', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(input.value).toBe('review me');
      expect(activatedWithValue).toBe('review me');
      expect(activatedWithFocusedSubmitter).toBe(true);
      expect(document.activeElement).toBe(button);
      expect(syntheticAgentInvoked).toBe(false);
      expect(settled).toBe(false);

      button.click();
      expect(await execution).toBe('sent');
    });

    it('rejects a manual form without mutating it when no submit button exists', async () => {
      const { name, form } = declareForm(
        'declarative_missing_submit',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Missing submit button">
          <input name="value" value="initial">
        </form>`
      );
      const input = form.elements.namedItem('value');
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected the value input');

      await expect(
        executeTool(await waitForTool(name), { value: 'should not be applied' })
      ).rejects.toBeDefined();
      expect(input.value).toBe('initial');
    });

    it('cancels a pending manual-review call when the form is reset', async () => {
      const { name, form } = declareForm(
        'declarative_reset',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Prepare resettable input">
          <input name="value" value="initial">
          <button type="submit">Save</button>
        </form>`
      );
      const input = form.elements.namedItem('value');
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected the value input');

      const execution = executeTool(await waitForTool(name), { value: 'pending' });
      await waitForCondition(
        () => input.value === 'pending',
        'Timed out waiting for resettable declarative form to be filled'
      );
      expect(input.value).toBe('pending');
      form.reset();

      await expect(
        Promise.race([execution, rejectAfter(200, 'timed out waiting for reset cancellation')])
      ).rejects.toMatchObject({ name: 'UnknownError' });
      expect(input.value).toBe('initial');
    });

    it('keeps a manual invocation active when reset is prevented', async () => {
      const { name, form } = declareForm(
        'declarative_prevented_reset',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Prevent reset">
          <input name="value" value="initial">
          <button type="submit">Save</button>
        </form>`
      );
      const input = form.elements.namedItem('value');
      const button = form.querySelector('button');
      if (!(input instanceof HTMLInputElement) || !button) {
        throw new Error('Expected the prevented-reset form controls');
      }
      form.addEventListener('reset', (event) => event.preventDefault());
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitRespondWith(event, Promise.resolve('saved'));
      });

      let settled = false;
      const execution = executeTool(await waitForTool(name), { value: 'pending' }).finally(() => {
        settled = true;
      });
      await waitForCondition(
        () => input.value === 'pending',
        'Timed out waiting for prevented-reset form to be filled'
      );
      form.reset();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settled).toBe(false);
      expect(input.value).toBe('pending');
      button.click();
      await expect(execution).resolves.toBe('saved');
    });

    it('reconciles form mutations and duplicate registration retries', async () => {
      const { name, form: first } = declareForm(
        'declarative_dynamic',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} id="declarative-first" toolname="${toolName}" tooldescription="First form">
          <input name="query">
        </form>
        <form ${FIXTURE_ATTRIBUTE} id="declarative-second" toolname="${toolName}" tooldescription="Second form">
          <input name="fallback">
        </form>`
      );
      const second = document.querySelector<HTMLFormElement>('#declarative-second');
      const input = first.elements.namedItem('query');
      if (!second || !(input instanceof HTMLInputElement)) {
        throw new Error('Expected dynamic declarative form fixtures');
      }

      expect(await waitForTool(name)).toMatchObject({ description: 'First form' });
      expect(
        (await requireModelContext().getTools()).filter((tool) => tool.name === name)
      ).toHaveLength(1);

      second.setAttribute('tooldescription', 'Second form promoted');
      expect(
        await waitForTool(name, (tool) => tool.description === 'Second form promoted')
      ).toMatchObject({ description: 'Second form promoted' });

      first.setAttribute('tooltitle', 'Updated title');
      first.setAttribute('tooldescription', 'Updated form');
      input.name = 'limit';
      input.type = 'number';
      input.required = true;
      input.setAttribute('toolparamdescription', 'Maximum results');

      const updated = await waitForTool(name, (tool) => tool.description === 'Updated form');
      expect(updated.title).toBe('Updated title');
      expect(updated.inputSchema).toEqual({
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            multipleOf: 1,
            description: 'Maximum results',
          },
        },
        required: ['limit'],
      });

      first.remove();
      await waitForToolRemoval(name);
      second.setAttribute('tooldescription', 'Second form activated');
      expect(
        await waitForTool(name, (tool) => tool.description === 'Second form activated')
      ).toMatchObject({ description: 'Second form activated' });

      second.removeAttribute('tooldescription');
      await waitForToolRemoval(name);
      second.setAttribute('tooldescription', 'Restored form');
      expect(await waitForTool(name)).toMatchObject({ description: 'Restored form' });
    });

    it('emits a tool change when toolautosubmit is added', async () => {
      const { name, form } = declareForm(
        'declarative_autosubmit_change',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Autosubmit change"></form>`
      );
      await waitForTool(name);
      const changed = new Promise((resolve) => {
        requireModelContext().addEventListener('toolchange', resolve, { once: true });
      });

      form.setAttribute('toolautosubmit', '');

      await changed;
    });

    it('rejects invalid input transactionally before changing any control', async () => {
      const { name, form } = declareForm(
        'declarative_transaction',
        (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Transactional form" toolautosubmit>
          <input name="query" value="original">
          <select name="scope">
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        </form>`
      );
      const query = form.elements.namedItem('query');
      const scope = form.elements.namedItem('scope');
      if (!(query instanceof HTMLInputElement) || !(scope instanceof HTMLSelectElement)) {
        throw new Error('Expected the transactional form controls');
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitRespondWith(event, Promise.resolve('ok'));
      });
      const tool = await waitForTool(name);

      await expect(executeTool(tool, { query: 'changed', unknown: true })).rejects.toMatchObject({
        name: 'UnknownError',
      });
      expect(query.value).toBe('original');
      expect(scope.value).toBe('local');

      await expect(executeTool(tool, { query: 'changed', scope: 'missing' })).rejects.toMatchObject(
        {
          name: 'UnknownError',
        }
      );
      expect(query.value).toBe('original');
      expect(scope.value).toBe('local');

      await expect(executeTool(tool, { scope: 'global' })).resolves.toBe('ok');
      expect(query.value).toBe('original');
      expect(scope.value).toBe('global');
    });

    it.skipIf(options.supportsFormRemovalCancellation === false)(
      'rejects a pending response when its declarative form is removed',
      async () => {
        const { name, form } = declareForm(
          'declarative_removed',
          (toolName) => `
        <form ${FIXTURE_ATTRIBUTE} toolname="${toolName}" tooldescription="Pending form" toolautosubmit>
          <input name="value">
        </form>`
        );
        let submitted: (() => void) | undefined;
        const submission = new Promise<void>((resolve) => {
          submitted = resolve;
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submitRespondWith(event, new Promise(() => {}));
          submitted?.();
        });

        const execution = executeTool(await waitForTool(name), { value: 'pending' });
        await submission;
        form.remove();

        await expect(execution).rejects.toMatchObject({ name: 'UnknownError' });
      }
    );
  });
}
