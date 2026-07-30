'use client';

import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    initializeWebMCPPolyfill();

    void document.modelContext.registerTool({
      name: 'get_status',
      description: 'Returns app status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => ({
        content: [{ type: 'text', text: 'Next.js app is running' }],
      }),
    });
  }, []);

  return <p>WebMCP tool "get_status" registered.</p>;
}
