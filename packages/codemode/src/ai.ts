import type { ToolSet } from 'ai';
import { asSchema, type Tool, tool } from 'ai';
import type { JSONSchema7 } from 'json-schema';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { type ConversionContext, jsonSchemaToTypeString } from './json-schema-types';
import { normalizeCode } from './normalize';
import type { Executor } from './types';
import { escapeJsDoc, sanitizeToolName, toPascalCase } from './utils';

const DEFAULT_DESCRIPTION = `Execute code to achieve a goal.

Available:
{{types}}

Write an async arrow function in JavaScript that returns the result.
Do NOT use TypeScript syntax — no type annotations, interfaces, or generics.
Do NOT define named functions then call them — just write the arrow function body directly.

Example: async () => { const r = await codemode.searchWeb({ query: "test" }); return r; }`;

export interface ToolDescriptor {
  description?: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  execute?: (args: unknown) => Promise<unknown>;
}

export type ToolDescriptors = Record<string, ToolDescriptor>;

export interface CreateCodeToolOptions {
  tools: ToolDescriptors | ToolSet;
  executor: Executor;
  description?: string;
}

const codeSchema = z.object({
  code: z.string().describe('JavaScript async arrow function to execute'),
});

type CodeInput = z.infer<typeof codeSchema>;
type CodeOutput = { code: string; result: unknown; logs?: string[] };

function isZodSchema(value: unknown): value is ZodType {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_zod' in value &&
    (value as { _zod?: unknown })._zod !== undefined
  );
}

function isStandardSchema(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '~standard' in value &&
    (value as Record<string, unknown>)['~standard'] !== undefined
  );
}

function isJsonSchemaWrapper(value: unknown): value is { jsonSchema: JSONSchema7 } {
  if (value === null || typeof value !== 'object') return false;
  if ('jsonSchema' in value) return true;

  const symbols = Object.getOwnPropertySymbols(value);
  for (const sym of symbols) {
    const symValue = (value as Record<symbol, unknown>)[sym];
    if (symValue && typeof symValue === 'object' && 'jsonSchema' in symValue) {
      return true;
    }
  }
  return false;
}

function extractJsonSchema(wrapper: unknown): JSONSchema7 | null {
  if (wrapper === null || typeof wrapper !== 'object') return null;
  if ('jsonSchema' in wrapper) {
    return (wrapper as { jsonSchema: JSONSchema7 }).jsonSchema;
  }

  const symbols = Object.getOwnPropertySymbols(wrapper);
  for (const sym of symbols) {
    const symValue = (wrapper as Record<symbol, unknown>)[sym];
    if (symValue && typeof symValue === 'object' && 'jsonSchema' in symValue) {
      return (symValue as { jsonSchema: JSONSchema7 }).jsonSchema;
    }
  }
  return null;
}

function extractDescriptions(schema: unknown): Record<string, string> {
  const descriptions: Record<string, string> = {};

  const shape = (schema as { shape?: Record<string, ZodType> }).shape;
  if (shape && typeof shape === 'object') {
    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      let s = fieldSchema as { description?: string; unwrap?: () => unknown };
      while (!s.description && typeof s.unwrap === 'function') {
        s = s.unwrap() as typeof s;
      }
      if (s.description) {
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
  const descriptions = extractDescriptions(schema);
  return Object.entries(descriptions).map(
    ([fieldName, desc]) => `@param input.${fieldName} - ${desc}`
  );
}

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

export function generateTypes(tools: ToolDescriptors | ToolSet): string {
  let availableTools = '';
  let availableTypes = '';

  for (const [toolName, t] of Object.entries(tools)) {
    const safeName = sanitizeToolName(toolName);
    const typeName = toPascalCase(safeName);

    try {
      const inputSchema = 'inputSchema' in t ? t.inputSchema : t.parameters;
      const outputSchema = 'outputSchema' in t ? t.outputSchema : undefined;
      const description = t.description;

      const inputType = safeSchemaToTs(inputSchema, `${typeName}Input`);
      const outputType = outputSchema
        ? safeSchemaToTs(outputSchema, `${typeName}Output`)
        : `type ${typeName}Output = unknown`;

      availableTypes += `\n${inputType.trim()}`;
      availableTypes += `\n${outputType.trim()}`;

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
      availableTools += `\n\t/**\n${jsdocBody}\n\t */`;
      availableTools += `\n\t${safeName}: (input: ${typeName}Input) => Promise<${typeName}Output>;`;
      availableTools += '\n';
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

function hasNeedsApproval(t: Record<string, unknown>): boolean {
  return 'needsApproval' in t && t.needsApproval != null;
}

export function createCodeTool(options: CreateCodeToolOptions): Tool<CodeInput, CodeOutput> {
  const tools: ToolDescriptors | ToolSet = {};
  for (const [name, t] of Object.entries(options.tools)) {
    if (!hasNeedsApproval(t as Record<string, unknown>)) {
      (tools as Record<string, unknown>)[name] = t;
    }
  }

  const types = generateTypes(tools);
  const executor = options.executor;

  const description = (options.description ?? DEFAULT_DESCRIPTION).replace('{{types}}', types);

  return tool({
    description,
    inputSchema: codeSchema,
    execute: async ({ code }) => {
      const fns: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

      for (const [name, t] of Object.entries(tools)) {
        const execute =
          'execute' in t ? (t.execute as (args: unknown) => Promise<unknown>) : undefined;
        if (execute) {
          const rawSchema =
            'inputSchema' in t
              ? t.inputSchema
              : 'parameters' in t
                ? (t as Record<string, unknown>).parameters
                : undefined;

          const schema = rawSchema != null ? asSchema(rawSchema) : undefined;

          const validate = schema?.validate;
          fns[sanitizeToolName(name)] = validate
            ? async (args: unknown) => {
                const result = await validate(args);
                if (!result.success) throw result.error;
                return execute(result.value);
              }
            : execute;
        }
      }

      const normalizedCode = normalizeCode(code);
      const executeResult = await executor.execute(normalizedCode, fns);

      if (executeResult.error) {
        const logCtx = executeResult.logs?.length
          ? `\n\nConsole output:\n${executeResult.logs.join('\n')}`
          : '';
        throw new Error(`Code execution failed: ${executeResult.error}${logCtx}`);
      }

      const output: CodeOutput = { code, result: executeResult.result };
      if (executeResult.logs) output.logs = executeResult.logs;
      return output;
    },
  });
}
