import type { ModelContextTesting, ToolListItem } from '@mcp-b/webmcp-types';
import type { JSONSchema7 } from 'json-schema';
import type {
  JsonSchemaExecutableToolDescriptor,
  JsonSchemaExecutableToolDescriptors,
  JsonSchemaToolDescriptor,
  JsonSchemaToolDescriptors,
} from './json-schema-types';
import { createCodeTool, type CreateCodeToolOptions } from './tool';
import type { CodeNormalizer } from './normalize';
import type { Executor } from './types';
import type { UnknownRecord } from './type-utils';

export interface CreateCodeToolFromModelContextTestingOptions {
  modelContextTesting: Pick<ModelContextTesting, 'listTools' | 'executeTool'>;
  executor: Executor;
  description?: string;
  normalizeCode?: CodeNormalizer;
}

/**
 * Validates that a value looks like a JSON Schema object (has "type" or "properties").
 * This is a boundary check — WebMCP schemas are not guaranteed to be valid JSON Schema.
 */
function isJsonSchemaLike(value: unknown): value is JSONSchema7 {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as UnknownRecord;
  return (
    typeof obj.type === 'string' ||
    typeof obj.properties === 'object' ||
    typeof obj.$ref === 'string' ||
    Array.isArray(obj.anyOf) ||
    Array.isArray(obj.oneOf) ||
    Array.isArray(obj.allOf)
  );
}

/**
 * Convert WebMCP tool list items (from `modelContext.listTools()`)
 * into codemode-compatible JSON Schema tool descriptors.
 */
export function webmcpToolsToCodemode(tools: ToolListItem[]): JsonSchemaToolDescriptors {
  const descriptors: JsonSchemaToolDescriptors = {};
  for (const tool of tools) {
    const inputSchema: JSONSchema7 = isJsonSchemaLike(tool.inputSchema)
      ? tool.inputSchema
      : { type: 'object' };

    const descriptor: JsonSchemaToolDescriptor = { inputSchema };

    if (tool.description !== undefined) {
      descriptor.description = tool.description;
    }
    if (isJsonSchemaLike(tool.outputSchema)) {
      descriptor.outputSchema = tool.outputSchema;
    }

    descriptors[tool.name] = descriptor;
  }
  return descriptors;
}

function parseTestingSchema(serializedSchema?: string): JSONSchema7 {
  if (!serializedSchema) return { type: 'object' };

  try {
    const parsed = JSON.parse(serializedSchema);
    return isJsonSchemaLike(parsed) ? parsed : { type: 'object' };
  } catch {
    return { type: 'object' };
  }
}

function parseTestingResult(serialized: string | null): unknown {
  if (serialized == null) return null;

  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

/**
 * Converts `navigator.modelContextTesting` into codemode-ready JSON Schema tool descriptors
 * with attached execute handlers.
 */
export function modelContextTestingToCodemodeTools(
  modelContextTesting: Pick<ModelContextTesting, 'listTools' | 'executeTool'>
): JsonSchemaExecutableToolDescriptors {
  const listedTools = modelContextTesting.listTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: parseTestingSchema(tool.inputSchema),
  }));

  const descriptors = webmcpToolsToCodemode(listedTools as unknown as ToolListItem[]);
  const executableTools: JsonSchemaExecutableToolDescriptors = {};

  for (const [name, descriptor] of Object.entries(descriptors)) {
    const executableDescriptor: JsonSchemaExecutableToolDescriptor = {
      ...descriptor,
      execute: async (args: unknown) => {
        const serialized = await modelContextTesting.executeTool(name, JSON.stringify(args ?? {}));
        return parseTestingResult(serialized);
      },
    };

    executableTools[name] = executableDescriptor;
  }

  return executableTools;
}

/**
 * Creates a codemode AI SDK tool directly from `navigator.modelContextTesting`.
 */
export function createCodeToolFromModelContextTesting(
  options: CreateCodeToolFromModelContextTestingOptions
): ReturnType<typeof createCodeTool> {
  const createOptions: CreateCodeToolOptions = {
    tools: modelContextTestingToCodemodeTools(options.modelContextTesting),
    executor: options.executor,
  };
  if (options.description !== undefined) {
    createOptions.description = options.description;
  }
  if (options.normalizeCode !== undefined) {
    createOptions.normalizeCode = options.normalizeCode;
  }

  return createCodeTool(createOptions);
}
