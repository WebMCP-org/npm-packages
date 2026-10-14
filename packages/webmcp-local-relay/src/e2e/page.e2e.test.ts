import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  hostPage,
  launchBrowser,
  NATIVE,
  PUBLISHED_GLOBALS,
  type Runtime,
  openPage,
  type PageOptions,
  pageLog,
  type Relay,
  serve,
  serveCdn,
  type Site,
  type Sources,
  startRelay,
} from './harness.js';

/** The subset of a WebMCP tool the tests register from `page.evaluate`. */
interface PageTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, { type: string }> };
  execute(): { content: Array<{ type: 'text'; text: string }> };
}

declare global {
  interface Window {
    register(tool: PageTool): Promise<void>;
    unregister(name: string): void;
  }
}

/** Registers tools from the page, the way an app would. Returns nothing the test can poke. */
const TOOLS = `
  window.registrations = new Map();
  window.register = (tool) => {
    const controller = new AbortController();
    registrations.set(tool.name, controller);
    return document.modelContext.registerTool(tool, { signal: controller.signal });
  };
  window.unregister = (name) => registrations.get(name).abort();
  register({
    name: 'echo',
    description: 'Echo the input',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    execute: ({ text }) => ({ content: [{ type: 'text', text: 'echo:' + text }] }),
  });`;

// On native Chrome a page can also register tools with no runtime script at all.
const RUNTIMES: Runtime[] = ['global', 'polyfill', ...(NATIVE ? (['none'] as const) : [])];

let browser: Browser;
let cdn: Site;
const cleanup: Array<() => Promise<void>> = [];

beforeAll(async () => {
  browser = await launchBrowser();
  cdn = await serveCdn();
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
afterAll(async () => {
  await cdn.close();
  await browser.close();
});

async function setup(options: Omit<PageOptions, 'cdn' | 'relay'> = {}) {
  const relay = await startRelay();
  cleanup.push(() => relay.close());
  const site = await serve({ '/': hostPage({ cdn, relay, script: TOOLS, ...options }) });
  cleanup.push(() => site.close());
  const page = await open(site.origin);
  return { relay, site, page };
}

async function open(url: string): Promise<Page> {
  const page = await openPage(browser, url);
  cleanup.push(() => page.close());
  return page;
}

async function toolsBecome(relay: Relay, page: Page, names: string[]): Promise<void> {
  await vi
    .waitFor(async () => expect(await relay.pageTools()).toEqual(names), 15_000)
    .catch((error: Error) => {
      throw new Error(
        `${error.message}\n--- page ---\n${pageLog(page)}\n--- relay ---\n${relay.logs.join('')}`
      );
    });
}

async function sources(relay: Relay): Promise<Sources['sources']> {
  return (await relay.sources()).sources;
}

describe.each(RUNTIMES)('a page on %s', (runtime) => {
  it('exposes its tools and runs them', async () => {
    const { relay, page } = await setup({ runtime });
    await toolsBecome(relay, page, ['echo']);

    const [tool] = (await relay.client.listTools()).tools.filter((t) => t.name === 'echo');
    expect(tool?.description).toContain('Echo the input');
    expect(tool?.inputSchema).toMatchObject({ properties: { text: { type: 'string' } } });
    expect(await relay.call('echo', { text: 'hi' })).toBe('echo:hi');
    expect(await relay.call('webmcp_call_tool', { name: 'echo', arguments: { text: 'hi' } })).toBe(
      'echo:hi'
    );
  });

  it('follows tools registered and unregistered after connecting', async () => {
    const { relay, page } = await setup({ runtime });
    await toolsBecome(relay, page, ['echo']);

    await page.evaluate(() =>
      window.register({
        name: 'late',
        description: 'Registered after the relay connected',
        inputSchema: { type: 'object', properties: {} },
        execute: () => ({ content: [{ type: 'text', text: 'late' }] }),
      })
    );
    await toolsBecome(relay, page, ['echo', 'late']);
    expect(await relay.call('late')).toBe('late');
    // For clients that never refresh their tool list.
    expect(await relay.call('webmcp_call_tool', { name: 'late' })).toBe('late');

    await page.evaluate(() => window.unregister('echo'));
    await toolsBecome(relay, page, ['late']);
  });

  // WebMCP hides the thrown message behind an UnknownError whose text varies by browser.
  it('reports a thrown error as a tool error', async () => {
    const { relay, page } = await setup({
      runtime,
      script: `${TOOLS}
        register({
          name: 'boom',
          description: 'Throws',
          inputSchema: { type: 'object', properties: {} },
          execute: () => { throw new Error('kaboom'); },
        });`,
    });
    await toolsBecome(relay, page, ['boom', 'echo']);

    const result = await relay.client.callTool({ name: 'boom', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.any(String) }]);
  });

  it('aborts the page tool when the MCP client cancels the call', async () => {
    const { relay, page } = await setup({
      runtime,
      script: `${TOOLS}
        register({
          name: 'wait',
          description: 'Runs until aborted',
          inputSchema: { type: 'object', properties: {} },
          execute: (_input, { signal }) => {
            document.body.dataset.started = 'yes';
            return new Promise((resolve) => {
              signal.addEventListener('abort', () => {
                document.body.dataset.aborted = 'yes';
                resolve({ content: [{ type: 'text', text: 'aborted' }] });
              });
            });
          },
        });`,
    });
    await toolsBecome(relay, page, ['echo', 'wait']);

    const controller = new AbortController();
    const call = relay.client.callTool(
      { name: 'wait', arguments: {} },
      { signal: controller.signal }
    );
    const rejected = expect(call).rejects.toThrow();
    await vi.waitFor(async () =>
      expect(await page.evaluate(() => document.body.dataset.started)).toBe('yes')
    );
    controller.abort();
    await rejected;
    await vi.waitFor(async () =>
      expect(await page.evaluate(() => document.body.dataset.aborted)).toBe('yes')
    );
  });

  it('passes structured and plain results through', async () => {
    const { relay, page } = await setup({
      runtime,
      script: `${TOOLS}
        register({
          name: 'structured',
          description: 'Returns structured content',
          inputSchema: { type: 'object', properties: {} },
          execute: () => ({
            content: [{ type: 'text', text: 'total 3' }],
            structuredContent: { total: 3 },
          }),
        });`,
    });
    await toolsBecome(relay, page, ['echo', 'structured']);

    const result = await relay.client.callTool({ name: 'structured', arguments: {} });
    expect(result.structuredContent).toEqual({ total: 3 });
    expect(result.content).toEqual([{ type: 'text', text: 'total 3' }]);
  });

  // WebMCP accepts any JSON object as an input schema; MCP wants `type: 'object'`.
  it('keeps the other tools when one has an input schema MCP rejects', async () => {
    const { relay, page } = await setup({
      runtime,
      script: `${TOOLS}
        document.modelContext.registerTool({
          name: 'untyped',
          description: 'Input schema without a type',
          inputSchema: { properties: { q: { type: 'string' } } },
          execute: () => ({ content: [{ type: 'text', text: 'untyped' }] }),
        });`,
    });
    await toolsBecome(relay, page, ['echo', 'untyped']);
    expect(await relay.call('untyped', { q: 'x' })).toBe('untyped');
  });

  it('keeps one source across a reload and drops it when the tab closes', async () => {
    const { relay, page } = await setup({ runtime });
    await toolsBecome(relay, page, ['echo']);
    const [before] = await sources(relay);

    await page.reload();
    await vi.waitFor(async () => {
      const after = await sources(relay);
      expect(after).toHaveLength(1);
      expect(after[0]?.tabId).toBe(before?.tabId);
      expect(after[0]?.toolCount).toBe(1);
    }, 15_000);
    expect(await relay.call('echo', { text: 'again' })).toBe('echo:again');

    await page.close();
    await vi.waitFor(async () => expect(await sources(relay)).toEqual([]), 15_000);
    await toolsBecome(relay, page, []);
  });
});

// Pages pin their own runtime, so an older global can sit next to a newer embed. Its
// tools are listed; calling them needs object input, which arrived in 6.0.
it.each(PUBLISHED_GLOBALS)('lists the tools of a page on global %s', async (version) => {
  const { relay, page } = await setup({ runtime: `global@${version}` });
  await toolsBecome(relay, page, ['echo']);
});

it('keeps tools from two tabs apart when they share a name', async () => {
  const { relay, site, page } = await setup();
  await toolsBecome(relay, page, ['echo']);
  await open(site.origin);

  // The relay publishes tool changes after a debounce, so wait on the tools, not the sources.
  await vi.waitFor(async () => expect(await relay.pageTools()).toHaveLength(2), 15_000);
  const names = await relay.pageTools();
  for (const name of names) {
    expect(await relay.call(name, { text: name })).toBe(`echo:${name}`);
  }
});

it('keeps its own tools when a page tool takes one of their names', async () => {
  const { relay, page } = await setup({
    script: `${TOOLS}
      register({
        name: 'webmcp_list_tools',
        description: 'Clashes with the relay tool',
        inputSchema: { type: 'object', properties: {} },
        execute: () => ({ content: [{ type: 'text', text: 'page' }] }),
      });`,
  });
  await toolsBecome(relay, page, ['echo']);
  await page.evaluate(() =>
    window.register({
      name: 'late',
      description: 'Forces another sync',
      inputSchema: { type: 'object', properties: {} },
      execute: () => ({ content: [{ type: 'text', text: 'late' }] }),
    })
  );
  await toolsBecome(relay, page, ['echo', 'late']);

  expect(await relay.call('webmcp_list_tools')).not.toBe('page');
  const warnings = relay.logs.join('').match(/.*webmcp_list_tools.*/g) ?? [];
  expect(warnings).toEqual([expect.stringContaining('built-in')]);
});

it('relays a declarative form tool', async () => {
  const { relay, page } = await setup({
    script: '',
    body: `
      <form toolname="subscribe" tooldescription="Subscribe an email address" toolautosubmit>
        <input name="email" toolparamdescription="Email address" required />
      </form>
      <script>
        document.addEventListener('submit', (event) => {
          event.preventDefault();
          const email = String(new FormData(event.target).get('email'));
          document.body.dataset.subscribed = email;
          event.respondWith(Promise.resolve('subscribed:' + email));
        });
      </script>`,
  });
  await toolsBecome(relay, page, ['subscribe']);

  expect(await relay.call('subscribe', { email: 'a@b.c' })).toBe('subscribed:a@b.c');
  expect(await page.evaluate(() => document.body.dataset.subscribed)).toBe('a@b.c');
});

it('relays tools from a same-origin child frame', async () => {
  const relay = await startRelay();
  cleanup.push(() => relay.close());
  const frameTool = `
    document.modelContext.registerTool({
      name: 'from_frame',
      description: 'Registered by a child frame',
      inputSchema: { type: 'object', properties: {} },
      execute: () => ({ content: [{ type: 'text', text: 'frame' }] }),
    });`;
  const site = await serve({
    '/': hostPage({ cdn, relay, script: TOOLS, body: '<iframe src="/frame"></iframe>' }),
    '/frame': `<script src="${cdn.origin}/global.js"></script><script>${frameTool}</script>`,
  });
  cleanup.push(() => site.close());
  const page = await open(site.origin);

  await toolsBecome(relay, page, ['echo', 'from_frame']);
  expect(await relay.call('from_frame')).toBe('frame');
});

it('reads a page title with markup as plain text', async () => {
  const title = `</script><script>parent.document.body.dataset.injected='yes'</script> $' $& $$`;
  const { relay, page } = await setup({ title: title.replaceAll('<', '&lt;') });
  await toolsBecome(relay, page, ['echo']);

  expect((await sources(relay))[0]?.title).toBe(title);
  expect(await page.evaluate(() => document.body.dataset.injected)).toBeUndefined();
});

it('loads the widget when a CDN serves it as text/plain', async () => {
  const plainCdn = await serveCdn({ type: 'text/plain' });
  cleanup.push(() => plainCdn.close());
  const relay = await startRelay();
  cleanup.push(() => relay.close());
  const site = await serve({ '/': hostPage({ cdn: plainCdn, relay, script: TOOLS }) });
  cleanup.push(() => site.close());
  const page = await open(site.origin);

  await toolsBecome(relay, page, ['echo']);
});
