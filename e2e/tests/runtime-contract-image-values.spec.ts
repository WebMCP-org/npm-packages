import { expect, type Page, test } from '@playwright/test';
import {
  DESCRIBE_INPUT_IMAGE_TOOL_NAME,
  GET_BLOB_PNG_TOOL_NAME,
  GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME,
  GET_CANVAS_PNG_TOOL_NAME,
  GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME,
  GET_IMAGE_ELEMENT_PNG_TOOL_NAME,
  GET_SERIALIZED_PNG_TOOL_NAME,
  GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME,
  GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME,
  IMAGE_TEXT_SMOKE_TOOL_NAME,
  ONE_BY_ONE_PNG_BASE64,
} from '../runtime-contract/image-contract.js';
import { waitForRuntimePage } from './runtime-contract.helpers.js';

const imageRuntime = process.env.WEBMCP_E2E_RUNTIME === 'native' ? 'native' : 'polyfill';
const imagePagePath =
  imageRuntime === 'native'
    ? '/runtime-contract-image-native.html'
    : '/runtime-contract-image-polyfill.html';
const expectedRuntimeLabel = imageRuntime === 'native' ? 'image-native' : 'image-polyfill';

async function listDocumentToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tools = await document.modelContext.getTools();
    return tools.map((tool) => tool.name).sort();
  });
}

async function executeDocumentTool(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      const result = await document.modelContext.executeTool(tool, JSON.stringify(toolArgs));
      if (result === null) {
        return null;
      }
      return JSON.parse(result) as unknown;
    },
    { toolName: name, toolArgs: args }
  );
}

async function executeDocumentToolForError(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    await executeDocumentTool(page, name, args);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function expectImageExecutionError(errorMessage: string, polyfillMessage: string) {
  if (imageRuntime === 'native') {
    // Native runtimes do not surface tool exception text through
    // executeTool(); rejections map to a generic invocation-failure message.
    expect(errorMessage.length).toBeGreaterThan(0);
    return;
  }
  expect(errorMessage).toContain(polyfillMessage);
}

/**
 * Browser-source image serialization ({type: 'image', value} with a Blob,
 * canvas, or image element, mirroring the Prompt API content shape) is
 * optional for native runtimes until the WebMCP spec defines it. Detect
 * support by executing the Blob-backed tool: runtimes without support return
 * the raw object (no string `data`) or fail.
 */
async function supportsBrowserSourceImages(page: Page): Promise<boolean> {
  try {
    const result = await executeDocumentTool(page, GET_BLOB_PNG_TOOL_NAME, {});
    return (
      typeof (result as { data?: unknown } | null)?.data === 'string' &&
      (result as { data: string }).data.length > 0
    );
  } catch {
    return false;
  }
}

async function skipUnlessBrowserSourceImages(page: Page) {
  test.skip(
    !(await supportsBrowserSourceImages(page)),
    'Browser-source image serialization is not supported by this runtime (optional until spec text exists)'
  );
}

function expectPngImageValue(result: unknown) {
  expect(result).toMatchObject({
    type: 'image',
    mimeType: 'image/png',
  });
  expect(result).toHaveProperty('data', expect.any(String));

  const data = (result as { data: string }).data;
  const bytes = Buffer.from(data, 'base64');
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

test.describe('Runtime Contract - Image Values', () => {
  test.beforeEach(async ({ page }) => {
    await waitForRuntimePage(page, imagePagePath);
  });

  test('registers image contract tools through document.modelContext', async ({ page }) => {
    const toolNames = await listDocumentToolNames(page);

    expect(toolNames).toEqual(expect.arrayContaining([IMAGE_TEXT_SMOKE_TOOL_NAME]));

    const result = await executeDocumentTool(page, IMAGE_TEXT_SMOKE_TOOL_NAME, {
      message: 'ready',
    });
    expect(result).toMatchObject({
      text: 'image-smoke:ready',
      message: 'ready',
      runtime: expectedRuntimeLabel,
    });
  });

  test('supports WebMCP registration lifecycle on document.modelContext', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const toolName = `lifecycle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const controller = new AbortController();
      const events: string[] = [];

      document.modelContext.ontoolchange = () => {
        events.push('handler');
      };
      document.modelContext.addEventListener('toolchange', () => {
        events.push('listener');
      });

      const registration = document.modelContext.registerTool(
        {
          name: toolName,
          description: 'Temporary lifecycle contract tool',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { ok: true };
          },
        },
        { signal: controller.signal }
      );
      // Per the WebMCP spec, registerTool() returns undefined.
      const registerReturnsUndefined = registration === undefined;

      const afterRegister = (await document.modelContext.getTools()).some(
        (tool) => tool.name === toolName
      );

      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const afterAbort = (await document.modelContext.getTools()).some(
        (tool) => tool.name === toolName
      );

      document.modelContext.ontoolchange = null;
      return { registerReturnsUndefined, afterRegister, afterAbort, events };
    });

    expect(result.registerReturnsUndefined).toBe(true);
    expect(result.afterRegister).toBe(true);
    expect(result.afterAbort).toBe(false);
    expect(result.events).toContain('handler');
    expect(result.events).toContain('listener');
  });

  test('returns a serialized image value through document.modelContext.executeTool', async ({
    page,
  }) => {
    const result = await executeDocumentTool(page, GET_SERIALIZED_PNG_TOOL_NAME, {});

    expect(result).toEqual({
      type: 'image',
      data: ONE_BY_ONE_PNG_BASE64,
      mimeType: 'image/png',
    });
  });

  test('serializes a Blob-backed image value through document.modelContext.executeTool', async ({
    page,
  }) => {
    await skipUnlessBrowserSourceImages(page);

    const result = await executeDocumentTool(page, GET_BLOB_PNG_TOOL_NAME, {});

    expect(result).toEqual({
      type: 'image',
      data: ONE_BY_ONE_PNG_BASE64,
      mimeType: 'image/png',
    });
  });

  test('serializes a canvas-backed image value through document.modelContext.executeTool', async ({
    page,
  }) => {
    await skipUnlessBrowserSourceImages(page);

    const result = await executeDocumentTool(page, GET_CANVAS_PNG_TOOL_NAME, {});

    expectPngImageValue(result);
  });

  test('reports the actual encoded MIME type for unsupported canvas MIME requests', async ({
    page,
  }) => {
    await skipUnlessBrowserSourceImages(page);

    const result = await executeDocumentTool(page, GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME, {});

    expectPngImageValue(result);
  });

  test('serializes an image-element-backed image value through document.modelContext.executeTool', async ({
    page,
  }) => {
    await skipUnlessBrowserSourceImages(page);

    const result = await executeDocumentTool(page, GET_IMAGE_ELEMENT_PNG_TOOL_NAME, {});

    expectPngImageValue(result);
  });

  test('passes serialized image values into tool execution unchanged', async ({ page }) => {
    const result = await executeDocumentTool(page, DESCRIBE_INPUT_IMAGE_TOOL_NAME, {
      image: {
        type: 'image',
        data: ONE_BY_ONE_PNG_BASE64,
        mimeType: 'image/png',
      },
    });

    expect(result).toEqual({
      inputType: 'image',
      mimeType: 'image/png',
      dataLength: ONE_BY_ONE_PNG_BASE64.length,
    });
  });

  test('rejects unsupported image source values with a clear execution error', async ({ page }) => {
    await skipUnlessBrowserSourceImages(page);

    const errorMessage = await executeDocumentToolForError(
      page,
      GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME,
      {}
    );

    expectImageExecutionError(errorMessage, 'Image output value must include');
  });

  test('rejects Blob-backed image values without a MIME type', async ({ page }) => {
    await skipUnlessBrowserSourceImages(page);

    const errorMessage = await executeDocumentToolForError(
      page,
      GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME,
      {}
    );

    expectImageExecutionError(errorMessage, 'Image Blob output requires a mimeType or Blob.type');
  });

  test('rejects serialized image values without a MIME type', async ({ page }) => {
    await skipUnlessBrowserSourceImages(page);

    const errorMessage = await executeDocumentToolForError(
      page,
      GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME,
      {}
    );

    expectImageExecutionError(errorMessage, 'Image output value must include data and mimeType');
  });
});
