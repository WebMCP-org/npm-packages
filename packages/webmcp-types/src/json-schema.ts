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
 * JSON Schema multi-type tuple (for example `["string", "null"]`).
 */
export type JsonSchemaTypeArray = readonly [JsonSchemaType, ...JsonSchemaType[]];

/**
 * Literal values supported in JSON Schema `enum`/`const`.
 */
export type JsonSchemaEnumValue = JsonPrimitive | JsonValue;

/**
 * Extra JSON Schema keywords tolerated by the inference layer.
 *
 * These keys are intentionally accepted as opaque metadata. Inference only uses
 * the core MVP keywords and ignores these fields.
 */
interface SupplementalJsonSchemaKeywords {
  $defs?: unknown;
  $ref?: unknown;
  additionalItems?: unknown;
  allOf?: unknown;
  anyOf?: unknown;
  contains?: unknown;
  definitions?: unknown;
  dependentRequired?: unknown;
  dependentSchemas?: unknown;
  format?: unknown;
  if?: unknown;
  maxContains?: unknown;
  minContains?: unknown;
  not?: unknown;
  oneOf?: unknown;
  patternProperties?: unknown;
  prefixItems?: unknown;
  propertyNames?: unknown;
  then?: unknown;
  unevaluatedItems?: unknown;
  unevaluatedProperties?: unknown;
}

/**
 * Non-validation metadata accepted by the MVP inference subset.
 */
interface JsonSchemaMetadata extends SupplementalJsonSchemaKeywords {
  default?: JsonValue;
  description?: string;
  examples?: readonly JsonValue[];
  /**
   * OpenAPI-compatible nullability marker.
   */
  nullable?: boolean;
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
  additionalProperties?: boolean | JsonSchemaForInference;
  maxProperties?: number;
  minProperties?: number;
  properties?: Readonly<Record<string, JsonSchemaForInference>>;
  required?: readonly string[];
  type: 'object';
}

/**
 * JSON Schema for multi-type unions via `type: [...]`.
 */
export interface JsonSchemaMultiType extends JsonSchemaMetadata {
  additionalProperties?: boolean | JsonSchemaForInference;
  const?: JsonSchemaEnumValue;
  enum?: readonly JsonSchemaEnumValue[];
  items?: JsonSchemaForInference;
  properties?: Readonly<Record<string, JsonSchemaForInference>>;
  required?: readonly string[];
  type: JsonSchemaTypeArray;
}

/**
 * JSON Schema subset supported by the MVP type inference layer.
 */
export type JsonSchemaForInference =
  | JsonSchemaArray
  | JsonSchemaBoolean
  | JsonSchemaMultiType
  | JsonSchemaNull
  | JsonSchemaNumber
  | JsonSchemaObject
  | JsonSchemaString;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type EmptyObject = Record<never, never>;

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
  : EmptyObject;

type RequiredKeysOf<TSchema, TProperties extends Record<string, unknown>> = TSchema extends {
  required: readonly (infer TRequired)[];
}
  ? string extends TRequired
    ? never
    : Extract<TRequired, keyof TProperties & string>
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

type PropertyKeysOf<TSchema> = keyof PropertiesOf<TSchema> & string;

type AdditionalSchemaOf<TSchema> = TSchema extends { additionalProperties: infer TAdditional }
  ? TAdditional
  : undefined;

type AdditionalPropsValue<TSchema> = AdditionalSchemaOf<TSchema> extends JsonSchemaForInference
  ? InferJsonSchema<AdditionalSchemaOf<TSchema>>
  : unknown;

type AdditionalPropsOf<TSchema> = TSchema extends { additionalProperties: false }
  ? EmptyObject
  : AdditionalSchemaOf<TSchema> extends JsonSchemaForInference
    ? PropertyKeysOf<TSchema> extends never
      ? Record<string, AdditionalPropsValue<TSchema>>
      : Record<string, unknown>
    : Record<string, unknown>;

type InferObject<TSchema> = Simplify<
  RequiredProps<PropertiesOf<TSchema>, RequiredKeysOf<TSchema, PropertiesOf<TSchema>>> &
    OptionalProps<PropertiesOf<TSchema>, RequiredKeysOf<TSchema, PropertiesOf<TSchema>>> &
    AdditionalPropsOf<TSchema>
>;

type TypeKeywordOf<TSchema> = TSchema extends { type: infer TType } ? TType : never;

type TypeOptionsOf<TSchema> = TypeKeywordOf<TSchema> extends readonly unknown[]
  ? Extract<TypeKeywordOf<TSchema>[number], JsonSchemaType>
  : Extract<TypeKeywordOf<TSchema>, JsonSchemaType>;

type InferFromTypeOption<TSchema, TType extends JsonSchemaType> = TType extends 'object'
  ? InferObject<TSchema>
  : TType extends 'array'
    ? TSchema extends { items: infer TItems }
      ? InferJsonSchema<TItems>[]
      : unknown[]
    : TType extends 'string'
      ? string
      : TType extends 'number' | 'integer'
        ? number
        : TType extends 'boolean'
          ? boolean
          : TType extends 'null'
            ? null
            : unknown;

type InferFromTypeKeyword<TSchema> = TypeOptionsOf<TSchema> extends never
  ? unknown
  : InferFromTypeOption<TSchema, TypeOptionsOf<TSchema>>;

type ApplyNullable<TSchema, TValue> = TSchema extends { nullable: true } ? TValue | null : TValue;

/**
 * Infers a TypeScript type from the supported JSON Schema subset.
 *
 * `const` and `enum` take precedence when present.
 */
export type InferJsonSchema<TSchema> = [ConstLiteral<TSchema>] extends [never]
  ? [EnumLiteral<TSchema>] extends [never]
    ? ApplyNullable<TSchema, InferFromTypeKeyword<TSchema>>
    : ApplyNullable<TSchema, EnumLiteral<TSchema>>
  : ApplyNullable<TSchema, ConstLiteral<TSchema>>;

type IsWidenedTypeKeyword<TTypeKeyword> = string extends TTypeKeyword
  ? true
  : TTypeKeyword extends readonly unknown[]
    ? string extends TTypeKeyword[number]
      ? true
      : false
    : false;

type IncludesObjectType<TSchema> = TypeOptionsOf<TSchema> extends never
  ? false
  : 'object' extends TypeOptionsOf<TSchema>
    ? true
    : false;

/**
 * Infers tool argument types from a root `InputSchema`.
 *
 * If the schema is not a literal object schema (for example a widened
 * `InputSchema` loaded at runtime), this intentionally falls back to
 * `Record<string, unknown>`.
 */
export type InferArgsFromInputSchema<TSchema extends { type: string | readonly string[] }> =
  IsWidenedTypeKeyword<TSchema['type']> extends true
    ? Record<string, unknown>
    : IncludesObjectType<TSchema> extends true
      ? InferObject<TSchema>
      : Record<string, unknown>;
