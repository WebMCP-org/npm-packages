import type { ChromeModelContext, RegisteredTool } from '@mcp-b/webmcp-types';
import type { JSONSchema7 } from 'json-schema';
import type {
  JsonSchemaExecutableToolDescriptor,
  JsonSchemaExecutableToolDescriptors,
  JsonSchemaToolDescriptor,
  JsonSchemaToolDescriptors,
} from './json-schema-types';
import { generateTypesFromJsonSchema as generateJsonSchemaTypes } from './json-schema-types';
import type { CodeNormalizer } from './normalize';
import { createCodeTool, renderCodeToolDescription, type CreateCodeToolOptions } from './tool';
import type { Executor } from './types';
import { isRecord } from './type-utils';
import { escapeJsDoc, sanitizeToolName } from './utils';

type ModelContextToolConsumer = Pick<ChromeModelContext, 'executeTool' | 'getTools'>;

export interface CreateCodeToolFromModelContextOptions {
  modelContext: ModelContextToolConsumer;
  executor: Executor;
  description?: string;
  maxDescriptionLength?: number;
  normalizeCode?: CodeNormalizer;
}

/**
 * Validates that a value looks like a JSON Schema object (has "type" or "properties").
 * This is a boundary check — WebMCP schemas are not guaranteed to be valid JSON Schema.
 */
function isJsonSchemaLike(value: unknown): value is JSONSchema7 {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === 'string' ||
    typeof value.properties === 'object' ||
    typeof value.$ref === 'string' ||
    Array.isArray(value.anyOf) ||
    Array.isArray(value.oneOf) ||
    Array.isArray(value.allOf)
  );
}

function registeredToolsByName(tools: RegisteredTool[]): Map<string, RegisteredTool> {
  const selected = new Map<string, RegisteredTool>();
  for (const tool of tools) {
    if (!selected.has(tool.name)) selected.set(tool.name, tool);
  }
  return selected;
}

/**
 * Convert WebMCP registered tools into codemode-compatible JSON Schema tool descriptors.
 */
export function registeredToolsToCodemode(tools: RegisteredTool[]): JsonSchemaToolDescriptors {
  const descriptors = Object.create(null) as JsonSchemaToolDescriptors;
  for (const tool of registeredToolsByName(tools).values()) {
    const inputSchema = parseRegisteredToolSchema(tool.inputSchema);

    const descriptor: JsonSchemaToolDescriptor = { inputSchema };

    if (tool.description !== undefined) {
      descriptor.description = tool.description;
    }
    descriptors[tool.name] = descriptor;
  }
  return descriptors;
}

function parseRegisteredToolSchema(serializedSchema?: string): JSONSchema7 {
  if (!serializedSchema) return { type: 'object' };

  try {
    const parsed = JSON.parse(serializedSchema);
    return isJsonSchemaLike(parsed) ? parsed : { type: 'object' };
  } catch {
    return { type: 'object' };
  }
}

function parseToolResult(serialized: string | null): unknown {
  if (serialized == null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return serialized;
  }

  if (!isRecord(parsed)) return parsed;

  const textBlock = Array.isArray(parsed.content)
    ? parsed.content.find(
        (block) =>
          isRecord(block) &&
          block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.trim() !== ''
      )
    : undefined;
  const text =
    isRecord(textBlock) && typeof textBlock.text === 'string' ? textBlock.text : undefined;

  if (parsed.isError === true) {
    throw new Error(text?.trim() || 'WebMCP tool execution failed');
  }

  if ('structuredContent' in parsed) {
    return parsed.structuredContent;
  }

  if (text !== undefined) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return parsed;
}

function buildCompactTypeBlock(tools: JsonSchemaToolDescriptors, omittedToolCount = 0): string {
  const lines = ['declare const codemode: {'];

  for (const [toolName, descriptor] of Object.entries(tools)) {
    const description = descriptor.description?.trim()
      ? escapeJsDoc(descriptor.description.trim().replace(/\r?\n/g, ' '))
      : escapeJsDoc(toolName);
    lines.push(`  /** ${description} */`);
    lines.push(
      `  ${sanitizeToolName(toolName)}: (input: Record<string, unknown>) => Promise<unknown>;`
    );
  }

  if (omittedToolCount > 0) {
    lines.push(
      `  /** ${omittedToolCount} more tool${omittedToolCount === 1 ? '' : 's'} omitted */`
    );
  }

  lines.push('}');
  return lines.join('\n');
}

function buildLimitedTypeBlock(
  tools: JsonSchemaToolDescriptors,
  descriptionTemplate: string | undefined,
  maxDescriptionLength: number
): string {
  const fitsWithinLimit = (types: string): boolean =>
    renderCodeToolDescription(types, descriptionTemplate).length <= maxDescriptionLength;

  const fullTypes = generateJsonSchemaTypes(tools);
  if (fitsWithinLimit(fullTypes)) {
    return fullTypes;
  }

  const compactTypes = buildCompactTypeBlock(tools);
  if (fitsWithinLimit(compactTypes)) {
    return compactTypes;
  }

  const entries = Object.entries(tools);
  for (let includedCount = entries.length - 1; includedCount >= 0; includedCount--) {
    const includedTools = Object.fromEntries(entries.slice(0, includedCount));
    const candidate = buildCompactTypeBlock(includedTools, entries.length - includedCount);
    if (fitsWithinLimit(candidate)) {
      return candidate;
    }
  }

  return buildCompactTypeBlock({}, entries.length);
}

async function buildCreateCodeToolOptions(
  options: CreateCodeToolFromModelContextOptions
): Promise<CreateCodeToolOptions> {
  const tools = await modelContextToCodemodeTools(options.modelContext);
  const createOptions: CreateCodeToolOptions = {
    tools,
    executor: options.executor,
  };

  if (options.maxDescriptionLength !== undefined) {
    const limitedTypes = buildLimitedTypeBlock(
      tools,
      options.description,
      options.maxDescriptionLength
    );
    createOptions.description = renderCodeToolDescription(limitedTypes, options.description);
  } else if (options.description !== undefined) {
    createOptions.description = options.description;
  }

  if (options.normalizeCode !== undefined) {
    createOptions.normalizeCode = options.normalizeCode;
  }

  return createOptions;
}

/**
 * Converts the current WebMCP document surface into executable codemode descriptors.
 */
export async function modelContextToCodemodeTools(
  modelContext: ModelContextToolConsumer
): Promise<JsonSchemaExecutableToolDescriptors> {
  const executeTool = modelContext.executeTool;
  if (!executeTool) {
    throw new Error('document.modelContext.executeTool is unavailable');
  }

  const initialTools = await modelContext.getTools();
  const registeredTools = registeredToolsByName(initialTools);
  const descriptors = registeredToolsToCodemode(initialTools);
  const executableTools = Object.create(null) as JsonSchemaExecutableToolDescriptors;

  for (const [name, descriptor] of Object.entries(descriptors)) {
    const source = registeredTools.get(name);
    if (!source) continue;

    const executableDescriptor: JsonSchemaExecutableToolDescriptor = {
      ...descriptor,
      execute: async (args: unknown) => {
        const tool = (await modelContext.getTools()).find(
          (candidate) =>
            candidate.name === name &&
            candidate.origin === source.origin &&
            candidate.window === source.window
        );
        if (!tool) {
          throw new Error(`WebMCP tool is unavailable: ${name}`);
        }

        const serialized = await executeTool.call(modelContext, tool, JSON.stringify(args ?? {}));
        return parseToolResult(serialized);
      },
    };

    executableTools[name] = executableDescriptor;
  }

  return executableTools;
}

/**
 * Creates a codemode AI SDK tool from the current WebMCP document surface.
 */
export async function createCodeToolFromModelContext(
  options: CreateCodeToolFromModelContextOptions
): Promise<ReturnType<typeof createCodeTool>> {
  return createCodeTool(await buildCreateCodeToolOptions(options));
}
