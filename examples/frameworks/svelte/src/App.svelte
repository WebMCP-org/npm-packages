<script lang="ts">
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { onMount } from 'svelte';

onMount(() => {
  initializeWebMCPPolyfill();

  navigator.modelContext.registerTool({
    name: 'get_info',
    description: 'Returns basic app info',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => ({
      content: [{ type: 'text', text: 'Svelte app is running' }],
    }),
  });
});
</script>

<p>WebMCP tool "get_info" registered.</p>
