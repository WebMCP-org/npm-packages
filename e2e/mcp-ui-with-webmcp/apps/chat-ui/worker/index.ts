import { createAnthropic } from '@ai-sdk/anthropic';
import { frontendTools } from '@assistant-ui/react-ai-sdk';
import * as Sentry from '@sentry/cloudflare';
import type { UIMessage } from 'ai';
import { convertToModelMessages, streamText } from 'ai';
import { cors } from 'hono/cors';
import { Hono } from 'hono/tiny';

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// CORS middleware - allow all origins for development
// Explicitly allow Sentry tracing headers to avoid CORS issues
app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-Anthropic-API-Key', 'sentry-trace', 'baggage', '*'],
    allowMethods: ['*'],
    exposeHeaders: ['*'],
  })
);

// AI chat endpoint
app.post('/api/chat', async (c) => {
  try {
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
      // Enable AI agent monitoring in Sentry
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'chat-api-endpoint',
        recordInputs: true,
        recordOutputs: true,
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Log error details before capturing in Sentry
    console.error('Error in /api/chat:', error);

    // Capture error in Sentry
    Sentry.captureException(error);

    // Return user-friendly error response
    return c.json(
      {
        error: 'Failed to process chat request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// Wrap the app with Sentry for error tracking and performance monitoring
export default Sentry.withSentry((env) => {
  const workerEnv = env as Env | undefined;
  return {
    dsn:
      workerEnv?.SENTRY_DSN ||
      'https://d7ac48e8b2390c1569059b7b184896f5@o4510053563891712.ingest.us.sentry.io/4510304218972160',
    environment: workerEnv?.ENVIRONMENT || 'production',
    // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing
    tracesSampleRate: workerEnv?.ENVIRONMENT === 'development' ? 1.0 : 0.2,
    // Send structured logs to Sentry
    enableLogs: true,
    // Setting this option to true will send default PII data to Sentry
    sendDefaultPii: true,
    // Enable AI agent monitoring with Vercel AI SDK integration
    integrations: [Sentry.vercelAIIntegration()],
  };
}, app);
