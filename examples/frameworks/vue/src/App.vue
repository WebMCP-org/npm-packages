<script setup lang="ts">
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { onMounted } from 'vue';

onMounted(async () => {
  installWebMCP();

  await document.modelContext.registerTool({
    name: 'current_route',
    description: 'Returns the current route path',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => ({
      content: [{ type: 'text', text: window.location.pathname }],
    }),
  });
});
</script>

<template>
  <p>WebMCP tool "current_route" registered.</p>
</template>
