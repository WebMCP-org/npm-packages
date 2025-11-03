import { createAnthropic } from '@ai-sdk/anthropic';
import { frontendTools } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';
import { convertToModelMessages, streamText } from 'ai';
import { cors } from 'hono/cors';
import { Hono } from 'hono/tiny';

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// CORS middleware - allow all origins for development
app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-Anthropic-API-Key', '*'],
    allowMethods: ['*'],
  })
);

// AI chat endpoint
app.post('/api/chat', async (c) => {
  // Get API key from header or fall back to environment variable
  const apiKey = c.req.header('X-Anthropic-API-Key') || c.env?.ANTHROPIC_API_KEY;
  console.log('Using Anthropic API Key:', apiKey ? 'Provided' : 'Missing');
  if (!apiKey) {
    return c.json({ error: 'Anthropic API key is required' }, 401);
  }

  // Create Anthropic provider with the API key
  const anthropic = createAnthropic({
    apiKey,
  });

  const body = (await c.req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    messages: convertToModelMessages(body.messages),
    // @ts-expect-error tools typing issue
    tools: {
      // @ts-expect-error tools typing issue
      ...frontendTools(body.tools),
    },
  });

  return result.toUIMessageStreamResponse();
});

export default app;
