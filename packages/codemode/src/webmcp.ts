import type { JSONSchema7 } from 'json-schema';
import type { JsonSchemaToolDescriptor, JsonSchemaToolDescriptors } from './json-schema-types';
import type { UnknownRecord } from './type-utils';

/**
 * Minimal subset of WebMCP's ToolListItem needed for conversion.
 * Avoids hard dependency on @mcp-b/webmcp-types at runtime.
 */
interface ToolListItem {
  name: string;
  description?: string;
  inputSchema?: UnknownRecord;
  outputSchema?: UnknownRecord;
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
