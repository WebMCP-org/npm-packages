<script lang="ts">
  import { onMount } from 'svelte';
  import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

  onMount(() => {
    initializeWebMCPPolyfill();

    navigator.modelContext.registerTool({
      name: 'ping',
      description: 'Returns pong',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => ({
        content: [{ type: 'text', text: 'pong' }],
      }),
    });
  });
</script>

<p>WebMCP tool "ping" registered.</p>
