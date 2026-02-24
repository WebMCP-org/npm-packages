/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFile} from 'node:fs/promises';

import {zod} from '../third_party/index.js';
import type {Frame, JSHandle, Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function or inject a script file into the currently selected page.

When \`function\` is provided, evaluates it and returns the result as JSON (values must be JSON-serializable).
When \`filePath\` is provided, reads the file from disk and injects it as a <script> tag (useful for large scripts like polyfills that are too big to pass inline).
Exactly one of \`function\` or \`filePath\` must be provided.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: zod
      .string()
      .optional()
      .describe(
        `A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: \`() => {
  return document.title
}\` or \`async () => {
  return await fetch("example.com")
}\`.
Example with arguments: \`(el) => {
  return el.innerText;
}\`
`,
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'Absolute path to a local JavaScript file to inject into the page via <script> tag. The file is read server-side so there are no size limits or CSP/mixed-content restrictions. Use this for large scripts (polyfills, bundled tools, etc).',
      ),
    args: zod
      .array(
        zod.object({
          uid: zod
            .string()
            .describe(
              'The uid of an element on the page from the page content snapshot',
            ),
        }),
      )
      .optional()
      .describe(
        `An optional list of arguments to pass to the function. Only used with \`function\`, not \`filePath\`.`,
      ),
  },
  handler: async (request, response, context) => {
    const {filePath} = request.params;

    // File injection mode
    if (filePath) {
      if (request.params.function) {
        throw new Error(
          'Provide either `function` or `filePath`, not both.',
        );
      }
      const content = await readFile(filePath, 'utf-8');
      const page = context.getSelectedPage();
      await page.addScriptTag({content});
      response.appendResponseLine(
        `Injected script from \`${filePath}\` (${content.length} bytes) into page.`,
      );
      return;
    }

    // Function evaluation mode (original behavior)
    if (!request.params.function) {
      throw new Error('Either `function` or `filePath` must be provided.');
    }

    const args: Array<JSHandle<unknown>> = [];
    try {
      const frames = new Set<Frame>();
      for (const el of request.params.args ?? []) {
        const handle = await context.getElementByUid(el.uid);
        frames.add(handle.frame);
        args.push(handle);
      }
      let pageOrFrame: Page | Frame;
      // We can't evaluate the element handle across frames
      if (frames.size > 1) {
        throw new Error(
          "Elements from different frames can't be evaluated together.",
        );
      } else {
        pageOrFrame = [...frames.values()][0] ?? context.getSelectedPage();
      }
      const fn = await pageOrFrame.evaluateHandle(
        `(${request.params.function})`,
      );
      args.unshift(fn);
      await context.waitForEventsAfterAction(async () => {
        const result = await pageOrFrame.evaluate(
          async (fn, ...args) => {
            // @ts-expect-error no types.
            return JSON.stringify(await fn(...args));
          },
          ...args,
        );
        response.appendResponseLine('Script ran on page and returned:');
        response.appendResponseLine('```json');
        response.appendResponseLine(`${result}`);
        response.appendResponseLine('```');
      });
    } finally {
      void Promise.allSettled(args.map(arg => arg.dispose()));
    }
  },
});
