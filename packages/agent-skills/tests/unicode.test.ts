/**
 * Unicode utilities tests
 */

import { describe, expect, it } from 'vitest';
import { normalizeNFKC } from '../src/utils/unicode';

describe('normalizeNFKC', () => {
  it('should normalize decomposed characters', () => {
    const decomposedCafe = 'cafe\u0301';
    const normalized = normalizeNFKC(decomposedCafe);
    expect(normalized).toBe('café');
  });

  it('should preserve already composed characters', () => {
    const composed = 'café';
    const normalized = normalizeNFKC(composed);
    expect(normalized).toBe('café');
  });

  it('should normalize Russian text', () => {
    const text = 'навык';
    const normalized = normalizeNFKC(text);
    expect(normalized).toBe('навык');
  });

  it('should normalize Chinese text', () => {
    const text = '技能';
    const normalized = normalizeNFKC(text);
    expect(normalized).toBe('技能');
  });

  it('should handle empty string', () => {
    expect(normalizeNFKC('')).toBe('');
  });

  it('should handle ASCII text', () => {
    expect(normalizeNFKC('hello-world')).toBe('hello-world');
  });
});
