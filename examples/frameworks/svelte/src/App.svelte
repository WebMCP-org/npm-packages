<script lang="ts">
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { onMount } from 'svelte';

onMount(async () => {
  installWebMCP();

  await document.modelContext.registerTool({
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
