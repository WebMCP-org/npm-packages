import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-types';

const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;

type SchemaKind = 'input' | 'output';

interface StandardProps {
  readonly version: 1;
  readonly validate?: ((value: unknown) => unknown) | undefined;
  readonly jsonSchema?:
    | {
        readonly input?:
          | ((options: { readonly target: string }) => Record<string, unknown>)
          | undefined;
        readonly output?:
          | ((options: { readonly target: string }) => Record<string, unknown>)
          | undefined;
      }
    | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getStandardProps(value: unknown): StandardProps | null {
  if (!isRecord(value)) {
    return null;
  }

  const standard = value['~standard'];
  if (!isRecord(standard) || standard.version !== 1) {
    return null;
  }

  return standard as unknown as StandardProps;
}

function hasStandardJsonSchema(
  standard: StandardProps,
  kind: SchemaKind
): standard is StandardProps & {
  readonly jsonSchema: {
    readonly input: (options: { readonly target: string }) => Record<string, unknown>;
    readonly output: (options: { readonly target: string }) => Record<string, unknown>;
  };
} {
  if (!isRecord(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema[kind] === 'function';
}

export function stripSchemaMeta(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripSchemaMeta(entry));
  }

  if (!isRecord(schema)) {
    return schema;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema') {
      continue;
    }
    next[key] = stripSchemaMeta(value);
  }
  return next;
}

function convertStandardJsonSchema(
  schema: unknown,
  kind: SchemaKind,
  descriptor: string
): InputSchema | JsonSchemaForInference {
  const standard = getStandardProps(schema);
  if (!standard || !hasStandardJsonSchema(standard, kind)) {
    throw new Error(
      `[BrowserMcpServer] ${descriptor} must provide Standard JSON Schema export for ${kind}`
    );
  }

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      return stripSchemaMeta(standard.jsonSchema[kind]({ target })) as InputSchema;
    } catch (error) {
      console.warn(
        `[BrowserMcpServer] Standard JSON Schema conversion failed for ${descriptor} with target "${target}":`,
        error
      );
    }
  }

  throw new Error(`[BrowserMcpServer] Failed to convert ${descriptor} to JSON Schema`);
}

export function normalizeSchemaForRegistration(
  schema: unknown,
  options: { kind: SchemaKind; descriptor: string }
): InputSchema | JsonSchemaForInference | undefined {
  if (schema === undefined) {
    return undefined;
  }

  const standard = getStandardProps(schema);
  if (standard && hasStandardJsonSchema(standard, options.kind)) {
    return convertStandardJsonSchema(schema, options.kind, options.descriptor);
  }

  if (standard && typeof standard.validate === 'function') {
    throw new Error(
      `[BrowserMcpServer] ${options.descriptor} cannot use validator-only Standard Schema. Use plain JSON Schema or Standard JSON Schema on MCP registration surfaces.`
    );
  }

  if (standard) {
    throw new Error(
      `[BrowserMcpServer] ${options.descriptor} must expose Standard JSON Schema for ${options.kind}`
    );
  }

  return schema as InputSchema | JsonSchemaForInference;
}
