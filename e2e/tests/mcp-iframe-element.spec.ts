import { expect, type Page, test } from '@playwright/test';

const dynamicItemSnapshot = (page: Page) =>
  page.evaluate(() => {
    const element = window.mcpIframeHost.getMcpIframe();
    return {
      tool: element.exposedTools.includes('child-iframe_dynamic'),
      resource: element.exposedResources.some(
        (uri) => new URL(uri).searchParams.get('uri') === 'iframe://dynamic'
      ),
      prompt: element.exposedPrompts.includes('child-iframe_dynamic'),
    };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/mcp-iframe-host.html');
  await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');
});

test('bridges tools, resources, URI templates, and prompts', async ({ page }) => {
  const contract = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    const resource = (childUri: string) => {
      const match = element.exposedResources.find(
        (uri) => new URL(uri).searchParams.get('uri') === childUri
      );
      if (!match) throw new Error(`Missing resource: ${childUri}`);
      return match;
    };

    const tool = (await window.mcpIframeHost.getParentTool('calculate')) as {
      title?: string;
      annotations?: { readOnlyHint?: boolean };
    };
    const calculation = await window.mcpIframeHost.callTool('calculate', { a: 10, b: 20 });
    const calculationContent = calculation.content[0];
    const config = await window.mcpIframeHost.readResource(resource('iframe://config'));
    const value = await window.mcpIframeHost.readResourceTemplate(
      resource('iframe://values/{value}'),
      { value: 'a b' }
    );
    const path = await window.mcpIframeHost.readResourceTemplate(
      resource('iframe://paths/{+path}'),
      { path: 'a/b' }
    );
    const segments = await window.mcpIframeHost.readResourceTemplate(
      resource('iframe://segments/{segments*}'),
      { segments: ['one', 'two'] }
    );
    const fragment = await window.mcpIframeHost.readResourceTemplate(
      resource('iframe://fragment{#value}'),
      { value: 'a/b' }
    );
    const query = await window.mcpIframeHost.readResourceTemplate(
      resource('iframe://query{?q,lang}'),
      { q: 'a b', lang: 'en' }
    );
    const prompt = (await window.mcpIframeHost.getPrompt('summarize', { text: 'hello' })) as {
      messages: Array<{ content: { type: string; text?: string } }>;
    };

    return {
      tools: element.exposedTools,
      resourceCount: element.exposedResources.length,
      prompts: element.exposedPrompts,
      title: tool.title,
      readOnly: tool.annotations?.readOnlyHint,
      calculation:
        calculationContent?.type === 'text' ? calculationContent.text : calculationContent,
      config: config.contents[0],
      value: value.contents[0]?.uri,
      path: path.contents[0]?.uri,
      segments: segments.contents[0]?.uri,
      fragment: fragment.contents[0]?.uri,
      query: query.contents[0]?.uri,
      prompt: prompt.messages[0]?.content.text,
    };
  });

  expect(contract).toMatchObject({
    tools: ['child-iframe_calculate'],
    resourceCount: 6,
    prompts: ['child-iframe_summarize'],
    title: 'Add numbers',
    readOnly: true,
    calculation: '30',
    value: 'iframe://values/a%20b',
    path: 'iframe://paths/a/b',
    segments: 'iframe://segments/one,two',
    fragment: 'iframe://fragment#a/b',
    query: 'iframe://query?q=a%20b&lang=en',
    prompt: 'Summarize: hello',
  });
  expect(contract.config).toMatchObject({ uri: 'iframe://config' });
});

test('mirrors child list changes as one observable snapshot', async ({ page }) => {
  await page.evaluate(() => window.mcpIframeHost.setDynamicItems(true));
  await expect
    .poll(() => dynamicItemSnapshot(page))
    .toEqual({
      tool: true,
      resource: true,
      prompt: true,
    });

  await page.evaluate(() => window.mcpIframeHost.setDynamicItems(false));
  await expect
    .poll(() => dynamicItemSnapshot(page))
    .toEqual({
      tool: false,
      resource: false,
      prompt: false,
    });
});

test('reattaches once and lets the latest source replace a rapid channel change', async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    const parent = element.parentElement;
    if (!parent) throw new Error('Missing element parent');

    element.remove();
    const reattached = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true })
    );
    parent.appendChild(element);
    await reattached;

    element.setAttribute('channel', 'unreachable-channel');

    const ready = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true })
    );
    const source = new URL('/iframe-child.html', location.href);
    source.searchParams.set('supersede', String(Date.now()));
    element.setAttribute('channel', 'mcp-iframe');
    element.setAttribute('src', source.href);
    await ready;

    return {
      iframeCount: element.shadowRoot?.querySelectorAll('iframe').length,
      ready: element.ready,
      tools: element.exposedTools,
    };
  });

  expect(state).toEqual({
    iframeCount: 1,
    ready: true,
    tools: ['child-iframe_calculate'],
  });
});

test('keeps the replacement ready when an older refresh finishes', async ({ page }) => {
  const state = await page.evaluate(async () => {
    type ParentRegisterTool = (tool: unknown, options?: unknown) => Promise<void>;

    const element = window.mcpIframeHost.getMcpIframe();
    const modelContext = document.modelContext;
    if (!modelContext) throw new Error('Parent model context is unavailable');

    const writableModelContext = modelContext as unknown as {
      registerTool: ParentRegisterTool;
    };
    const originalRegisterTool = writableModelContext.registerTool;
    const registerTool = originalRegisterTool.bind(modelContext);
    const { promise: registrationGate, resolve: releaseRegistration } =
      Promise.withResolvers<void>();
    const { promise: firstRegistration, resolve: registrationCompleted } =
      Promise.withResolvers<void>();
    let delayNextRegistration = true;

    writableModelContext.registerTool = async (tool, options) => {
      await registerTool(tool, options);
      if (!delayNextRegistration) return;
      delayNextRegistration = false;
      registrationCompleted();
      await registrationGate;
    };

    try {
      const staleRefresh = element.refresh();
      await firstRegistration;

      const replacementReady = new Promise<void>((resolve) =>
        element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true })
      );
      const source = new URL(element.getAttribute('src') ?? '/iframe-child.html', location.href);
      source.searchParams.set('replacement', String(Date.now()));
      element.setAttribute('src', source.href);
      await replacementReady;

      releaseRegistration();
      const staleRefreshRejected = await staleRefresh.then(
        () => false,
        () => true
      );
      const calculation = await window.mcpIframeHost.callTool('calculate', { a: 2, b: 3 });
      const content = calculation.content[0];
      return {
        ready: element.ready,
        tools: element.exposedTools,
        staleRefreshRejected,
        result: content?.type === 'text' ? content.text : content,
      };
    } finally {
      releaseRegistration();
      writableModelContext.registerTool = originalRegisterTool;
    }
  });

  expect(state).toEqual({
    ready: true,
    tools: ['child-iframe_calculate'],
    staleRefreshRejected: true,
    result: '5',
  });
});

test('clears parent registrations when the child session closes', async ({ page }) => {
  await page.evaluate(() => window.mcpIframeHost.stopChildRuntime());
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const element = window.mcpIframeHost.getMcpIframe();
        return {
          ready: element.ready,
          tools: element.exposedTools,
          resources: element.exposedResources,
          prompts: element.exposedPrompts,
          parentTool: await window.mcpIframeHost.getParentTool('calculate'),
        };
      })
    )
    .toEqual({ ready: false, tools: [], resources: [], prompts: [], parentTool: undefined });
});

test('validates attributes, reconnects cross-origin, and supports a custom tag entry', async ({
  context,
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });

  const timeout = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    element.setAttribute('call-timeout', '10');
    const timedOut = await window.mcpIframeHost
      .callTool('calculate', { a: 1, b: 2, delayMs: 50 })
      .then(() => false)
      .catch(() => true);

    element.setAttribute('call-timeout', 'not-a-number');
    const fallback = await window.mcpIframeHost.callTool('calculate', {
      a: 1,
      b: 2,
      delayMs: 20,
    });
    const fallbackContent = fallback.content[0];

    return {
      timedOut,
      fallback: fallbackContent?.type === 'text' ? fallbackContent.text : fallbackContent,
    };
  });
  expect(timeout).toEqual({ timedOut: true, fallback: '3' });

  const recovered = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    const failed = new Promise<string>((resolve) =>
      element.addEventListener('mcp-iframe-error', (event) => resolve(String(event.detail.error)), {
        once: true,
      })
    );
    element.setAttribute('target-origin', '');
    const error = await failed;

    const ready = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true })
    );
    element.setAttribute('target-origin', location.origin);
    await ready;
    return { error, ready: element.ready };
  });
  expect(recovered.error).toContain('target-origin cannot be empty');
  expect(recovered.ready).toBe(true);

  const attributes = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    const renamed = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-items-changed', () => resolve(), { once: true })
    );
    element.id = 'renamed frame';
    await renamed;

    const separated = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-items-changed', () => resolve(), { once: true })
    );
    element.setAttribute('prefix-separator', ':');
    await separated;
    element.setAttribute('loading', 'eager');
    element.setAttribute('width', '500');

    return {
      prefix: element.itemPrefix,
      tools: element.exposedTools,
      loading: element.iframe?.getAttribute('loading'),
      width: element.iframe?.getAttribute('width'),
      inlineWidth: element.iframe?.style.width,
    };
  });
  expect(attributes).toEqual({
    prefix: 'renamed_frame_',
    tools: ['renamed_frame_calculate'],
    loading: 'eager',
    width: '500',
    inlineWidth: '',
  });

  const opaqueOriginError = await page.evaluate(async () => {
    const element = document.createElement('mcp-iframe');
    element.setAttribute('sandbox', 'allow-scripts');
    element.setAttribute('srcdoc', '');
    const error = new Promise<string>((resolve) =>
      element.addEventListener('mcp-iframe-error', (event) => resolve(String(event.detail.error)), {
        once: true,
      })
    );
    document.body.appendChild(element);
    try {
      return await error;
    } finally {
      element.remove();
    }
  });
  expect(opaqueOriginError).toContain('target-origin="*"');

  const crossOrigin = await page.evaluate(async () => {
    const element = window.mcpIframeHost.getMcpIframe();
    const crossOrigin = new URL('/iframe-child.html', location.href);
    crossOrigin.hostname = location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    crossOrigin.searchParams.set('allow-tools-policy', '1');
    const crossReady = new Promise<void>((resolve) =>
      element.addEventListener('mcp-iframe-ready', () => resolve(), { once: true })
    );
    element.setAttribute('target-origin', crossOrigin.origin);
    element.setAttribute('src', crossOrigin.href);
    await crossReady;
    const crossResult = await window.mcpIframeHost.callTool('calculate', { a: 2, b: 3 });
    const crossContent = crossResult.content[0];

    return {
      tools: element.exposedTools,
      origin: element.getAttribute('target-origin'),
      result: crossContent?.type === 'text' ? crossContent.text : crossContent,
    };
  });
  const expectedCrossOrigin = new URL(page.url());
  expectedCrossOrigin.hostname =
    expectedCrossOrigin.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  expect(crossOrigin).toEqual({
    tools: ['renamed_frame_calculate'],
    origin: expectedCrossOrigin.origin,
    result: '5',
  });
  expect(warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Invalid call-timeout'),
      expect.stringContaining('Invalid prefix-separator'),
    ])
  );

  const customPage = await context.newPage();
  await customPage.goto('/mcp-iframe-host.html?custom=1');
  await expect(customPage.locator('body')).toHaveAttribute('data-status', 'ready');
  const custom = await customPage.evaluate(async () => ({
    tagName: window.mcpIframeHost.getMcpIframe().localName,
    result: await window.mcpIframeHost.callTool('calculate', { a: 3, b: 4 }),
  }));
  expect(custom.tagName).toBe('custom-mcp-iframe');
  expect(custom.result.content[0]).toMatchObject({ type: 'text', text: '7' });
});

test('surfaces parent registration failures instead of announcing partial readiness', async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const controller = new AbortController();
    await document.modelContext?.registerTool(
      {
        name: 'blocked_calculate',
        description: 'Blocks the iframe registration',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'blocked' }] };
        },
      },
      { signal: controller.signal }
    );

    const element = window.mcpIframeHost.getMcpIframe();
    const failed = new Promise<string>((resolve) =>
      element.addEventListener('mcp-iframe-error', (event) => resolve(String(event.detail.error)), {
        once: true,
      })
    );
    element.id = 'blocked';
    const error = await failed;
    controller.abort();
    return { error, ready: element.ready, tools: element.exposedTools };
  });

  expect(state.error).toContain('already registered');
  expect(state).toMatchObject({ ready: false, tools: [] });
});
