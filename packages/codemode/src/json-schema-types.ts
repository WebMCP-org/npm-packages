import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import type { UnknownRecord } from './type-utils';
import {
  escapeJsDoc,
  escapeStringLiteral,
  quoteProp,
  sanitizeToolName,
  toPascalCase,
} from './utils';

export interface ConversionContext {
  root: JSONSchema7;
  depth: number;
  seen: Set<unknown>;
  maxDepth: number;
}

function resolveRef(ref: string, root: JSONSchema7): JSONSchema7Definition | null {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return null;

  const segments = ref
    .slice(2)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as UnknownRecord)[seg];
    if (current === undefined) return null;
  }

  if (typeof current === 'boolean') return current;
  if (current === null || typeof current !== 'object') return null;
  return current as JSONSchema7;
}

function applyNullable(result: string, schema: unknown): string {
  if (result !== 'unknown' && result !== 'never' && (schema as UnknownRecord)?.nullable === true) {
    return `${result} | null`;
  }
  return result;
}

export function jsonSchemaToTypeString(
  schema: JSONSchema7Definition,
  indent: string,
  ctx: ConversionContext
): string {
  if (typeof schema === 'boolean') {
    return schema ? 'unknown' : 'never';
  }

  if (ctx.depth >= ctx.maxDepth) return 'unknown';
  if (ctx.seen.has(schema)) return 'unknown';

  ctx.seen.add(schema);
  const nextCtx: ConversionContext = {
    ...ctx,
    depth: ctx.depth + 1,
  };

  try {
    if (schema.$ref) {
      const resolved = resolveRef(schema.$ref, ctx.root);
      if (!resolved) return 'unknown';
      return applyNullable(jsonSchemaToTypeString(resolved, indent, nextCtx), schema);
    }

    if (schema.anyOf) {
      const types = schema.anyOf.map((s) => jsonSchemaToTypeString(s, indent, nextCtx));
      return applyNullable(types.join(' | '), schema);
    }
    if (schema.oneOf) {
      const types = schema.oneOf.map((s) => jsonSchemaToTypeString(s, indent, nextCtx));
      return applyNullable(types.join(' | '), schema);
    }

    if (schema.allOf) {
      const types = schema.allOf.map((s) => jsonSchemaToTypeString(s, indent, nextCtx));
      return applyNullable(types.join(' & '), schema);
    }

    if (schema.enum) {
      if (schema.enum.length === 0) return 'never';
      const result = schema.enum
        .map((v) => {
          if (v === null) return 'null';
          if (typeof v === 'string') return `"${escapeStringLiteral(v)}"`;
          if (typeof v === 'object') return JSON.stringify(v) ?? 'unknown';
          return String(v);
        })
        .join(' | ');
      return applyNullable(result, schema);
    }

    if (schema.const !== undefined) {
      const result =
        schema.const === null
          ? 'null'
          : typeof schema.const === 'string'
            ? `"${escapeStringLiteral(schema.const)}"`
            : typeof schema.const === 'object'
              ? (JSON.stringify(schema.const) ?? 'unknown')
              : String(schema.const);
      return applyNullable(result, schema);
    }

    const type = schema.type;

    if (type === 'string') return applyNullable('string', schema);
    if (type === 'number' || type === 'integer') return applyNullable('number', schema);
    if (type === 'boolean') return applyNullable('boolean', schema);
    if (type === 'null') return 'null';

    if (type === 'array') {
      const prefixItems = (schema as UnknownRecord).prefixItems as
        | JSONSchema7Definition[]
        | undefined;
      if (Array.isArray(prefixItems)) {
        const types = prefixItems.map((s) => jsonSchemaToTypeString(s, indent, nextCtx));
        return applyNullable(`[${types.join(', ')}]`, schema);
      }

      if (Array.isArray(schema.items)) {
        const types = schema.items.map((s) => jsonSchemaToTypeString(s, indent, nextCtx));
        return applyNullable(`[${types.join(', ')}]`, schema);
      }

      if (schema.items) {
        const itemType = jsonSchemaToTypeString(schema.items, indent, nextCtx);
        return applyNullable(`${itemType}[]`, schema);
      }
      return applyNullable('unknown[]', schema);
    }

    if (type === 'object' || schema.properties) {
      const props = schema.properties || {};
      const required = new Set(schema.required || []);
      const lines: string[] = [];

      for (const [propName, propSchema] of Object.entries(props)) {
        if (typeof propSchema === 'boolean') {
          const boolType = propSchema ? 'unknown' : 'never';
          const optionalMark = required.has(propName) ? '' : '?';
          lines.push(`${indent}    ${quoteProp(propName)}${optionalMark}: ${boolType};`);
          continue;
        }

        const isRequired = required.has(propName);
        const propType = jsonSchemaToTypeString(propSchema, `${indent}    `, nextCtx);
        const desc = propSchema.description;
        const format = propSchema.format;

        if (desc || format) {
          const descText = desc ? escapeJsDoc(desc.replace(/\r?\n/g, ' ')) : undefined;
          const formatTag = format ? `@format ${escapeJsDoc(format)}` : undefined;

          if (descText && formatTag) {
            lines.push(`${indent}    /**`);
            lines.push(`${indent}     * ${descText}`);
            lines.push(`${indent}     * ${formatTag}`);
            lines.push(`${indent}     */`);
          } else {
            lines.push(`${indent}    /** ${descText ?? formatTag} */`);
          }
        }

        const quotedName = quoteProp(propName);
        const optionalMark = isRequired ? '' : '?';
        lines.push(`${indent}    ${quotedName}${optionalMark}: ${propType};`);
      }

      if (schema.additionalProperties) {
        const valueType =
          schema.additionalProperties === true
            ? 'unknown'
            : jsonSchemaToTypeString(schema.additionalProperties, `${indent}    `, nextCtx);
        lines.push(`${indent}    [key: string]: ${valueType};`);
      }

      if (lines.length === 0) {
        if (schema.additionalProperties === false) {
          return applyNullable('{}', schema);
        }
        return applyNullable('Record<string, unknown>', schema);
      }

      const result = `{\n${lines.join('\n')}\n${indent}}`;
      return applyNullable(result, schema);
    }

    if (Array.isArray(type)) {
      const types = type.map((t) => {
        if (t === 'string') return 'string';
        if (t === 'number' || t === 'integer') return 'number';
        if (t === 'boolean') return 'boolean';
        if (t === 'null') return 'null';
        if (t === 'array') return 'unknown[]';
        if (t === 'object') return 'Record<string, unknown>';
        return 'unknown';
      });
      return applyNullable(types.join(' | '), schema);
    }

    return 'unknown';
  } finally {
    ctx.seen.delete(schema);
  }
}

export function jsonSchemaToType(schema: JSONSchema7, typeName: string): string {
  const ctx: ConversionContext = {
    root: schema,
    depth: 0,
    seen: new Set(),
    maxDepth: 20,
  };
  const typeBody = jsonSchemaToTypeString(schema, '', ctx);
  return `type ${typeName} = ${typeBody}`;
}

function extractJsonSchemaDescriptions(schema: JSONSchema7): Record<string, string> {
  const descriptions: Record<string, string> = {};
  if (schema.properties) {
    for (const [fieldName, propSchema] of Object.entries(schema.properties)) {
      if (propSchema && typeof propSchema === 'object' && propSchema.description) {
        descriptions[fieldName] = propSchema.description;
      }
    }
  }
  return descriptions;
}

export interface JsonSchemaToolDescriptor {
  description?: string;
  inputSchema: JSONSchema7;
  outputSchema?: JSONSchema7;
}

export type JsonSchemaToolDescriptors = Record<string, JsonSchemaToolDescriptor>;

export function generateTypesFromJsonSchema(tools: JsonSchemaToolDescriptors): string {
  let availableTools = '';
  let availableTypes = '';

  for (const [toolName, tool] of Object.entries(tools)) {
    const safeName = sanitizeToolName(toolName);
    const typeName = toPascalCase(safeName);

    try {
      const inputType = jsonSchemaToType(tool.inputSchema, `${typeName}Input`);

      const outputType = tool.outputSchema
        ? jsonSchemaToType(tool.outputSchema, `${typeName}Output`)
        : `type ${typeName}Output = unknown`;

      availableTypes += `\n${inputType.trim()}`;
      availableTypes += `\n${outputType.trim()}`;

      const paramLines = (() => {
        try {
          const paramDescs = extractJsonSchemaDescriptions(tool.inputSchema);
          return Object.entries(paramDescs).map(
            ([fieldName, desc]) => `@param input.${fieldName} - ${desc}`
          );
        } catch {
          return [];
        }
      })();
      const jsdocLines: string[] = [];
      if (tool.description?.trim()) {
        jsdocLines.push(escapeJsDoc(tool.description.trim().replace(/\r?\n/g, ' ')));
      } else {
        jsdocLines.push(escapeJsDoc(toolName));
      }
      for (const pd of paramLines) {
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
