import type { JSONSchema7 } from 'json-schema';
import type { JsonSchemaToolDescriptor, JsonSchemaToolDescriptors } from './json-schema-types';

/**
 * Minimal subset of WebMCP's ToolListItem needed for conversion.
 * Avoids hard dependency on @mcp-b/webmcp-types at runtime.
 */
interface ToolListItem {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Convert WebMCP tool list items (from `modelContext.listTools()`)
 * into codemode-compatible JSON Schema tool descriptors.
 */
export function webmcpToolsToCodemode(tools: ToolListItem[]): JsonSchemaToolDescriptors {
  const descriptors: JsonSchemaToolDescriptors = {};
  for (const tool of tools) {
    const descriptor: JsonSchemaToolDescriptor = {
      inputSchema: (tool.inputSchema as JSONSchema7) ?? { type: 'object' },
    };
    if (tool.description !== undefined) {
      descriptor.description = tool.description;
    }
    if (tool.outputSchema) {
      descriptor.outputSchema = tool.outputSchema as JSONSchema7;
    }
    descriptors[tool.name] = descriptor;
  }
  return descriptors;
}
