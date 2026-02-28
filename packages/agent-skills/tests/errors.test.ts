/**
 * Error types tests
 *
 * Following TDD: Tests written BEFORE implementation
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/errors.py
 */

import { describe, expect, it } from 'vitest';
import { ParseError, ValidationError } from '../src/errors';

describe('ParseError', () => {
  it('should create error with message', () => {
    const error = new ParseError('Invalid YAML');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid YAML');
    expect(error.name).toBe('ParseError');
  });

  it('should be catchable as Error', () => {
    try {
      throw new ParseError('Test error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ParseError);
    }
  });

  it('should have stack trace', () => {
    const error = new ParseError('Test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ParseError');
  });
});

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Missing required field: name');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Missing required field: name');
    expect(error.name).toBe('ValidationError');
  });

  it('should support multiple errors in message', () => {
    const errors = ['Name must be lowercase', 'Description exceeds limit'];
    const error = new ValidationError(errors.join('; '));
    expect(error.message).toContain('Name must be lowercase');
    expect(error.message).toContain('Description exceeds limit');
  });

  it('should be catchable as Error', () => {
    try {
      throw new ValidationError('Test error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
    }
  });

  it('should have stack trace', () => {
    const error = new ValidationError('Test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ValidationError');
  });

  it('should be distinguishable from ParseError', () => {
    const parseError = new ParseError('Parse');
    const validationError = new ValidationError('Validation');

    expect(parseError).toBeInstanceOf(ParseError);
    expect(parseError).not.toBeInstanceOf(ValidationError);
    expect(validationError).toBeInstanceOf(ValidationError);
    expect(validationError).not.toBeInstanceOf(ParseError);
  });
});
