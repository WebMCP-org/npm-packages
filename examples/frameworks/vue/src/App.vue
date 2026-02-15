<script setup lang="ts">
import { onMounted } from "vue";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

onMounted(() => {
  initializeWebMCPPolyfill();

  navigator.modelContext.registerTool({
    name: "current_route",
    description: "Returns the current route path",
    inputSchema: {
      type: "object",
      properties: {},
    },
    execute: async () => ({
      content: [{ type: "text", text: window.location.pathname }],
    }),
  });
});
</script>

<template>
  <p>WebMCP tool "current_route" registered.</p>
</template>
