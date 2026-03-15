import type { ToolSet } from 'ai';
import { asSchema } from 'ai';
import type { JSONSchema7 } from 'json-schema';
import type { ZodType } from 'zod';
import { type ConversionContext, jsonSchemaToTypeString } from './json-schema-types';
import type { ToolFunction } from './types';
import type { UnknownRecord } from './type-utils';
import { escapeJsDoc, sanitizeToolName, toPascalCase } from './utils';

export interface ToolDescriptor {
  description?: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  execute?: ToolFunction;
}

export type ToolDescriptors = Record<string, ToolDescriptor>;

// --- Schema detection helpers ---

function hasZodMarker(value: object): boolean {
  return '_zod' in value && (value as UnknownRecord)._zod !== undefined;
}

function hasStandardMarker(value: object): boolean {
  return '~standard' in value && (value as UnknownRecord)['~standard'] !== undefined;
}

function isZodSchema(value: unknown): value is ZodType {
  return value !== null && typeof value === 'object' && hasZodMarker(value);
}

function isStandardSchema(value: unknown): boolean {
  return value !== null && typeof value === 'object' && hasStandardMarker(value);
}

function findJsonSchemaInSymbols(value: object): JSONSchema7 | null {
  for (const sym of Object.getOwnPropertySymbols(value)) {
    const symValue = (value as Record<symbol, unknown>)[sym];
    if (symValue && typeof symValue === 'object' && 'jsonSchema' in symValue) {
      return (symValue as { jsonSchema: JSONSchema7 }).jsonSchema;
    }
  }
  return null;
}

function isJsonSchemaWrapper(value: unknown): value is { jsonSchema: JSONSchema7 } {
  if (value === null || typeof value !== 'object') return false;
  if ('jsonSchema' in value) return true;
  return findJsonSchemaInSymbols(value) !== null;
}

function extractJsonSchema(wrapper: unknown): JSONSchema7 | null {
  if (wrapper === null || typeof wrapper !== 'object') return null;
  if ('jsonSchema' in wrapper) {
    return (wrapper as { jsonSchema: JSONSchema7 }).jsonSchema;
  }
  return findJsonSchemaInSymbols(wrapper);
}

// --- Description extraction ---

function extractDescriptions(schema: unknown): Record<string, string> {
  const descriptions: Record<string, string> = {};

  const shape = (schema as UnknownRecord).shape;
  if (shape && typeof shape === 'object') {
    for (const [fieldName, fieldSchema] of Object.entries(shape as UnknownRecord)) {
      let s = fieldSchema as { description?: string; unwrap?: () => unknown } | null;
      while (s && !s.description && typeof s.unwrap === 'function') {
        s = s.unwrap() as typeof s;
      }
      if (s?.description) {
        descriptions[fieldName] = s.description;
      }
    }
    return descriptions;
  }

  if (isJsonSchemaWrapper(schema)) {
    const jsonSchema = extractJsonSchema(schema);
    if (jsonSchema?.properties) {
      for (const [fieldName, propSchema] of Object.entries(jsonSchema.properties)) {
        if (propSchema && typeof propSchema === 'object' && propSchema.description) {
          descriptions[fieldName] = propSchema.description;
        }
      }
    }
  }

  return descriptions;
}

function extractParamDescriptions(schema: unknown): string[] {
  const descs = extractDescriptions(schema);
  return Object.entries(descs).map(([fieldName, desc]) => `@param input.${fieldName} - ${desc}`);
}

// --- Schema → TypeScript ---

function safeSchemaToTs(schema: unknown, typeName: string): string {
  try {
    if (isZodSchema(schema) || isStandardSchema(schema)) {
      const wrapped = asSchema(schema as ZodType);
      const jsonSchema = wrapped.jsonSchema as JSONSchema7;
      if (jsonSchema) {
        const ctx: ConversionContext = {
          root: jsonSchema,
          depth: 0,
          seen: new Set(),
          maxDepth: 20,
        };
        const typeBody = jsonSchemaToTypeString(jsonSchema, '', ctx);
        return `type ${typeName} = ${typeBody}`;
      }
    }

    if (isJsonSchemaWrapper(schema)) {
      const jsonSchema = extractJsonSchema(schema);
      if (jsonSchema) {
        const ctx: ConversionContext = {
          root: jsonSchema,
          depth: 0,
          seen: new Set(),
          maxDepth: 20,
        };
        const typeBody = jsonSchemaToTypeString(jsonSchema, '', ctx);
        return `type ${typeName} = ${typeBody}`;
      }
    }

    return `type ${typeName} = unknown`;
  } catch {
    return `type ${typeName} = unknown`;
  }
}

// --- Main type generation ---

function buildToolSignature(
  toolName: string,
  safeName: string,
  typeName: string,
  description: string | undefined,
  inputSchema: unknown,
  outputSchema: unknown | undefined
): { types: string; declaration: string } {
  const inputType = safeSchemaToTs(inputSchema, `${typeName}Input`);
  const outputType = outputSchema
    ? safeSchemaToTs(outputSchema, `${typeName}Output`)
    : `type ${typeName}Output = unknown`;

  let types = `\n${inputType.trim()}`;
  types += `\n${outputType.trim()}`;

  const paramDescs = (() => {
    try {
      return inputSchema ? extractParamDescriptions(inputSchema) : [];
    } catch {
      return [];
    }
  })();

  const jsdocLines: string[] = [];
  if (description?.trim()) {
    jsdocLines.push(escapeJsDoc(description.trim().replace(/\r?\n/g, ' ')));
  } else {
    jsdocLines.push(escapeJsDoc(toolName));
  }
  for (const pd of paramDescs) {
    jsdocLines.push(escapeJsDoc(pd.replace(/\r?\n/g, ' ')));
  }

  const jsdocBody = jsdocLines.map((l) => `\t * ${l}`).join('\n');
  let declaration = `\n\t/**\n${jsdocBody}\n\t */`;
  declaration += `\n\t${safeName}: (input: ${typeName}Input) => Promise<${typeName}Output>;`;
  declaration += '\n';

  return { types, declaration };
}

export function generateTypes(tools: ToolDescriptors | ToolSet): string {
  let availableTools = '';
  let availableTypes = '';

  for (const [toolName, t] of Object.entries(tools)) {
    const safeName = sanitizeToolName(toolName);
    const typeName = toPascalCase(safeName);

    try {
      const inputSchema = 'inputSchema' in t ? t.inputSchema : t.parameters;
      const outputSchema = 'outputSchema' in t ? t.outputSchema : undefined;

      const { types, declaration } = buildToolSignature(
        toolName,
        safeName,
        typeName,
        t.description,
        inputSchema,
        outputSchema
      );
      availableTypes += types;
      availableTools += declaration;
    } catch {
      availableTypes += `\ntype ${typeName}Input = unknown`;
      availableTypes += `\ntype ${typeName}Output = unknown`;

      availableTools += `\n\t/**\n\t * ${escapeJsDoc(toolName)}\n\t */`;
      availableTools += `\n\t${safeName}: (input: ${typeName}Input) => Promise<${typeName}Output>;`;
      availableTools += '\n';
    }
  }

  availableTools = `\ndeclare const codemode: {${availableTools}}`;

  return `
${availableTypes}
${availableTools}
  `.trim();
}
