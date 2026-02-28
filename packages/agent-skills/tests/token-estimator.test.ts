/**
 * Token estimator tests
 *
 * Following TDD: Tests written BEFORE implementation
 */

import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../src/utils/token-estimator';

describe('estimateTokens', () => {
  it('should estimate tokens for simple text', () => {
    const text = 'This is a test skill description';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(15);
  });

  it('should estimate tokens for YAML frontmatter', () => {
    const text = `name: my-skill
description: A test skill that does something useful`;
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(25);
  });

  it('should estimate tokens for full SKILL.md', () => {
    const text = `---
name: my-skill
description: A test skill
---
# My Skill

This skill provides useful functionality for testing.

## Usage

Use this skill when you need to test things.`;

    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(30);
    expect(tokens).toBeLessThan(100);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return at least 1 token for short text', () => {
    expect(estimateTokens('hi')).toBeGreaterThan(0);
  });

  it('should scale roughly with text length', () => {
    const short = estimateTokens('test');
    const long = estimateTokens('test '.repeat(100));
    expect(long).toBeGreaterThan(short * 10);
  });
});
