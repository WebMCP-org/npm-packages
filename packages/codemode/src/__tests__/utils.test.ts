import { describe, expect, it } from 'vitest';
import {
  escapeJsDoc,
  escapeStringLiteral,
  quoteProp,
  sanitizeToolName,
  toPascalCase,
} from '../utils';

describe('sanitizeToolName', () => {
  it('should replace hyphens with underscores', () => {
    expect(sanitizeToolName('get-weather')).toBe('get_weather');
  });

  it('should replace dots with underscores', () => {
    expect(sanitizeToolName('api.v2.search')).toBe('api_v2_search');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeToolName('my tool')).toBe('my_tool');
  });

  it('should prefix digit-leading names with underscore', () => {
    expect(sanitizeToolName('3drender')).toBe('_3drender');
  });

  it('should append underscore to reserved words', () => {
    expect(sanitizeToolName('class')).toBe('class_');
    expect(sanitizeToolName('return')).toBe('return_');
    expect(sanitizeToolName('delete')).toBe('delete_');
  });

  it('should strip special characters', () => {
    expect(sanitizeToolName('hello@world!')).toBe('helloworld');
  });

  it('should handle empty string', () => {
    expect(sanitizeToolName('')).toBe('_');
  });

  it('should handle string with only special characters', () => {
    expect(sanitizeToolName('@#$')).toBe('$');
    expect(sanitizeToolName('@#!')).toBe('_');
  });

  it('should leave valid identifiers unchanged', () => {
    expect(sanitizeToolName('getWeather')).toBe('getWeather');
    expect(sanitizeToolName('_private')).toBe('_private');
    expect(sanitizeToolName('$jquery')).toBe('$jquery');
  });
});

describe('toPascalCase', () => {
  it('converts underscore-separated to PascalCase', () => {
    expect(toPascalCase('get_weather')).toBe('GetWeather');
  });

  it('capitalizes first letter', () => {
    expect(toPascalCase('hello')).toBe('Hello');
  });

  it('handles already PascalCase', () => {
    expect(toPascalCase('GetWeather')).toBe('GetWeather');
  });
});

describe('escapeJsDoc', () => {
  it('escapes star-slash sequences', () => {
    expect(escapeJsDoc('foo*/')).toBe('foo*\\/');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeJsDoc('hello world')).toBe('hello world');
  });
});

describe('quoteProp', () => {
  it('does not quote valid identifiers', () => {
    expect(quoteProp('name')).toBe('name');
    expect(quoteProp('_private')).toBe('_private');
  });

  it('quotes names with hyphens', () => {
    expect(quoteProp('my-prop')).toBe('"my-prop"');
  });

  it('quotes names starting with digits', () => {
    expect(quoteProp('3d')).toBe('"3d"');
  });
});

describe('escapeStringLiteral', () => {
  it('escapes backslashes', () => {
    expect(escapeStringLiteral('a\\b')).toBe('a\\\\b');
  });

  it('escapes double quotes', () => {
    expect(escapeStringLiteral('say "hi"')).toBe('say \\"hi\\"');
  });

  it('escapes newlines', () => {
    expect(escapeStringLiteral('line1\nline2')).toBe('line1\\nline2');
  });
});
