import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATIC_TOOL_INPUT_SHAPE,
  publicInputSchemaFromZodShape,
  WEBMCP_CALL_TOOL_INPUT_SHAPE,
  WEBMCP_OPEN_PAGE_INPUT_SHAPE,
} from './staticToolSchemas.js';

describe('staticToolSchemas', () => {
  it('converts an empty Zod shape into the MCP default object schema', () => {
    expect(publicInputSchemaFromZodShape(EMPTY_STATIC_TOOL_INPUT_SHAPE)).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('derives the public webmcp_call_tool schema from the Zod source shape', () => {
    const schema = publicInputSchemaFromZodShape(WEBMCP_CALL_TOOL_INPUT_SHAPE);

    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toMatchObject({
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'The tool name to call. Use webmcp_list_tools to see available tool names.',
        },
        arguments: {
          type: 'object',
          description:
            'Arguments to pass to the tool as a JSON object. Check the tool inputSchema from webmcp_list_tools for expected fields.',
        },
      },
    });
    expect((schema.properties as Record<string, unknown>).arguments).toMatchObject({
      propertyNames: { type: 'string' },
      additionalProperties: {},
    });
  });

  it('derives the public webmcp_open_page schema from the Zod source shape', () => {
    const schema = publicInputSchemaFromZodShape(WEBMCP_OPEN_PAGE_INPUT_SHAPE);

    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toEqual({
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open or match for refresh.',
        },
        refresh: {
          type: 'boolean',
          description:
            'If true, refresh the connected source matching this URL instead of opening a new tab.',
        },
      },
      required: ['url'],
    });
  });
});
