import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ASSETS,
  hostPage,
  launchBrowser,
  openPage,
  pageLog,
  read,
  type Relay,
  serve,
  serveCdn,
  type Site,
  startRelay,
} from './harness.js';

const ECHO = `
  document.modelContext.registerTool({
    name: 'echo',
    description: 'Echo the input',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    execute: ({ text }) => ({ content: [{ type: 'text', text: 'echo:' + text }] }),
  });`;

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

async function relay(options: Parameters<typeof startRelay>[0] = {}): Promise<Relay> {
  const started = await startRelay(options);
  cleanup.push(() => started.close());
  return started;
}

async function pageFor(target: Pick<Relay, 'port' | 'id'>): Promise<{ site: Site; page: Page }> {
  const site = await serve({ '/': hostPage({ cdn, relay: target, script: ECHO }) });
  cleanup.push(() => site.close());
  const page = await openPage(browser, site.origin);
  cleanup.push(() => page.close());
  return { site, page };
}

async function seesEcho(target: Relay, page: Page, timeout = 15_000): Promise<void> {
  await vi
    .waitFor(async () => {
      expect(await target.pageTools()).toEqual(['echo']);
      expect(await target.call('echo', { text: 'x' })).toBe('echo:x');
    }, timeout)
    .catch((error: Error) => {
      throw new Error(
        `${error.message}\n--- page ---\n${pageLog(page)}\n--- relay ---\n${target.logs.join('')}`
      );
    });
}

describe('several relays', () => {
  it('joins the relay that owns the port and proxies its tools', async () => {
    const owner = await relay();
    const joiner = await relay({ port: owner.port, id: owner.id });
    const { page } = await pageFor(owner);

    await seesEcho(joiner, page);
    expect(await joiner.sources()).toMatchObject({ mode: 'client', count: 1 });
  });

  it('takes over when the owner exits, and the page follows', async () => {
    const owner = await relay();
    const joiner = await relay({ port: owner.port, id: owner.id });
    const { page } = await pageFor(owner);
    await seesEcho(joiner, page);

    await owner.close();
    await seesEcho(joiner, page, 30_000);
    expect(await joiner.sources()).not.toHaveProperty('mode', 'client');
  });

  it('ignores a relay with a different id', async () => {
    const other = await relay();
    const { page } = await pageFor({ port: other.port, id: 'someone-else' });
    await page.waitForTimeout(3_000);

    expect(await other.pageTools()).toEqual([]);
  });

  // Desktop apps bundle the relay and update on their own schedule, so the other relay on
  // the port is often an older release. Relays before 2.1 never greet the widget, so pages
  // cannot use them at all.
  describe.each(['2.3.1', '5.1.0'])('next to published %s', (version) => {
    it('joins it when it owns the port', async () => {
      const owner = await relay({ version, id: null });
      const joiner = await relay({ port: owner.port, id: null });
      const { page } = await pageFor(owner);

      await seesEcho(joiner, page);
    }, 120_000);

    it('lets it join when this relay owns the port', async () => {
      const owner = await relay({ id: null });
      const joiner = await relay({ version, port: owner.port, id: null });
      const { page } = await pageFor(owner);

      await seesEcho(joiner, page);
    }, 120_000);
  });
});

describe('one relay over time', () => {
  it('is found by a page that loaded before it started', async () => {
    const port = (await relay()).port;
    await cleanup.splice(0)[0]?.();
    const { page } = await pageFor({ port, id: `harness-${String(port)}` });
    await page.waitForTimeout(2_000);

    const late = await relay({ port });
    await seesEcho(late, page, 40_000);
  }, 60_000);

  it('is found again after it restarts', async () => {
    const first = await relay();
    const { page } = await pageFor(first);
    await seesEcho(first, page);

    await first.close();
    const second = await relay({ port: first.port });
    await seesEcho(second, page, 40_000);
  }, 60_000);
});

describe('origin policy', () => {
  it('accepts pages from an allowed origin', async () => {
    const port = await startRelay().then(async (probe) => {
      await probe.close();
      return probe.port;
    });
    const site = await serve({
      '/': hostPage({ cdn, relay: { port, id: 'policy' }, script: ECHO }),
    });
    cleanup.push(() => site.close());
    const allowed = await relay({ port, id: 'policy', args: ['--widget-origin', site.origin] });
    const page = await openPage(browser, site.origin);
    cleanup.push(() => page.close());

    await seesEcho(allowed, page);
  });

  it('rejects other origins without the page retrying in a loop', async () => {
    const strict = await relay({ args: ['--widget-origin', 'https://app.example'] });
    const { page } = await pageFor(strict);
    await page.waitForTimeout(5_000);

    expect(await strict.pageTools()).toEqual([]);
    const rejections = strict.logs.join('').match(/rejecting source/g) ?? [];
    expect(rejections.length).toBeLessThanOrEqual(2);
  });
});

it('keeps zod out of the browser bundles and the embed under 16 KB', () => {
  const embed = read(ASSETS.embed);
  expect(embed).not.toContain('__zod_globalConfig');
  expect(read(ASSETS.widget)).not.toContain('__zod_globalConfig');
  expect(Buffer.byteLength(embed)).toBeLessThan(16 * 1024);
});
