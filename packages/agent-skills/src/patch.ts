/**
 * Skill diff and patch utilities for SKILL.md content.
 *
 * Designed for model-driven edits with explicit validation and
 * descriptive failure feedback.
 */

import type { SkillContent } from './models.js';
import { frontmatterToProperties, parseFrontmatter } from './parser.js';
import type { ValidateSkillPropertiesOptions } from './validator.js';
import { validateSkillContent, validateSkillProperties } from './validator.js';

type SkillNameExpectation = NonNullable<ValidateSkillPropertiesOptions['expectedName']>;

/**
 * Supported patch operation types.
 *
 * @example
 * ```ts
 * const type: SkillPatchOperationType = "replace"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillPatchOperationType = 'replace' | 'insert' | 'delete';

/**
 * Replace operation that swaps matched text with new text.
 *
 * @example
 * ```ts
 * const op: SkillPatchReplaceOperation = {
 *   type: "replace",
 *   before: "old",
 *   after: "new"
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchReplaceOperation {
  type: 'replace';
  before: string;
  after: string;
  expectedMatches?: number;
}

/**
 * Insert operation that adds text before or after an anchor.
 *
 * @example
 * ```ts
 * const op: SkillPatchInsertOperation = {
 *   type: "insert",
 *   anchor: "## Section",
 *   text: "\nNew line",
 *   position: "after"
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchInsertOperation {
  type: 'insert';
  anchor: string;
  text: string;
  position?: 'before' | 'after';
  expectedMatches?: number;
}

/**
 * Delete operation that removes occurrences of target text.
 *
 * @example
 * ```ts
 * const op: SkillPatchDeleteOperation = { type: "delete", before: "obsolete" }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchDeleteOperation {
  type: 'delete';
  before: string;
  expectedMatches?: number;
}

/**
 * Union of all supported patch operations.
 *
 * @example
 * ```ts
 * const op: SkillPatchOperation = { type: "delete", before: "obsolete" }
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillPatchOperation =
  | SkillPatchReplaceOperation
  | SkillPatchInsertOperation
  | SkillPatchDeleteOperation;

/**
 * Top-level patch payload accepted by `applySkillPatch`.
 *
 * @example
 * ```ts
 * const patch: SkillPatch = { version: 1, operations: [] }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatch {
  version: 1;
  operations: SkillPatchOperation[];
}

/**
 * Machine-readable issue codes emitted by patch validation/application.
 *
 * @example
 * ```ts
 * const code: SkillPatchIssueCode = "OPERATION_TARGET_NOT_FOUND"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillPatchIssueCode =
  | 'PATCH_NOT_OBJECT'
  | 'PATCH_INVALID_VERSION'
  | 'PATCH_MISSING_OPERATIONS'
  | 'OPERATION_INVALID'
  | 'OPERATION_TARGET_EMPTY'
  | 'OPERATION_INVALID_POSITION'
  | 'OPERATION_INVALID_EXPECTED_MATCHES'
  | 'OPERATION_TARGET_NOT_FOUND'
  | 'OPERATION_TARGET_AMBIGUOUS'
  | 'OPERATION_MATCH_COUNT_MISMATCH'
  | 'SKILL_INVALID';

/**
 * Structured issue detail for patch failures.
 *
 * @example
 * ```ts
 * const issue: SkillPatchIssue = {
 *   code: "OPERATION_TARGET_NOT_FOUND",
 *   message: "Target text not found."
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchIssue {
  code: SkillPatchIssueCode;
  message: string;
  operationIndex?: number;
  operationType?: SkillPatchOperationType;
  field?: string;
  matchCount?: number;
  expectedMatches?: number;
  snippet?: string;
}

/**
 * Result returned by `validateSkillPatch`.
 *
 * @example
 * ```ts
 * const result: SkillPatchValidationResult = validateSkillPatch(candidate)
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchValidationResult {
  ok: boolean;
  patch?: SkillPatch;
  errors?: SkillPatchIssue[];
}

/**
 * Options for patch application behavior.
 *
 * @example
 * ```ts
 * const options: SkillPatchApplyOptions = { expectedMatches: 1, validate: true }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchApplyOptions {
  expectedMatches?: number;
  validate?: boolean | ValidateSkillPropertiesOptions;
}

/**
 * Result returned by `applySkillPatch`.
 *
 * @example
 * ```ts
 * const result: SkillPatchApplyResult = applySkillPatch(content, patch)
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchApplyResult {
  ok: boolean;
  content?: SkillContent;
  errors?: SkillPatchIssue[];
  appliedOperations?: number;
}

/**
 * Options for `createSkillPatch`.
 *
 * @example
 * ```ts
 * const options: SkillPatchCreateOptions = { contextLines: 2 }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillPatchCreateOptions {
  contextLines?: number;
}

/**
 * Diff segment type.
 *
 * @example
 * ```ts
 * const type: SkillDiffSegmentType = "insert"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillDiffSegmentType = 'equal' | 'insert' | 'delete';

/**
 * Consecutive lines sharing the same diff operation type.
 *
 * @example
 * ```ts
 * const segment: SkillDiffSegment = { type: "equal", lines: ["line"] }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillDiffSegment {
  type: SkillDiffSegmentType;
  lines: string[];
}

/**
 * Line-oriented diff output.
 *
 * @example
 * ```ts
 * const diff: SkillLineDiff = diffSkillContent("a", "b")
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillLineDiff {
  baseLineCount: number;
  updatedLineCount: number;
  segments: SkillDiffSegment[];
}

const DEFAULT_CONTEXT_LINES = 2;
const DEFAULT_EXPECTED_MATCHES = 1;
const MAX_SNIPPET_LENGTH = 80;

/**
 * Checks whether a value is a plain object.
 *
 * @param value - Candidate value.
 * @returns `true` when value is a plain object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Checks whether a value is a non-empty string.
 *
 * @param value - Candidate value.
 * @returns `true` when value is a non-empty string.
 */
const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};

/**
 * Checks whether a value is a positive integer.
 *
 * @param value - Candidate value.
 * @returns `true` when value is a positive integer.
 */
const isPositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

/**
 * Checks whether a value is a supported insert position.
 *
 * @param value - Candidate value.
 * @returns `true` when value is `"before"` or `"after"`.
 */
const isInsertPosition = (value: unknown): value is 'before' | 'after' => {
  return value === 'before' || value === 'after';
};

/**
 * Normalizes optional expected match counts from unknown input.
 *
 * @param value - Candidate count value.
 * @returns Positive integer value or `undefined`.
 */
const toExpectedMatches = (value: unknown): number | undefined => {
  return isPositiveInteger(value) ? value : undefined;
};

const renderSnippet = (value: string): string => {
  const escaped = value.replace(/\n/g, '\\n');
  if (escaped.length <= MAX_SNIPPET_LENGTH) {
    return escaped;
  }
  return `${escaped.slice(0, MAX_SNIPPET_LENGTH - 3)}...`;
};

const createIssue = (issue: SkillPatchIssue): SkillPatchIssue => issue;

const toValidationErrors = (result: SkillPatchValidationResult): SkillPatchIssue[] => {
  if (Array.isArray(result.errors)) {
    return result.errors;
  }

  return [
    createIssue({
      code: 'OPERATION_INVALID',
      message: 'Patch validation failed without structured error details.',
    }),
  ];
};

const validateExpectedMatches = (
  expectedMatches: unknown,
  operationIndex: number,
  operationType: SkillPatchOperationType
): SkillPatchIssue | null => {
  if (expectedMatches === undefined) {
    return null;
  }
  if (!isPositiveInteger(expectedMatches)) {
    return createIssue({
      code: 'OPERATION_INVALID_EXPECTED_MATCHES',
      message: `Operation ${operationIndex} (${operationType}) expectedMatches must be a positive integer.`,
      operationIndex,
      operationType,
      field: 'expectedMatches',
    });
  }
  return null;
};

const normalizeExpectedMatches = (
  operationExpected: number | undefined,
  fallbackExpected: number | undefined
): number => {
  if (isPositiveInteger(operationExpected)) {
    return operationExpected;
  }
  if (isPositiveInteger(fallbackExpected)) {
    return fallbackExpected;
  }
  return DEFAULT_EXPECTED_MATCHES;
};

/**
 * Validates and normalizes a candidate patch payload.
 *
 * @param patch - Unknown candidate patch object.
 * @returns Normalized patch when valid, otherwise structured issues.
 * @example
 * ```ts
 * const result = validateSkillPatch({
 *   version: 1,
 *   operations: [{ type: "replace", before: "old", after: "new" }]
 * })
 * ```
 * @see https://agentskills.io/specification
 */
export function validateSkillPatch(patch: unknown): SkillPatchValidationResult {
  if (Array.isArray(patch)) {
    return {
      ok: false,
      errors: [
        createIssue({
          code: 'PATCH_NOT_OBJECT',
          message: 'Patch must be an object with a version and operations array.',
        }),
      ],
    };
  }

  if (!isRecord(patch)) {
    return {
      ok: false,
      errors: [
        createIssue({
          code: 'PATCH_NOT_OBJECT',
          message: 'Patch must be an object with a version and operations array.',
        }),
      ],
    };
  }

  const errors: SkillPatchIssue[] = [];

  if ('version' in patch && patch.version !== 1) {
    errors.push(
      createIssue({
        code: 'PATCH_INVALID_VERSION',
        message: 'Patch version must be 1.',
      })
    );
  }

  if (!Array.isArray(patch.operations)) {
    errors.push(
      createIssue({
        code: 'PATCH_MISSING_OPERATIONS',
        message: 'Patch must include an operations array.',
      })
    );
    return { ok: false, errors };
  }

  const normalizedOperations: SkillPatchOperation[] = [];

  patch.operations.forEach((operation, index) => {
    if (!isRecord(operation)) {
      errors.push(
        createIssue({
          code: 'OPERATION_INVALID',
          message: `Operation ${index} must be an object.`,
          operationIndex: index,
        })
      );
      return;
    }

    const type = operation.type;
    if (type !== 'replace' && type !== 'insert' && type !== 'delete') {
      errors.push(
        createIssue({
          code: 'OPERATION_INVALID',
          message: `Operation ${index} has an invalid type.`,
          operationIndex: index,
        })
      );
      return;
    }

    const expectedMatchesIssue = validateExpectedMatches(operation.expectedMatches, index, type);
    if (expectedMatchesIssue) {
      errors.push(expectedMatchesIssue);
      return;
    }

    if (type === 'replace') {
      if (typeof operation.before !== 'string') {
        errors.push(
          createIssue({
            code: 'OPERATION_INVALID',
            message: `Operation ${index} (replace) requires a string before value.`,
            operationIndex: index,
            operationType: type,
            field: 'before',
          })
        );
        return;
      }
      if (typeof operation.after !== 'string') {
        errors.push(
          createIssue({
            code: 'OPERATION_INVALID',
            message: `Operation ${index} (replace) requires a string after value.`,
            operationIndex: index,
            operationType: type,
            field: 'after',
          })
        );
        return;
      }
      const expectedMatches = toExpectedMatches(operation.expectedMatches);
      normalizedOperations.push({
        type: 'replace',
        before: operation.before,
        after: operation.after,
        ...(expectedMatches !== undefined && { expectedMatches }),
      });
      return;
    }

    if (type === 'insert') {
      if (!isNonEmptyString(operation.anchor)) {
        errors.push(
          createIssue({
            code: 'OPERATION_TARGET_EMPTY',
            message: `Operation ${index} (insert) requires a non-empty anchor string.`,
            operationIndex: index,
            operationType: type,
            field: 'anchor',
          })
        );
        return;
      }
      if (!isNonEmptyString(operation.text)) {
        errors.push(
          createIssue({
            code: 'OPERATION_INVALID',
            message: `Operation ${index} (insert) requires a non-empty text value.`,
            operationIndex: index,
            operationType: type,
            field: 'text',
          })
        );
        return;
      }
      if (operation.position !== undefined && !isInsertPosition(operation.position)) {
        errors.push(
          createIssue({
            code: 'OPERATION_INVALID_POSITION',
            message: `Operation ${index} (insert) position must be "before" or "after".`,
            operationIndex: index,
            operationType: type,
            field: 'position',
          })
        );
        return;
      }
      const insertPosition = isInsertPosition(operation.position) ? operation.position : undefined;
      const insertExpectedMatches = toExpectedMatches(operation.expectedMatches);
      normalizedOperations.push({
        type: 'insert',
        anchor: operation.anchor,
        text: operation.text,
        ...(insertPosition !== undefined && { position: insertPosition }),
        ...(insertExpectedMatches !== undefined && { expectedMatches: insertExpectedMatches }),
      });
      return;
    }

    // Only "delete" remains after replace and insert branches returned
    if (!isNonEmptyString(operation.before)) {
      errors.push(
        createIssue({
          code: 'OPERATION_TARGET_EMPTY',
          message: `Operation ${index} (delete) requires a non-empty before string.`,
          operationIndex: index,
          operationType: type,
          field: 'before',
        })
      );
      return;
    }
    const deleteExpectedMatches = toExpectedMatches(operation.expectedMatches);
    normalizedOperations.push({
      type: 'delete',
      before: operation.before,
      ...(deleteExpectedMatches !== undefined && { expectedMatches: deleteExpectedMatches }),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    patch: {
      version: 1,
      operations: normalizedOperations,
    },
  };
}

const findMatches = (content: SkillContent, target: string): number[] => {
  const matches: number[] = [];
  let index = content.indexOf(target);
  while (index !== -1) {
    matches.push(index);
    index = content.indexOf(target, index + target.length);
  }
  return matches;
};

const applyTextReplacementAtMatches = (
  content: SkillContent,
  matches: ReadonlyArray<number>,
  targetLength: number,
  replacement: string
): SkillContent => {
  if (matches.length === 0) {
    return content;
  }

  const pieces: string[] = [];
  let cursor = 0;
  for (const matchIndex of matches) {
    pieces.push(content.slice(cursor, matchIndex));
    pieces.push(replacement);
    cursor = matchIndex + targetLength;
  }
  pieces.push(content.slice(cursor));
  return pieces.join('');
};

const applyTextInsertAtMatches = (
  content: SkillContent,
  matches: ReadonlyArray<number>,
  anchorLength: number,
  text: string,
  position: 'before' | 'after'
): SkillContent => {
  if (matches.length === 0) {
    return content;
  }

  const pieces: string[] = [];
  let cursor = 0;
  for (const matchIndex of matches) {
    const insertIndex = position === 'before' ? matchIndex : matchIndex + anchorLength;
    pieces.push(content.slice(cursor, insertIndex));
    pieces.push(text);
    cursor = insertIndex;
  }
  pieces.push(content.slice(cursor));
  return pieces.join('');
};

const resolveMatchIssue = (
  matchCount: number,
  expectedMatches: number,
  expectedProvided: boolean,
  operationIndex: number,
  operationType: SkillPatchOperationType,
  snippet: string
): SkillPatchIssue | null => {
  if (matchCount === 0) {
    return createIssue({
      code: 'OPERATION_TARGET_NOT_FOUND',
      message: `Operation ${operationIndex} (${operationType}) could not find the target text.`,
      operationIndex,
      operationType,
      matchCount,
      expectedMatches,
      snippet,
    });
  }

  if (expectedProvided) {
    if (matchCount !== expectedMatches) {
      return createIssue({
        code: 'OPERATION_MATCH_COUNT_MISMATCH',
        message: `Operation ${operationIndex} (${operationType}) expected ${expectedMatches} matches, found ${matchCount}.`,
        operationIndex,
        operationType,
        matchCount,
        expectedMatches,
        snippet,
      });
    }
    return null;
  }

  if (matchCount > 1) {
    return createIssue({
      code: 'OPERATION_TARGET_AMBIGUOUS',
      message: `Operation ${operationIndex} (${operationType}) matched ${matchCount} locations. Provide more context or set expectedMatches.`,
      operationIndex,
      operationType,
      matchCount,
      expectedMatches,
      snippet,
    });
  }

  return null;
};

const applyReplace = (
  content: SkillContent,
  before: string,
  after: string,
  operationIndex: number,
  expectedMatches: number,
  expectedProvided: boolean
): { content: SkillContent; matchCount: number } | SkillPatchIssue => {
  if (before.length === 0) {
    if (content.length === 0) {
      if (expectedProvided && expectedMatches !== 1) {
        return createIssue({
          code: 'OPERATION_MATCH_COUNT_MISMATCH',
          message: `Operation ${operationIndex} (replace) expected ${expectedMatches} matches, found 1.`,
          operationIndex,
          operationType: 'replace',
          matchCount: 1,
          expectedMatches,
        });
      }
      return { content: after, matchCount: 1 };
    }
    return createIssue({
      code: 'OPERATION_TARGET_EMPTY',
      message: `Operation ${operationIndex} (replace) requires a non-empty before string unless the content is empty.`,
      operationIndex,
      operationType: 'replace',
      field: 'before',
    });
  }

  const matches = findMatches(content, before);
  const snippet = renderSnippet(before);
  const issue = resolveMatchIssue(
    matches.length,
    expectedMatches,
    expectedProvided,
    operationIndex,
    'replace',
    snippet
  );

  if (issue) {
    return issue;
  }
  const nextContent = applyTextReplacementAtMatches(content, matches, before.length, after);
  return { content: nextContent, matchCount: matches.length };
};

const applyDelete = (
  content: SkillContent,
  before: string,
  operationIndex: number,
  expectedMatches: number,
  expectedProvided: boolean
): { content: SkillContent; matchCount: number } | SkillPatchIssue => {
  const matches = findMatches(content, before);
  const snippet = renderSnippet(before);
  const issue = resolveMatchIssue(
    matches.length,
    expectedMatches,
    expectedProvided,
    operationIndex,
    'delete',
    snippet
  );

  if (issue) {
    return issue;
  }
  const nextContent = applyTextReplacementAtMatches(content, matches, before.length, '');
  return { content: nextContent, matchCount: matches.length };
};

const applyInsert = (
  content: SkillContent,
  anchor: string,
  text: string,
  position: 'before' | 'after',
  operationIndex: number,
  expectedMatches: number,
  expectedProvided: boolean
): { content: SkillContent; matchCount: number } | SkillPatchIssue => {
  const matches = findMatches(content, anchor);
  const snippet = renderSnippet(anchor);
  const issue = resolveMatchIssue(
    matches.length,
    expectedMatches,
    expectedProvided,
    operationIndex,
    'insert',
    snippet
  );

  if (issue) {
    return issue;
  }
  const nextContent = applyTextInsertAtMatches(content, matches, anchor.length, text, position);
  return { content: nextContent, matchCount: matches.length };
};

const collectSkillValidationIssues = (
  content: SkillContent,
  expectedName?: SkillNameExpectation
): SkillPatchIssue[] => {
  const errors = validateSkillContent(content);
  const issues = errors.map((message) =>
    createIssue({
      code: 'SKILL_INVALID',
      message,
    })
  );

  if (issues.length > 0 || !expectedName) {
    return issues;
  }

  // validateSkillContent succeeded, so parseFrontmatter is guaranteed to succeed
  const { metadata } = parseFrontmatter(content);
  const properties = frontmatterToProperties(metadata);
  const nameErrors = validateSkillProperties(properties, { expectedName });
  return nameErrors.map((message) =>
    createIssue({
      code: 'SKILL_INVALID',
      message,
    })
  );
};

/**
 * Applies a patch to SKILL.md content with optional post-validation.
 *
 * @param content - Existing SKILL.md content.
 * @param patch - Candidate patch payload (typed or untyped).
 * @param options - Apply options for validation and expected match counts.
 * @returns Structured apply result with updated content or issues.
 * @example
 * ```ts
 * const result = applySkillPatch(content, {
 *   version: 1,
 *   operations: [{ type: "replace", before: "old", after: "new" }]
 * })
 * ```
 * @see https://agentskills.io/specification
 */
export function applySkillPatch(
  content: SkillContent,
  patch: unknown,
  options: SkillPatchApplyOptions = {}
): SkillPatchApplyResult {
  const validation = validateSkillPatch(patch);
  if (!validation.ok) {
    return { ok: false, errors: toValidationErrors(validation) };
  }

  if (!validation.patch) {
    return {
      ok: false,
      errors: [
        createIssue({
          code: 'OPERATION_INVALID',
          message: 'Patch validation succeeded but no normalized patch was returned.',
        }),
      ],
    };
  }

  const operations = validation.patch.operations;
  if (operations.length === 0) {
    const validateOption = options.validate ?? true;
    if (validateOption) {
      const expectedName =
        typeof validateOption === 'object' ? validateOption.expectedName : undefined;
      const issues = collectSkillValidationIssues(content, expectedName);
      if (issues.length > 0) {
        return { ok: false, errors: issues, appliedOperations: 0 };
      }
    }
    return { ok: true, content, appliedOperations: 0 };
  }

  let nextContent = content;
  let appliedOperations = 0;

  for (const [index, operation] of operations.entries()) {
    const expectedProvided =
      operation.expectedMatches !== undefined || options.expectedMatches !== undefined;
    const expectedMatches = normalizeExpectedMatches(
      operation.expectedMatches,
      options.expectedMatches
    );

    if (operation.type === 'replace') {
      const result = applyReplace(
        nextContent,
        operation.before,
        operation.after,
        index,
        expectedMatches,
        expectedProvided
      );
      if ('code' in result) {
        return { ok: false, errors: [result], appliedOperations };
      }
      nextContent = result.content;
      appliedOperations += 1;
      continue;
    }

    if (operation.type === 'delete') {
      const result = applyDelete(
        nextContent,
        operation.before,
        index,
        expectedMatches,
        expectedProvided
      );
      if ('code' in result) {
        return { ok: false, errors: [result], appliedOperations };
      }
      nextContent = result.content;
      appliedOperations += 1;
      continue;
    }

    const position = operation.position ?? 'after';
    const result = applyInsert(
      nextContent,
      operation.anchor,
      operation.text,
      position,
      index,
      expectedMatches,
      expectedProvided
    );
    if ('code' in result) {
      return { ok: false, errors: [result], appliedOperations };
    }
    nextContent = result.content;
    appliedOperations += 1;
  }

  const validateOption = options.validate ?? true;
  if (validateOption) {
    const expectedName =
      typeof validateOption === 'object' ? validateOption.expectedName : undefined;
    const issues = collectSkillValidationIssues(nextContent, expectedName);
    if (issues.length > 0) {
      return { ok: false, errors: issues, appliedOperations };
    }
  }

  return { ok: true, content: nextContent, appliedOperations };
}

const computeDiffMatrix = (base: string[], updated: string[]): Uint32Array[] => {
  const baseLen = base.length;
  const updatedLen = updated.length;
  const matrix: Uint32Array[] = Array.from(
    { length: baseLen + 1 },
    () => new Uint32Array(updatedLen + 1)
  );

  for (let i = 1; i <= baseLen; i += 1) {
    for (let j = 1; j <= updatedLen; j += 1) {
      if (base[i - 1] === updated[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]! + 1;
      } else {
        matrix[i]![j] = Math.max(matrix[i - 1]![j]!, matrix[i]![j - 1]!);
      }
    }
  }

  return matrix;
};

const appendDiffSegment = (
  segments: SkillDiffSegment[],
  type: SkillDiffSegmentType,
  lines: string[]
): void => {
  if (lines.length === 0) {
    return;
  }
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    last.lines.push(...lines);
    return;
  }
  segments.push({ type, lines: [...lines] });
};

const computeCommonPrefixLength = (base: string[], updated: string[]): number => {
  const limit = Math.min(base.length, updated.length);
  let index = 0;
  while (index < limit && base[index] === updated[index]) {
    index += 1;
  }
  return index;
};

const computeCommonSuffixLength = (
  base: string[],
  updated: string[],
  prefixLength: number
): number => {
  let baseIndex = base.length - 1;
  let updatedIndex = updated.length - 1;
  let suffixLength = 0;

  while (
    baseIndex >= prefixLength &&
    updatedIndex >= prefixLength &&
    base[baseIndex] === updated[updatedIndex]
  ) {
    suffixLength += 1;
    baseIndex -= 1;
    updatedIndex -= 1;
  }

  return suffixLength;
};

/**
 * Computes a line-based diff between two SKILL.md contents.
 *
 * @param base - Original SKILL.md content.
 * @param updated - Updated SKILL.md content.
 * @returns Grouped line diff segments.
 * @example
 * ```ts
 * const diff = diffSkillContent(baseContent, updatedContent)
 * ```
 * @see https://agentskills.io/specification
 */
export function diffSkillContent(base: SkillContent, updated: SkillContent): SkillLineDiff {
  const baseLines = base.split('\n');
  const updatedLines = updated.split('\n');
  const segments: SkillDiffSegment[] = [];
  const prefixLength = computeCommonPrefixLength(baseLines, updatedLines);
  const suffixLength = computeCommonSuffixLength(baseLines, updatedLines, prefixLength);

  const baseMiddle = baseLines.slice(prefixLength, baseLines.length - suffixLength);
  const updatedMiddle = updatedLines.slice(prefixLength, updatedLines.length - suffixLength);

  appendDiffSegment(segments, 'equal', baseLines.slice(0, prefixLength));

  if (baseMiddle.length > 0 || updatedMiddle.length > 0) {
    const matrix = computeDiffMatrix(baseMiddle, updatedMiddle);
    let i = baseMiddle.length;
    let j = updatedMiddle.length;
    const reversed: SkillDiffSegment[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && baseMiddle[i - 1] === updatedMiddle[j - 1]) {
        reversed.push({ type: 'equal', lines: [baseMiddle[i - 1]!] });
        i -= 1;
        j -= 1;
        continue;
      }

      if (j > 0 && (i === 0 || matrix[i]![j - 1]! >= matrix[i - 1]![j]!)) {
        reversed.push({ type: 'insert', lines: [updatedMiddle[j - 1]!] });
        j -= 1;
        continue;
      }

      reversed.push({ type: 'delete', lines: [baseMiddle[i - 1]!] });
      i -= 1;
    }

    reversed.reverse();
    for (const segment of reversed) {
      appendDiffSegment(segments, segment.type, segment.lines);
    }
  }

  if (suffixLength > 0) {
    appendDiffSegment(segments, 'equal', baseLines.slice(baseLines.length - suffixLength));
  }

  return {
    baseLineCount: baseLines.length,
    updatedLineCount: updatedLines.length,
    segments,
  };
}

const buildReplaceOperations = (
  diff: SkillDiffSegment[],
  contextLines: number
): SkillPatchReplaceOperation[] => {
  const operations: SkillPatchReplaceOperation[] = [];
  let leadingContext: string[] = [];
  let pending: { before: string[]; after: string[] } | null = null;

  for (const segment of diff) {
    if (segment.type === 'equal') {
      if (pending) {
        if (segment.lines.length > contextLines) {
          const trailing = segment.lines.slice(0, contextLines);
          pending.before.push(...trailing);
          pending.after.push(...trailing);
          operations.push({
            type: 'replace',
            before: pending.before.join('\n'),
            after: pending.after.join('\n'),
          });
          pending = null;
          leadingContext = contextLines > 0 ? segment.lines.slice(-contextLines) : [];
        } else {
          pending.before.push(...segment.lines);
          pending.after.push(...segment.lines);
        }
      } else {
        leadingContext = contextLines > 0 ? segment.lines.slice(-contextLines) : [];
      }
      continue;
    }

    if (!pending) {
      pending = {
        before: [...leadingContext],
        after: [...leadingContext],
      };
    }

    if (segment.type === 'delete') {
      pending.before.push(...segment.lines);
    } else {
      pending.after.push(...segment.lines);
    }
  }

  if (pending) {
    operations.push({
      type: 'replace',
      before: pending.before.join('\n'),
      after: pending.after.join('\n'),
    });
  }

  return operations;
};

/**
 * Creates a contextual replace patch from base and updated content.
 *
 * @param base - Original SKILL.md content.
 * @param updated - Updated SKILL.md content.
 * @param options - Patch generation options.
 * @returns Patch payload containing replace operations.
 * @example
 * ```ts
 * const patch = createSkillPatch(baseContent, updatedContent, { contextLines: 2 })
 * ```
 * @see https://agentskills.io/specification
 */
export function createSkillPatch(
  base: SkillContent,
  updated: SkillContent,
  options: SkillPatchCreateOptions = {}
): SkillPatch {
  if (base === updated) {
    return { version: 1, operations: [] };
  }

  const contextLines = Math.max(options.contextLines ?? DEFAULT_CONTEXT_LINES, 0);
  const diff = diffSkillContent(base, updated);
  const operations = buildReplaceOperations(diff.segments, contextLines);

  return {
    version: 1,
    operations,
  };
}
