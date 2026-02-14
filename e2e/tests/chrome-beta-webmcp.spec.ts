import { expect, test } from '@playwright/test';

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

test.describe('Chrome Beta WebMCP Testing Flag Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Web Model Context API E2E Test');
  });

  test('exposes native modelContextTesting core API surface', async ({ page }) => {
    const surface = await page.evaluate(() => {
      const testing = (navigator as Navigator & { modelContextTesting?: Record<string, unknown> })
        .modelContextTesting;

      return {
        hasModelContext: typeof navigator.modelContext !== 'undefined',
        hasTesting: Boolean(testing),
        hasExecuteTool: typeof testing?.executeTool === 'function',
        hasListTools: typeof testing?.listTools === 'function',
        hasRegisterToolsChangedCallback:
          typeof testing?.registerToolsChangedCallback === 'function',
        hasCrossDocumentResult: typeof testing?.getCrossDocumentScriptToolResult === 'function',
        isPolyfill: testing?.__isWebMCPPolyfill === true,
      };
    });

    expect(surface.hasModelContext).toBe(true);
    expect(surface.hasTesting).toBe(true);
    expect(surface.hasExecuteTool).toBe(true);
    expect(surface.hasListTools).toBe(true);
    expect(surface.hasRegisterToolsChangedCallback).toBe(true);
    expect(surface.isPolyfill).toBe(false);

    // Diagnostics only: current Chrome Beta may not yet expose this method.
    console.log('hasCrossDocumentResult:', surface.hasCrossDocumentResult);
  });

  test('listTools returns valid RegisteredTool entries for every tool', async ({ page }) => {
    const result = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }

      const tools = testing.listTools();
      const invalidEntries: Array<{ index: number; reason: string }> = [];

      tools.forEach((tool, index) => {
        if (typeof tool.name !== 'string' || !tool.name) {
          invalidEntries.push({ index, reason: 'name' });
        }
        if (typeof tool.description !== 'string') {
          invalidEntries.push({ index, reason: 'description' });
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

  test('listTools tracks register/unregister operations', async ({ page }) => {
    const result = await page.evaluate(() => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const toolName = `beta_list_tracking_${Date.now()}`;
      const before = testing.listTools().length;
      context.registerTool({
        name: toolName,
        description: 'Tracking test tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      const afterRegister = testing.listTools().length;
      const hasToolAfterRegister = testing.listTools().some((tool) => tool.name === toolName);

      context.unregisterTool(toolName);
      const afterUnregister = testing.listTools().length;
      const hasToolAfterUnregister = testing.listTools().some((tool) => tool.name === toolName);

      return {
        missingApi: false,
        before,
        afterRegister,
        afterUnregister,
        hasToolAfterRegister,
        hasToolAfterUnregister,
      };
    });

    expect(result.missingApi).toBe(false);
    expect(result.afterRegister).toBeGreaterThanOrEqual(result.before + 1);
    expect(result.hasToolAfterRegister).toBe(true);
    expect(result.hasToolAfterUnregister).toBe(false);
  });

  test('listTools returns schema strings for tools registered without explicit inputSchema', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const nativeContext = context as unknown as {
        registerTool: (tool: unknown) => unknown;
        unregisterTool: (name: string) => void;
      };

      const noSchemaName = `beta_no_schema_${Date.now()}`;
      const undefinedSchemaName = `beta_undefined_schema_${Date.now()}`;

      nativeContext.registerTool({
        name: noSchemaName,
        description: 'No explicit schema',
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });
      nativeContext.registerTool({
        name: undefinedSchemaName,
        description: 'Undefined schema',
        inputSchema: undefined,
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      try {
        const tools = testing.listTools();
        const noSchemaTool = tools.find((tool) => tool.name === noSchemaName);
        const undefinedSchemaTool = tools.find((tool) => tool.name === undefinedSchemaName);

        const parseableOrEmpty = (value: unknown) => {
          if (typeof value !== 'string') {
            return false;
          }
          if (value.length === 0) {
            return true;
          }
          try {
            JSON.parse(value);
            return true;
          } catch {
            return false;
          }
        };

        return {
          missingApi: false,
          noSchemaType: typeof noSchemaTool?.inputSchema,
          undefinedSchemaType: typeof undefinedSchemaTool?.inputSchema,
          noSchemaParseable: parseableOrEmpty(noSchemaTool?.inputSchema),
          undefinedSchemaParseable: parseableOrEmpty(undefinedSchemaTool?.inputSchema),
        };
      } finally {
        nativeContext.unregisterTool(noSchemaName);
        nativeContext.unregisterTool(undefinedSchemaName);
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.noSchemaType).toBe('string');
    expect(result.undefinedSchemaType).toBe('string');
    expect(result.noSchemaParseable).toBe(true);
    expect(result.undefinedSchemaParseable).toBe(true);
  });

  test('executeTool accepts JSON object strings and returns string or null', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const toolName = `beta_exec_ok_${Date.now()}`;
      context.registerTool({
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
      });

      try {
        const withoutOptions = await testing.executeTool(toolName, JSON.stringify({ value: 7 }));
        const withEmptyOptions = await testing.executeTool(
          toolName,
          JSON.stringify({ value: 8 }),
          {}
        );
        return { missingApi: false, withoutOptions, withEmptyOptions };
      } finally {
        context.unregisterTool(toolName);
      }
    });

    expect(result.missingApi).toBe(false);
    expect(isDirectOrWrappedText(result.withoutOptions, 'beta:7')).toBe(true);
    expect(isDirectOrWrappedText(result.withEmptyOptions, 'beta:8')).toBe(true);
  });

  test('executeTool rejects invalid JSON with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }
      const firstTool = testing.listTools()[0];
      if (!firstTool) {
        return { missingApi: false, noTool: true };
      }

      try {
        await testing.executeTool(firstTool.name, '{invalid json');
        return { missingApi: false, noTool: false, didThrow: false };
      } catch (error) {
        return {
          missingApi: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/input arguments|parse/i);
  });

  test('executeTool rejects non-object JSON payloads with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }
      const firstTool = testing.listTools()[0];
      if (!firstTool) {
        return { missingApi: false, noTool: true };
      }

      try {
        await testing.executeTool(firstTool.name, '"not-an-object"');
        return { missingApi: false, noTool: false, didThrow: false };
      } catch (error) {
        return {
          missingApi: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/input arguments|parse/i);
  });

  test('executeTool rejects missing tools with UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }
      const toolName = `no_such_tool_${Date.now()}`;

      try {
        await testing.executeTool(toolName, '{}');
        return { missingApi: false, didThrow: false };
      } catch (error) {
        return {
          missingApi: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/tool not found/i);
  });

  test('executeTool maps thrown tool invocation failures to UnknownError', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const toolName = `beta_exec_throw_${Date.now()}`;
      context.registerTool({
        name: toolName,
        description: 'Always throws',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          throw new Error('boom');
        },
      });

      try {
        await testing.executeTool(toolName, '{}');
        return { missingApi: false, didThrow: false };
      } catch (error) {
        return {
          missingApi: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        context.unregisterTool(toolName);
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('executeTool with aborted signal before call rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }
      const firstTool = testing.listTools()[0];
      if (!firstTool) {
        return { missingApi: false, noTool: true };
      }

      const controller = new AbortController();
      controller.abort();

      try {
        await testing.executeTool(firstTool.name, '{}', { signal: controller.signal });
        return { missingApi: false, noTool: false, didThrow: false };
      } catch (error) {
        return {
          missingApi: false,
          noTool: false,
          didThrow: true,
          name: error instanceof Error ? error.name : String(error),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.noTool).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
  });

  test('executeTool with aborted signal during pending tool rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      const toolName = `beta_exec_abort_${Date.now()}`;
      context.registerTool({
        name: toolName,
        description: 'Slow abortable tool',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { content: [{ type: 'text', text: 'done' }] };
        },
      });

      try {
        const controller = new AbortController();
        const pending = testing
          .executeTool(toolName, '{}', { signal: controller.signal })
          .then((value) => ({ didThrow: false, value }))
          .catch((error) => ({
            didThrow: true,
            name: error instanceof Error ? error.name : String(error),
            message: error instanceof Error ? error.message : String(error),
          }));

        setTimeout(() => controller.abort(), 10);
        return { missingApi: false, ...(await pending) };
      } finally {
        context.unregisterTool(toolName);
      }
    });

    expect(result.missingApi).toBe(false);
    expect(result.didThrow).toBe(true);
    expect(result.name).toBe('UnknownError');
    expect(result.message).toMatch(/cancelled|invocation failed/i);
  });

  test('registerToolsChangedCallback rejects non-function callback inputs', async ({ page }) => {
    const result = await page.evaluate(() => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }

      const outcomes: Record<string, string> = {};
      const run = (label: string, value: unknown) => {
        try {
          testing.registerToolsChangedCallback(value as () => void);
          outcomes[label] = 'ok';
        } catch (error) {
          outcomes[label] = error instanceof Error ? error.name : String(error);
        }
      };

      run('null', null);
      run('undefined', undefined);
      run('number', 123);
      run('object', { cb: true });
      run('function', () => {});

      return { missingApi: false, outcomes };
    });

    expect(result.missingApi).toBe(false);
    expect(result.outcomes.null).toBe('TypeError');
    expect(result.outcomes.undefined).toBe('TypeError');
    expect(result.outcomes.number).toBe('TypeError');
    expect(result.outcomes.object).toBe('TypeError');
    expect(result.outcomes.function).toBe('ok');
  });

  test('registerToolsChangedCallback replaces prior callback and does not break operations when callback throws', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = navigator.modelContextTesting;
      if (!context || !testing) {
        return { missingApi: true };
      }

      let replacedCount = 0;
      let stableCount = 0;

      testing.registerToolsChangedCallback(() => {
        replacedCount += 1;
      });
      testing.registerToolsChangedCallback(() => {
        stableCount += 1;
      });

      const dynamicName = `beta_cb_dynamic_${Date.now()}`;
      const providedName = `beta_cb_provided_${Date.now()}`;

      context.registerTool({
        name: dynamicName,
        description: 'dynamic callback test',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });
      context.unregisterTool(dynamicName);
      context.provideContext({
        tools: [
          {
            name: providedName,
            description: 'provided callback test',
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'ok' }] };
            },
          },
        ],
      });
      context.clearContext();

      await new Promise((resolve) => setTimeout(resolve, 100));

      let throwsCallbackOperationsSucceeded = true;
      testing.registerToolsChangedCallback(() => {
        throw new Error('intentional callback failure');
      });
      try {
        context.registerTool({
          name: `beta_cb_throw_${Date.now()}`,
          description: 'throwing callback operation',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'ok' }] };
          },
        });
      } catch {
        throwsCallbackOperationsSucceeded = false;
      }

      return {
        missingApi: false,
        replacedCount,
        stableCount,
        throwsCallbackOperationsSucceeded,
      };
    });

    expect(result.missingApi).toBe(false);
    expect(result.replacedCount).toBe(0);
    expect(result.stableCount).toBeGreaterThanOrEqual(4);
    expect(result.throwsCallbackOperationsSucceeded).toBe(true);
  });

  test('getCrossDocumentScriptToolResult returns JSON string payload', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const testing = navigator.modelContextTesting;
      if (!testing) {
        return { missingApi: true };
      }

      const value = await testing.getCrossDocumentScriptToolResult();
      let parsedOk = false;
      try {
        JSON.parse(value);
        parsedOk = true;
      } catch {
        parsedOk = false;
      }

      return {
        missingApi: false,
        type: typeof value,
        parsedOk,
        valueLength: value.length,
      };
    });

    expect(result.missingApi).toBe(false);
    expect(result.type).toBe('string');
    expect(result.parsedOk).toBe(true);
    expect(result.valueLength).toBeGreaterThanOrEqual(2);
  });

  test('listTools returns stringified inputSchema for registered tools', async ({ page }) => {
    const listResult = await page.evaluate(async () => {
      const context = navigator.modelContext;
      const testing = (
        navigator as Navigator & {
          modelContextTesting?: {
            listTools: () => Array<{
              name: string;
              description: string;
              inputSchema?: string;
            }>;
          };
        }
      ).modelContextTesting;

      if (!context || !testing) {
        return { missingApi: true };
      }

      const toolName = `beta_schema_tool_${Date.now()}`;
      context.registerTool({
        name: toolName,
        description: 'Schema verification tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      try {
        const tools = testing.listTools();
        const tool = tools.find((t) => t.name === toolName);

        let parsedSchemaType: string | null = null;
        if (tool?.inputSchema) {
          try {
            const parsed = JSON.parse(tool.inputSchema) as { type?: string };
            parsedSchemaType = parsed.type ?? null;
          } catch {
            parsedSchemaType = null;
          }
        }

        return {
          missingApi: false,
          hasTool: Boolean(tool),
          inputSchemaType: typeof tool?.inputSchema,
          parsedSchemaType,
        };
      } finally {
        try {
          context.unregisterTool(toolName);
        } catch {
          // no-op
        }
      }
    });

    expect(listResult.missingApi).toBe(false);
    expect(listResult.hasTool).toBe(true);
    expect(listResult.inputSchemaType).toBe('string');
    expect(listResult.parsedSchemaType).toBe('object');
  });
});
