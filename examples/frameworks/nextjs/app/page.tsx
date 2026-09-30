'use client';

import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    installWebMCP();
    if (!document.modelContext) throw new Error('WebMCP is unavailable');

    const controller = new AbortController();
    document.modelContext
      .registerTool(
        {
          name: 'get_status',
          description: 'Returns app status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          execute: async () => ({
            content: [{ type: 'text', text: 'Next.js app is running' }],
          }),
        },
        { signal: controller.signal }
      )
      .catch((error) => {
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, []);

  return <p>WebMCP tool "get_status" registered.</p>;
}
