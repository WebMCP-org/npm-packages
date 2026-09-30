import type { JsonObject } from '@mcp-b/webmcp-ts-sdk';
import { expect, test } from '@playwright/test';

test.describe('Chrome WebMCP native smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const nativeContext = document.modelContext;
      if (!nativeContext) {
        throw new Error('Native WebMCP must be enabled before the MCP-B runtime starts');
      }
      window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__ = nativeContext;
    });
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
    const capturedNativeContext = await page.evaluate(() =>
      Boolean(window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__)
    );
    expect(capturedNativeContext).toBe(true);
  });

  test('exposes the native document.modelContext surface', async ({ page }) => {
    const surface = await page.evaluate(() => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      const activeContext = document.modelContext;

      return {
        hasDocumentModelContext: Boolean(context),
        hasRegisterTool: typeof context?.registerTool === 'function',
        hasGetTools: typeof context?.getTools === 'function',
        hasAddEventListener: typeof context?.addEventListener === 'function',
        hasExecuteTool: typeof context?.executeTool === 'function',
        hasDeprecatedNavigatorAlias: 'modelContext' in navigator,
        hasMcpBExtensions:
          activeContext !== undefined &&
          'listTools' in activeContext &&
          typeof activeContext.listTools === 'function',
      };
    });

    expect(surface.hasDocumentModelContext).toBe(true);
    expect(surface.hasRegisterTool).toBe(true);
    expect(surface.hasGetTools).toBe(true);
    expect(surface.hasAddEventListener).toBe(true);
    expect(surface.hasExecuteTool).toBe(true);
    expect(surface.hasDeprecatedNavigatorAlias).toBe(false);
    expect(surface.hasMcpBExtensions).toBe(true);
  });

  test('getTools returns valid RegisteredTool entries for every tool', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

      const isString = (value: unknown): value is string => typeof value === 'string';
      const isJsonObject = (value: unknown): value is JsonObject =>
        typeof value === 'object' && value !== null && !Array.isArray(value);
      const tools = await context.getTools();
      const invalidEntries: Array<{ index: number; reason: string }> = [];

      tools.forEach((tool, index) => {
        if (!isString(tool.name) || !tool.name) {
          invalidEntries.push({ index, reason: 'name' });
        }
        if (!isString(tool.description)) {
          invalidEntries.push({ index, reason: 'description' });
        }
        if (!isString(tool.origin)) {
          invalidEntries.push({ index, reason: 'origin' });
        }
        if (!tool.window || tool.window.window !== tool.window) {
          invalidEntries.push({ index, reason: 'window' });
        }
        if (tool.inputSchema !== undefined && !isJsonObject(tool.inputSchema)) {
          invalidEntries.push({ index, reason: 'inputSchema-type' });
        }
      });

      return { count: tools.length, invalidEntries };
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.invalidEntries).toEqual([]);
  });

  test('getTools tracks registerTool signal lifecycle operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
        before,
        afterRegister,
        hasToolAfterRegister,
        hasToolAfterUnregister: toolsAfterUnregister.some((tool) => tool.name === toolName),
      };
    });

    expect(result.afterRegister).toBeGreaterThanOrEqual(result.before + 1);
    expect(result.hasToolAfterRegister).toBe(true);
    expect(result.hasToolAfterUnregister).toBe(false);
  });

  test('getTools omits inputSchema when registration omits it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

      const noSchemaName = `beta_no_schema_${Date.now()}`;
      const undefinedSchemaName = `beta_undefined_schema_${Date.now()}`;
      const noSchemaController = new AbortController();
      const undefinedSchemaController = new AbortController();

      await context.registerTool(
        {
          name: noSchemaName,
          description: 'No explicit schema',
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        },
        { signal: noSchemaController.signal }
      );
      const undefinedSchemaTool = {
        name: undefinedSchemaName,
        description: 'Undefined schema',
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      };
      Object.defineProperty(undefinedSchemaTool, 'inputSchema', {
        configurable: true,
        enumerable: true,
        value: undefined,
      });
      await context.registerTool(undefinedSchemaTool, {
        signal: undefinedSchemaController.signal,
      });

      try {
        const tools = await context.getTools();
        const listedNoSchema = tools.find((tool) => tool.name === noSchemaName);
        const listedUndefinedSchema = tools.find((tool) => tool.name === undefinedSchemaName);
        if (!listedNoSchema || !listedUndefinedSchema) {
          throw new Error('Registered tools are missing from getTools()');
        }
        return {
          noSchemaIsUndefined: listedNoSchema.inputSchema === undefined,
          undefinedSchemaIsUndefined: listedUndefinedSchema.inputSchema === undefined,
        };
      } finally {
        noSchemaController.abort();
        undefinedSchemaController.abort();
      }
    });

    expect(result.noSchemaIsUndefined).toBe(true);
    expect(result.undefinedSchemaIsUndefined).toBe(true);
  });

  test('executeTool accepts a discovered tool descriptor and object inputs', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        return {
          withoutOptions: await context.executeTool(tool, { value: 7 }),
          withEmptyOptions: await context.executeTool(tool, { value: 8 }, {}),
        };
      } finally {
        controller.abort();
      }
    });

    expect(JSON.parse(result.withoutOptions)).toEqual({
      content: [{ type: 'text', text: 'beta:7' }],
    });
    expect(JSON.parse(result.withEmptyOptions)).toEqual({
      content: [{ type: 'text', text: 'beta:8' }],
    });
  });

  test('executeTool accepts array inputs', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        return await context.executeTool(tool, [1, 2, 3]);
      } finally {
        controller.abort();
      }
    });

    expect(JSON.parse(result)).toEqual({ content: [{ type: 'text', text: 'beta-array:1,2,3' }] });
  });

  test('executeTool rejects serialized JSON strings with TypeError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');
      const firstTool = (await context.getTools())[0];
      if (!firstTool) throw new Error('No registered tools');

      try {
        // @ts-expect-error Deliberately exercise the rejected legacy JSON-string input.
        await context.executeTool(firstTool, '{}');
        return { didThrow: false };
      } catch (error) {
        return {
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('TypeError');
    expect(result.message).toMatch(/input object|not an object/i);
  });

  test('executeTool rejects primitive inputs with TypeError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');
      const firstTool = (await context.getTools())[0];
      if (!firstTool) throw new Error('No registered tools');

      try {
        // @ts-expect-error Deliberately exercise the object-input boundary.
        await context.executeTool(firstTool, 7);
        return { didThrow: false };
      } catch (error) {
        return {
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('TypeError');
    expect(result.message).toMatch(/input object|not an object/i);
  });

  test('executeTool rejects a stale registered descriptor with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
      controller.abort();
      if (!tool) throw new Error(`Tool not found: ${toolName}`);

      try {
        await context.executeTool(tool, {});
        return { didThrow: false };
      } catch (error) {
        return {
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect((result.message ?? '').length).toBeGreaterThan(0);
  });

  test('executeTool maps thrown tool invocation failures to UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
      const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Tool not found: ${toolName}`);

      try {
        await context.executeTool(tool, {});
        return { didThrow: false };
      } catch (error) {
        return {
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        controller.abort();
      }
    });

    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect((result.message ?? '').length).toBeGreaterThan(0);
  });

  test('executeTool with aborted signal before call rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');
      const firstTool = (await context.getTools())[0];
      if (!firstTool) throw new Error('No registered tools');

      const controller = new AbortController();
      controller.abort();

      try {
        await context.executeTool(firstTool, {}, { signal: controller.signal });
        return { didThrow: false };
      } catch (error) {
        return {
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
        };
      }
    });

    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('AbortError');
  });

  test('executeTool with aborted signal during pending tool rejects', async ({ page }) => {
    const errorName = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        const controller = new AbortController();
        const pending = context.executeTool(tool, {}, { signal: controller.signal }).then(
          () => 'resolved',
          (error) => (error instanceof Error ? error.name : String(error))
        );

        setTimeout(() => controller.abort(), 10);
        return await pending;
      } finally {
        registrationController.abort();
      }
    });

    expect(errorName).toBe('AbortError');
  });

  test('multiple toolchange listeners receive events and survive listener errors', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const context = window.__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
      if (!context) throw new Error('Native document.modelContext is unavailable');

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
        firstCount,
        secondCount,
        sawRegisterNotification,
        sawAbortNotification,
        throwsListenerOperationsSucceeded,
      };
    });

    expect(result.sawRegisterNotification).toBe(true);
    expect(result.sawAbortNotification).toBe(true);
    expect(result.firstCount).toBe(result.secondCount);
    expect(result.throwsListenerOperationsSucceeded).toBe(true);
  });
});
