import type { ChromeModelContext, RegisteredTool } from '@mcp-b/webmcp-types';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

interface DeclarativeFormConformanceOptions {
  suiteName: string;
  install?(): void | Promise<void>;
  cleanup?(): void | Promise<void>;
}

const FIXTURE_ATTRIBUTE = 'data-webmcp-declarative-conformance';

async function waitForTool(
  name: string,
  predicate: (tool: RegisteredTool) => boolean = () => true
): Promise<RegisteredTool> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const tool = (await document.modelContext.getTools()).find(
      (candidate) => candidate.name === name
    );
    if (tool && predicate(tool)) return tool;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for declarative tool ${name}`);
}

async function waitForToolRemoval(name: string): Promise<void> {
  await waitForCondition(
    async () => !(await document.modelContext.getTools()).some((tool) => tool.name === name),
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

function executeTool(tool: RegisteredTool, input: Record<string, unknown>): Promise<string | null> {
  const modelContext: ChromeModelContext = document.modelContext;
  if (!modelContext.executeTool)
    throw new Error('Expected executeTool for declarative conformance');
  return modelContext.executeTool(tool, JSON.stringify(input));
}

export function runDeclarativeFormConformanceSuite(
  options: DeclarativeFormConformanceOptions
): void {
  describe(options.suiteName, () => {
    const toolNames = new Set<string>();

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
      const name = `declarative_schema_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooltitle="Search" tooldescription="Search the catalog">
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
      expect(JSON.parse(tool.inputSchema ?? '')).toEqual({
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
      expect(JSON.parse(tool.inputSchema ?? '')).toMatchObject({
        properties: { query: { type: 'string', description: 'Search query' } },
      });
    });

    it('matches Chromium schema rules for associated, constrained, and omitted controls', async () => {
      const name = `declarative_schema_edges_${String(Date.now())}`;
      const formId = `declarative-form-${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} id="${formId}" toolname="${name}" tooldescription="Schema edges">
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
      expect(JSON.parse(tool.inputSchema ?? '')).toEqual({
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

    it('normalizes parameter names without trusting clobberable form properties', async () => {
      const name = `declarative_clobber_${String(Date.now())}`;
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
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Clobbering-safe form" toolautosubmit>
          <input name="  spaced  ">
          ${parameterNames
            .slice(1)
            .map((parameter) => `<input name="${parameter}">`)
            .join('')}
          <button type="submit">Submit</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected clobbering declarative form fixture');
      Reflect.apply(EventTarget.prototype.addEventListener, form, [
        'submit',
        (event: Event) => {
          if (!(event instanceof SubmitEvent)) return;
          event.preventDefault();
          event.respondWith(Promise.resolve('clobber-ok'));
        },
        { once: true },
      ]);

      const tool = await waitForTool(name);
      const schema = JSON.parse(tool.inputSchema ?? '');

      expect(Object.keys(schema.properties)).toEqual(parameterNames);
      expect(Object.hasOwn(schema.properties, '__proto__')).toBe(true);
      await expect(
        executeTool(
          tool,
          Object.fromEntries(parameterNames.map((parameter) => [parameter, parameter]))
        )
      ).resolves.toBe('clobber-ok');
    });

    it('fills controls, dispatches native events, and returns the submit response', async () => {
      const name = `declarative_execute_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Update search" toolautosubmit>
          <input id="declarative-query" name="query">
          <input id="declarative-limit" name="limit" type="number">
          <input id="declarative-safe" name="safe" type="checkbox">
          <input id="declarative-sort-new" name="sort" type="radio" value="new">
          <input id="declarative-sort-top" name="sort" type="radio" value="top">
          <textarea id="declarative-notes" name="notes"></textarea>
          <select id="declarative-tags" name="tags" multiple>
            <option value="typescript">TypeScript</option>
            <option value="webmcp">WebMCP</option>
            <option value="testing">Testing</option>
          </select>
          <button type="submit">Apply</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected declarative form fixture');

      const changed = new Set<string>();
      form.querySelectorAll<HTMLElement>('input, textarea, select').forEach((control) => {
        control.addEventListener('input', () => changed.add(`${control.id}:input`));
        control.addEventListener('change', () => changed.add(`${control.id}:change`));
      });
      let agentInvoked = false;
      window.addEventListener(
        'submit',
        (event) => {
          if (event.target !== form) return;
          agentInvoked = event.agentInvoked;
          event.preventDefault();
          event.respondWith(Promise.resolve({ accepted: false }));
          event.respondWith(Promise.resolve({ accepted: true }));
          event.stopImmediatePropagation();
        },
        { capture: true, once: true }
      );

      const result = await executeTool(await waitForTool(name), {
        query: 'declarative tools',
        limit: 25,
        safe: true,
        sort: 'top',
        notes: 'browser parity',
        tags: ['typescript', 'testing'],
      });

      expect(agentInvoked).toBe(true);
      expect(result && JSON.parse(result)).toEqual({ accepted: true });
      expect(form.elements.namedItem('query')).toHaveProperty('value', 'declarative tools');
      expect(form.elements.namedItem('limit')).toHaveProperty('value', '25');
      expect(form.elements.namedItem('safe')).toHaveProperty('checked', true);
      expect(document.querySelector('#declarative-sort-top')).toHaveProperty('checked', true);
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
          'declarative-notes:input',
          'declarative-notes:change',
          'declarative-tags:input',
          'declarative-tags:change',
        ])
      );
    });

    it('dispatches autosubmit before announcing tool activation', async () => {
      const name = `declarative_autosubmit_order_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Autosubmit order" toolautosubmit></form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected autosubmit-order declarative form fixture');
      const events: string[] = [];
      form.addEventListener('submit', (event) => {
        events.push('submit');
        event.preventDefault();
        event.respondWith(Promise.resolve());
      });
      window.addEventListener(
        'toolactivated',
        (event) => {
          if (Reflect.get(event, 'toolName') === name) events.push('activated');
        },
        { once: true }
      );

      await executeTool(await waitForTool(name), {});

      expect(events).toEqual(['submit', 'activated']);
    });

    it('honors native validation, novalidate, and formnovalidate during autosubmit', async () => {
      for (const validationBypass of ['novalidate', 'formnovalidate'] as const) {
        const name = `declarative_${validationBypass}_${String(Date.now())}`;
        toolNames.add(name);
        document.body.insertAdjacentHTML(
          'beforeend',
          `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Skip validation" toolautosubmit ${
            validationBypass === 'novalidate' ? 'novalidate' : ''
          }>
            <input name="required_value" required>
            <button type="submit" ${
              validationBypass === 'formnovalidate' ? 'formnovalidate' : ''
            }>Submit</button>
          </form>`
        );
        const form = document.querySelector<HTMLFormElement>(
          `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
        );
        if (!form) throw new Error('Expected validation-bypass declarative form fixture');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          event.respondWith(Promise.resolve(validationBypass));
        });

        await expect(executeTool(await waitForTool(name), {})).resolves.toBe(validationBypass);
      }

      const name = `declarative_validation_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Run validation" toolautosubmit>
          <input name="required_value" required>
          <button type="submit">Submit</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected validated declarative form fixture');
      let submitted = false;
      form.addEventListener('submit', () => {
        submitted = true;
      });

      await expect(executeTool(await waitForTool(name), {})).rejects.toBeDefined();
      expect(submitted).toBe(false);
    });

    it('resolves when a submit handler performs a direct form submission', async () => {
      const name = `declarative_direct_submit_${String(Date.now())}`;
      const frameName = `declarative-frame-${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Submit directly" toolautosubmit target="${frameName}" action="about:blank">
        </form>
        <iframe ${FIXTURE_ATTRIBUTE} name="${frameName}"></iframe>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected direct-submit declarative form fixture');

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
      const name = `declarative_external_submit_${String(Date.now())}`;
      const frameName = `declarative-external-frame-${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Submit outside a handler" target="${frameName}" action="about:blank">
          <button type="submit">Submit</button>
        </form>
        <iframe ${FIXTURE_ATTRIBUTE} name="${frameName}"></iframe>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const button = form?.querySelector<HTMLButtonElement>('button');
      if (!form || !button) throw new Error('Expected external-submit declarative form fixture');

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
        Promise.race([
          execution,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timed out waiting for direct submission')), 200)
          ),
        ])
      ).resolves.toBeDefined();
    });

    it('keeps manual-review calls pending until the focused submit button is used', async () => {
      const name = `declarative_manual_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Prepare a message">
          <input name="message">
          <button type="submit">Send</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const input = form?.elements.namedItem('message');
      const button = form?.querySelector<HTMLButtonElement>('button');
      if (!form || !(input instanceof HTMLInputElement) || !button) {
        throw new Error('Expected manual declarative form fixture');
      }

      let activatedWithValue = '';
      let activatedWithFocusedSubmitter = false;
      const onActivated = (event: Event) => {
        if (Reflect.get(event, 'toolName') !== name) return;
        activatedWithValue = input.value;
        activatedWithFocusedSubmitter = document.activeElement === button;
      };
      window.addEventListener('toolactivated', onActivated, { once: true });
      let syntheticAgentInvoked: boolean | undefined;
      form.addEventListener('submit', (event) => {
        if (!event.isTrusted) {
          syntheticAgentInvoked = event.agentInvoked;
          return;
        }
        event.preventDefault();
        event.respondWith(Promise.resolve('sent'));
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
      const name = `declarative_missing_submit_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Missing submit button">
          <input name="value" value="initial">
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const input = form?.elements.namedItem('value');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected missing-submit declarative form fixture');
      }

      await expect(
        executeTool(await waitForTool(name), { value: 'should not be applied' })
      ).rejects.toBeDefined();
      expect(input.value).toBe('initial');
    });

    it('cancels a pending manual-review call when the form is reset', async () => {
      const name = `declarative_reset_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Prepare resettable input">
          <input name="value" value="initial">
          <button type="submit">Save</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const input = form?.elements.namedItem('value');
      if (!form || !(input instanceof HTMLInputElement)) {
        throw new Error('Expected reset declarative form fixture');
      }

      const execution = executeTool(await waitForTool(name), { value: 'pending' });
      await waitForCondition(
        () => input.value === 'pending',
        'Timed out waiting for resettable declarative form to be filled'
      );
      expect(input.value).toBe('pending');
      form.reset();

      await expect(
        Promise.race([
          execution,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timed out waiting for reset cancellation')), 200)
          ),
        ])
      ).rejects.toMatchObject({ name: 'UnknownError' });
      expect(input.value).toBe('initial');
    });

    it('keeps a manual invocation active when reset is prevented', async () => {
      const name = `declarative_prevented_reset_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Prevent reset">
          <input name="value" value="initial">
          <button type="submit">Save</button>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const input = form?.elements.namedItem('value');
      const button = form?.querySelector<HTMLButtonElement>('button');
      if (!form || !(input instanceof HTMLInputElement) || !button) {
        throw new Error('Expected prevented-reset declarative form fixture');
      }
      form.addEventListener('reset', (event) => event.preventDefault());
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.respondWith(Promise.resolve('saved'));
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
      const name = `declarative_dynamic_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} id="declarative-first" toolname="${name}" tooldescription="First form">
          <input name="query">
        </form>
        <form ${FIXTURE_ATTRIBUTE} id="declarative-second" toolname="${name}" tooldescription="Second form">
          <input name="fallback">
        </form>`
      );
      const first = document.querySelector<HTMLFormElement>('#declarative-first');
      const second = document.querySelector<HTMLFormElement>('#declarative-second');
      const input = first?.elements.namedItem('query');
      if (!first || !second || !(input instanceof HTMLInputElement)) {
        throw new Error('Expected dynamic declarative form fixtures');
      }

      expect(await waitForTool(name)).toMatchObject({ description: 'First form' });
      expect(
        (await document.modelContext.getTools()).filter((tool) => tool.name === name)
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
      expect(JSON.parse(updated.inputSchema ?? '')).toEqual({
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
      const name = `declarative_autosubmit_change_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Autosubmit change"></form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected autosubmit-change declarative form fixture');
      await waitForTool(name);
      const changed = new Promise((resolve) => {
        document.modelContext.addEventListener('toolchange', resolve, { once: true });
      });

      form.setAttribute('toolautosubmit', '');

      await changed;
    });

    it('rejects invalid input transactionally before changing any control', async () => {
      const name = `declarative_transaction_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Transactional form" toolautosubmit>
          <input name="query" value="original">
          <select name="scope">
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      const query = form?.elements.namedItem('query');
      const scope = form?.elements.namedItem('scope');
      if (!form || !(query instanceof HTMLInputElement) || !(scope instanceof HTMLSelectElement)) {
        throw new Error('Expected transactional declarative form fixture');
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.respondWith(Promise.resolve('ok'));
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

    it('rejects a pending response when its declarative form is removed', async () => {
      const name = `declarative_removed_${String(Date.now())}`;
      toolNames.add(name);
      document.body.insertAdjacentHTML(
        'beforeend',
        `<form ${FIXTURE_ATTRIBUTE} toolname="${name}" tooldescription="Pending form" toolautosubmit>
          <input name="value">
        </form>`
      );
      const form = document.querySelector<HTMLFormElement>(
        `form[${FIXTURE_ATTRIBUTE}][toolname="${name}"]`
      );
      if (!form) throw new Error('Expected pending declarative form fixture');
      let submitted: (() => void) | undefined;
      const submission = new Promise<void>((resolve) => {
        submitted = resolve;
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.respondWith(new Promise(() => {}));
        submitted?.();
      });

      const execution = executeTool(await waitForTool(name), { value: 'pending' });
      await submission;
      form.remove();

      await expect(execution).rejects.toMatchObject({ name: 'UnknownError' });
    });
  });
}
