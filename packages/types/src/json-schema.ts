import type { JsonPrimitive, JsonValue } from './common.js';

/**
 * Primitive JSON Schema `type` values supported by the MVP inference layer.
 */
export type JsonSchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null';

/**
 * JSON Schema `type` values supported by the MVP inference layer.
 */
export type JsonSchemaType = JsonSchemaPrimitiveType | 'object' | 'array';

/**
 * Literal values supported in JSON Schema `enum`/`const`.
 */
export type JsonSchemaEnumValue = JsonPrimitive;

/**
 * JSON Schema keywords intentionally unsupported in the MVP subset.
 *
 * These are typed as `never` so `satisfies JsonSchemaForInference` can catch
 * them at compile time for literal schemas.
 */
interface UnsupportedJsonSchemaKeywords {
  $defs?: never;
  $ref?: never;
  additionalItems?: never;
  allOf?: never;
  anyOf?: never;
  contains?: never;
  definitions?: never;
  dependentRequired?: never;
  dependentSchemas?: never;
  format?: never;
  if?: never;
  maxContains?: never;
  minContains?: never;
  not?: never;
  oneOf?: never;
  patternProperties?: never;
  prefixItems?: never;
  propertyNames?: never;
  then?: never;
  unevaluatedItems?: never;
  unevaluatedProperties?: never;
}

/**
 * Non-validation metadata accepted by the MVP inference subset.
 */
interface JsonSchemaMetadata extends UnsupportedJsonSchemaKeywords {
  default?: JsonValue;
  description?: string;
  examples?: readonly JsonValue[];
  title?: string;
}

/**
 * JSON Schema for `type: "string"`.
 */
export interface JsonSchemaString extends JsonSchemaMetadata {
  const?: string;
  enum?: readonly string[];
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  type: 'string';
}

/**
 * JSON Schema for `type: "number"` and `type: "integer"`.
 */
export interface JsonSchemaNumber extends JsonSchemaMetadata {
  const?: number;
  enum?: readonly number[];
  exclusiveMaximum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minimum?: number;
  multipleOf?: number;
  type: 'number' | 'integer';
}

/**
 * JSON Schema for `type: "boolean"`.
 */
export interface JsonSchemaBoolean extends JsonSchemaMetadata {
  const?: boolean;
  enum?: readonly boolean[];
  type: 'boolean';
}

/**
 * JSON Schema for `type: "null"`.
 */
export interface JsonSchemaNull extends JsonSchemaMetadata {
  const?: null;
  enum?: readonly null[];
  type: 'null';
}

/**
 * JSON Schema for `type: "array"`.
 */
export interface JsonSchemaArray extends JsonSchemaMetadata {
  items: JsonSchemaForInference;
  maxItems?: number;
  minItems?: number;
  type: 'array';
  uniqueItems?: boolean;
}

/**
 * JSON Schema for `type: "object"`.
 */
export interface JsonSchemaObject extends JsonSchemaMetadata {
  additionalProperties?: boolean;
  maxProperties?: number;
  minProperties?: number;
  properties?: Readonly<Record<string, JsonSchemaForInference>>;
  required?: readonly string[];
  type: 'object';
}

/**
 * JSON Schema subset supported by the MVP type inference layer.
 */
export type JsonSchemaForInference =
  | JsonSchemaArray
  | JsonSchemaBoolean
  | JsonSchemaNull
  | JsonSchemaNumber
  | JsonSchemaObject
  | JsonSchemaString;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type EnumLiteral<TSchema> = TSchema extends { enum: infer TEnum extends readonly unknown[] }
  ? Extract<TEnum[number], JsonSchemaEnumValue>
  : never;

type ConstLiteral<TSchema> = TSchema extends { const: infer TConst }
  ? Extract<TConst, JsonSchemaEnumValue>
  : never;

type PropertiesOf<TSchema> = TSchema extends {
  properties: infer TProperties extends Readonly<Record<string, JsonSchemaForInference>>;
}
  ? TProperties
  : Record<string, never>;

type RequiredKeysOf<TSchema, TProperties extends Record<string, unknown>> = TSchema extends {
  required: readonly (infer TRequired)[];
}
  ? Extract<TRequired, keyof TProperties & string>
  : never;

type RequiredProps<
  TProperties extends Record<string, JsonSchemaForInference>,
  TRequiredKeys extends string,
> = {
  [K in keyof TProperties as K extends TRequiredKeys ? K : never]-?: InferJsonSchema<
    TProperties[K]
  >;
};

type OptionalProps<
  TProperties extends Record<string, JsonSchemaForInference>,
  TRequiredKeys extends string,
> = {
  [K in keyof TProperties as K extends TRequiredKeys ? never : K]?: InferJsonSchema<TProperties[K]>;
};

type EmptyObject = Record<never, never>;

type AdditionalPropsOf<TSchema> = TSchema extends { additionalProperties: false }
  ? EmptyObject
  : Record<string, unknown>;

type InferObject<TSchema extends { type: 'object' }> = Simplify<
  RequiredProps<PropertiesOf<TSchema>, RequiredKeysOf<TSchema, PropertiesOf<TSchema>>> &
    OptionalProps<PropertiesOf<TSchema>, RequiredKeysOf<TSchema, PropertiesOf<TSchema>>> &
    AdditionalPropsOf<TSchema>
>;

/**
 * Infers a TypeScript type from the supported JSON Schema subset.
 *
 * `const` and `enum` take precedence when present.
 */
export type InferJsonSchema<TSchema> = [ConstLiteral<TSchema>] extends [never]
  ? [EnumLiteral<TSchema>] extends [never]
    ? TSchema extends { type: 'object' }
      ? InferObject<TSchema>
      : TSchema extends { items: infer TItems; type: 'array' }
        ? InferJsonSchema<TItems>[]
        : TSchema extends { type: 'string' }
          ? string
          : TSchema extends { type: 'number' | 'integer' }
            ? number
            : TSchema extends { type: 'boolean' }
              ? boolean
              : TSchema extends { type: 'null' }
                ? null
                : unknown
    : EnumLiteral<TSchema>
  : ConstLiteral<TSchema>;

/**
 * Infers tool argument types from a root `InputSchema`.
 *
 * If the schema is not a literal object schema (for example a widened
 * `InputSchema` loaded at runtime), this intentionally falls back to
 * `Record<string, unknown>`.
 */
export type InferArgsFromInputSchema<TSchema extends { type: string }> =
  string extends TSchema['type']
    ? Record<string, unknown>
    : TSchema extends { type: 'object' }
      ? InferObject<TSchema>
      : Record<string, unknown>;
