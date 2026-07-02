import type { JsonSchemaForInference } from '@mcp-b/webmcp-types';

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['query'],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

document.modelContext.registerTool({
  name: 'search',
  description: 'Search indexed docs',
  inputSchema,
  async execute(args) {
    return {
      content: [{ type: 'text', text: `Searching for ${args.query}` }],
    };
  },
});
