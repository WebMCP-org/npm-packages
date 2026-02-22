/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateInExtensionWorker = defineTool({
  name: 'evaluate_in_extension_worker',
  description:
    'Execute a JavaScript expression in a Chrome extension background service worker. ' +
    'Useful for inspecting extension state (e.g., McpHub connections, offscreen status) ' +
    'that is not accessible from page contexts.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    expression: zod
      .string()
      .describe('JavaScript expression to evaluate in the service worker.'),
    extensionId: zod
      .string()
      .optional()
      .describe(
        'Extension ID to target. If omitted, the first extension service worker found is used.',
      ),
  },
  handler: async (request, response, context) => {
    const result = await context.evaluateInExtensionWorker(
      request.params.expression,
      request.params.extensionId,
    );
    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});
