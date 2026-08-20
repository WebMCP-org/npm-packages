import type { ChromeModelContextExtensions } from '@mcp-b/webmcp-types';
import { expect, test } from '@playwright/test';

type ChromeModelContext = NonNullable<Document['modelContext']> & ChromeModelContextExtensions;

function isDirectOrWrappedText(value: unknown, expectedText: string): boolean {
  if (value === expectedText) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return parsed.content?.[0]?.type === 'text' && parsed.content?.[0]?.text === expectedText;
  } catch {
    return false;
  }
}

test.describe('Chrome WebMCP native smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as Window & {
        __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        __WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__?: Navigator['modelContext'];
      };
      target.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = document.modelContext;
      target.__WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__ = navigator.modelContext;
    });
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('exposes the native document.modelContext surface', async ({ page }) => {
    const surface = await page.evaluate(() => {
      const raw = window as Window & {
        __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: ChromeModelContext;
        __WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__?: unknown;
      };
      const context = raw.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;

      return {
        hasDocumentModelContext: Boolean(context),
        hasRegisterTool: typeof context?.registerTool === 'function',
        hasGetTools: typeof context?.getTools === 'function',
        hasAddEventListener: typeof context?.addEventListener === 'function',
        executeToolType: typeof context?.executeTool,
        hasDeprecatedNavigatorAlias:
          typeof raw.__WEBMCP_RAW_NAVIGATOR_MODEL_CONTEXT__ !== 'undefined',
        isPolyfill:
          (context as (ChromeModelContext & { __isWebMCPPolyfill?: boolean }) | undefined)
            ?.__isWebMCPPolyfill === true,
      };
    });

    expect(surface.hasDocumentModelContext).toBe(true);
    expect(surface.hasRegisterTool).toBe(true);
    expect(surface.hasGetTools).toBe(true);
    expect(surface.hasAddEventListener).toBe(true);
    expect(['function', 'undefined']).toContain(surface.executeToolType);
    expect(surface.hasDeprecatedNavigatorAlias).toBe(false);
    expect(surface.isPolyfill).toBe(false);
  });

  test('getTools returns valid RegisteredTool entries for every tool', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      const tools = await context.getTools();
      const invalidEntries: Array<{ index: number; reason: string }> = [];

      tools.forEach((tool, index) => {
        if (typeof tool.name !== 'string' || !tool.name) {
          invalidEntries.push({ index, reason: 'name' });
        }
        if (typeof tool.description !== 'string') {
          invalidEntries.push({ index, reason: 'description' });
        }
        if (typeof tool.origin !== 'string') {
          invalidEntries.push({ index, reason: 'origin' });
        }
        if (typeof tool.window !== 'object') {
          invalidEntries.push({ index, reason: 'window' });
        }
        if (tool.inputSchema !== undefined) {
          if (typeof tool.inputSchema !== 'string') {
            invalidEntries.push({ index, reason: 'inputSchema-type' });
            return;
          }
          try {
            JSON.parse(tool.inputSchema);
          } catch {
            invalidEntries.push({ index, reason: 'inputSchema-json' });
          }
        }
      });

      return { missingApi: false, count: tools.length, invalidEntries };
    });

    expect(result.missingApi).toBe(false);
    expect(result.count).toBeGreaterThan(0);
    expect(result.invalidEntries).toEqual([]);
  });

  test('getTools tracks registerTool signal lifecycle operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      const toolName = `beta_list_tracking_${Date.now()}`;
      const controller = new AbortController();
      const before = (await context.getTools()).length;
      await context.registerTool(
        {
          name: toolName,
          description: 'Tracking test tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: controller.signal }
      );

      const toolsAfterRegister = await context.getTools();
      const afterRegister = toolsAfterRegister.length;
      const hasToolAfterRegister = toolsAfterRegister.some((tool) => tool.name === toolName);

      controller.abort();
      let toolsAfterUnregister = await context.getTools();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (!toolsAfterUnregister.some((tool) => tool.name === toolName)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        toolsAfterUnregister = await context.getTools();
      }

      return {
        missingApi: false,
        before,
        afterRegister,
        afterUnregister: toolsAfterUnregister.length,
        hasToolAfterRegister,
        hasToolAfterUnregister: toolsAfterUnregister.some((tool) => tool.name === toolName),
      };
    });

    expect(result.missingApi).toBe(false);
    if (result.missingApi) {
      throw new Error('document.modelContext not available');
    }
    expect(result.afterRegister).toBeGreaterThanOrEqual((result.before ?? 0) + 1);
    expect(result.hasToolAfterRegister).toBe(true);
    expect(result.hasToolAfterUnregister).toBe(false);
  });

  test('getTools omits inputSchema when registration omits it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      const nativeContext = context as {
        registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void>;
        getTools: NonNullable<Document['modelContext']>['getTools'];
      };
      const noSchemaName = `beta_no_schema_${Date.now()}`;
      const undefinedSchemaName = `beta_undefined_schema_${Date.now()}`;
      const noSchemaController = new AbortController();
      const undefinedSchemaController = new AbortController();

      await nativeContext.registerTool(
        {
          name: noSchemaName,
          description: 'No explicit schema',
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: noSchemaController.signal }
      );
      await nativeContext.registerTool(
        {
          name: undefinedSchemaName,
          description: 'Undefined schema',
          inputSchema: undefined,
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: undefinedSchemaController.signal }
      );

      try {
        const tools = await nativeContext.getTools();
        const noSchemaTool = tools.find((tool) => tool.name === noSchemaName);
        const undefinedSchemaTool = tools.find((tool) => tool.name === undefinedSchemaName);
        return {
          missingApi: false,
          noSchemaType: typeof noSchemaTool?.inputSchema,
          undefinedSchemaType: typeof undefinedSchemaTool?.inputSchema,
        };
      } finally {
        noSchemaController.abort();
        undefinedSchemaController.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.noSchemaType).toBe('undefined');
    expect(result.undefinedSchemaType).toBe('undefined');
  });

  test('executeTool accepts a discovered tool descriptor and JSON object strings', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `beta_exec_ok_${Date.now()}`;
      const controller = new AbortController();
      await context.registerTool(
        {
          name: toolName,
          description: 'executeTool happy path',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number' } },
            required: ['value'],
          },
          async execute(args: { value: number }) {
            return { content: [{ type: 'text', text: `beta:${args.value}` }] };
          },
        },
        { signal: controller.signal }
      );

      try {
        const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
        if (!tool) {
          return { missingApi: false, missingExecuteTool: false, missingTool: true };
        }
        const executeTool = context.executeTool.bind(context);
        const withoutOptions = await executeTool(tool, JSON.stringify({ value: 7 }));
        const withEmptyOptions = await executeTool(tool, JSON.stringify({ value: 8 }), {});
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          withoutOptions,
          withEmptyOptions,
        };
      } finally {
        controller.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.missingTool).toBe(false);
    expect(isDirectOrWrappedText(result.withoutOptions, 'beta:7')).toBe(true);
    expect(isDirectOrWrappedText(result.withEmptyOptions, 'beta:8')).toBe(true);
  });

  test('executeTool accepts JSON array strings', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `beta_exec_array_${Date.now()}`;
      const controller = new AbortController();
      await context.registerTool(
        {
          name: toolName,
          description: 'Accept an array input',
          inputSchema: { type: 'array', items: { type: 'number' } },
          async execute(args: number[]) {
            return { content: [{ type: 'text', text: `beta-array:${args.join(',')}` }] };
          },
        },
        { signal: controller.signal }
      );

      try {
        const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
        if (!tool) {
          return { missingApi: false, missingExecuteTool: false, missingTool: true };
        }
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          value: await context.executeTool(tool, JSON.stringify([1, 2, 3])),
        };
      } finally {
        controller.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.missingTool).toBe(false);
    expect(isDirectOrWrappedText(result.value, 'beta-array:1,2,3')).toBe(true);
  });

  test('executeTool rejects invalid JSON with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }
      const firstTool = (await context.getTools())[0];
      if (!firstTool) {
        return { missingApi: false, missingExecuteTool: false, noTool: true };
      }

      try {
        await context.executeTool(firstTool, '{invalid json');
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: false,
        };
      } catch (error) {
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/input arguments|parse/i);
  });

  test('executeTool rejects primitive JSON payloads with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }
      const firstTool = (await context.getTools())[0];
      if (!firstTool) {
        return { missingApi: false, missingExecuteTool: false, noTool: true };
      }

      try {
        await context.executeTool(firstTool, '"not-an-object"');
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: false,
        };
      } catch (error) {
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/input arguments|parse/i);
  });

  test('executeTool rejects a stale registered descriptor with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `beta_missing_${Date.now()}`;
      const controller = new AbortController();
      await context.registerTool(
        {
          name: toolName,
          description: 'Stale descriptor tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'never' }] };
          },
        },
        { signal: controller.signal }
      );
      const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) {
        controller.abort();
        return { missingApi: false, missingExecuteTool: false, missingTool: true };
      }
      controller.abort();

      try {
        await context.executeTool(tool, '{}');
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          didThrow: false,
        };
      } catch (error) {
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.missingTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect((result.message ?? '').length).toBeGreaterThan(0);
  });

  test('executeTool maps thrown tool invocation failures to UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `beta_exec_throw_${Date.now()}`;
      const controller = new AbortController();
      await context.registerTool(
        {
          name: toolName,
          description: 'Always throws',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            throw new Error('boom');
          },
        },
        { signal: controller.signal }
      );

      try {
        const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
        if (!tool) {
          return { missingApi: false, missingExecuteTool: false, missingTool: true };
        }
        await context.executeTool(tool, '{}');
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          didThrow: false,
        };
      } catch (error) {
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        controller.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.missingTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect((result.message ?? '').length).toBeGreaterThan(0);
  });

  test('executeTool with aborted signal before call rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }
      const firstTool = (await context.getTools())[0];
      if (!firstTool) {
        return { missingApi: false, missingExecuteTool: false, noTool: true };
      }

      const controller = new AbortController();
      controller.abort();

      try {
        await context.executeTool(firstTool, '{}', { signal: controller.signal });
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: false,
        };
      } catch (error) {
        return {
          missingApi: false,
          missingExecuteTool: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('AbortError');
  });

  test('executeTool with aborted signal during pending tool rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = ((
        window as Window & {
          __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
        }
      ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext) as
        | ChromeModelContext
        | undefined;
      if (!context) {
        return { missingApi: true };
      }
      if (typeof context.executeTool !== 'function') {
        return { missingApi: false, missingExecuteTool: true };
      }

      const toolName = `beta_exec_abort_${Date.now()}`;
      const registrationController = new AbortController();
      await context.registerTool(
        {
          name: toolName,
          description: 'Slow abortable tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return { content: [{ type: 'text', text: 'done' }] };
          },
        },
        { signal: registrationController.signal }
      );

      try {
        const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
        if (!tool) {
          return { missingApi: false, missingExecuteTool: false, missingTool: true };
        }
        const controller = new AbortController();
        const pending = context
          .executeTool(tool, '{}', { signal: controller.signal })
          .then((value) => ({ didThrow: false, value }))
          .catch((error: unknown) => ({
            didThrow: true,
            name: error instanceof Error ? error.name : String(error),
            message: error instanceof Error ? error.message : String(error),
          }));

        setTimeout(() => controller.abort(), 10);
        return {
          missingApi: false,
          missingExecuteTool: false,
          missingTool: false,
          ...(await pending),
        };
      } finally {
        registrationController.abort();
      }
    });

    expect(result.missingApi).toBe(false);
    test.skip(
      'missingExecuteTool' in result && result.missingExecuteTool === true,
      'Chrome does not expose its optional executeTool extension'
    );
    if (!('didThrow' in result)) {
      throw new Error('Unexpected executeTool result shape');
    }
    if (!('name' in result) || !('message' in result)) {
      throw new Error('Expected executeTool to throw an error');
    }
    expect(result.missingTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('AbortError');
  });

  test('multiple toolchange listeners receive events and survive listener errors', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const context =
        (
          window as Window & {
            __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: Document['modelContext'];
          }
        ).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ ?? document.modelContext;
      if (!context) {
        return { missingApi: true };
      }

      let firstCount = 0;
      let secondCount = 0;
      const waitFor = async (predicate: () => boolean) => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (predicate()) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return false;
      };

      context.addEventListener('toolchange', () => {
        firstCount += 1;
      });
      context.addEventListener('toolchange', () => {
        secondCount += 1;
      });

      const dynamicName = `beta_cb_dynamic_${Date.now()}`;
      const throwingName = `beta_cb_throw_${Date.now()}`;
      const dynamicController = new AbortController();
      const throwingController = new AbortController();

      await context.registerTool(
        {
          name: dynamicName,
          description: 'dynamic callback test',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: dynamicController.signal }
      );
      const sawRegisterNotification = await waitFor(() => firstCount >= 1 && secondCount >= 1);
      const firstCountAfterRegister = firstCount;
      const secondCountAfterRegister = secondCount;
      dynamicController.abort();
      const sawAbortNotification = await waitFor(
        () => firstCount > firstCountAfterRegister && secondCount > secondCountAfterRegister
      );

      let throwsListenerOperationsSucceeded = true;
      context.addEventListener('toolchange', () => {
        throw new Error('intentional listener failure');
      });
      try {
        await context.registerTool(
          {
            name: throwingName,
            description: 'throwing listener operation',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'ok' }] };
            },
          },
          { signal: throwingController.signal }
        );
      } catch {
        throwsListenerOperationsSucceeded = false;
      } finally {
        throwingController.abort();
      }

      return {
        missingApi: false,
        firstCount,
        secondCount,
        sawRegisterNotification,
        sawAbortNotification,
        throwsListenerOperationsSucceeded,
      };
    });

    expect(result.missingApi).toBe(false);
    expect(result.sawRegisterNotification).toBe(true);
    expect(result.sawAbortNotification).toBe(true);
    expect(result.firstCount).toBe(result.secondCount);
    expect(result.throwsListenerOperationsSucceeded).toBe(true);
  });
});
