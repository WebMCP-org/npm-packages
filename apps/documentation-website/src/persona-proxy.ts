import { createChatProxyApp, type AgentConfig } from '@runtypelabs/persona-proxy';

const DOCS_ASSISTANT: AgentConfig = {
  name: 'WebMCP Documentation Assistant',
  model: 'nemotron-3-ultra-550b-a55b',
  systemPrompt: `You answer questions about WebMCP and the documentation at https://docs.mcp-b.ai.

Use the read_current_docs_page WebMCP tool before answering questions about the page. Base documentation answers on tool results, and say when the current page does not contain enough information. Never print a tool call as JSON or describe a tool call instead of invoking the available tool. Never invent package APIs or WebMCP behavior. Keep answers concise and include relevant docs links when they are available in the page content.`,
  temperature: 0.2,
  tools: {
    maxToolCalls: 6,
    toolCallStrategy: 'auto',
  },
  loopConfig: {
    maxTurns: 8,
  },
};

export default {
  async fetch(request, env) {
    const apiKey = env.RUNTYPE_API_KEY || (await env.RUNTYPE_API_KEY_SECRET.get());

    const app = createChatProxyApp({
      apiKey,
      path: '/api/chat/dispatch',
      allowedOrigins: ['https://docs.mcp-b.ai', 'http://localhost:3000'],
      previewOriginPattern: false,
      agentConfig: DOCS_ASSISTANT,
    });

    return app.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
