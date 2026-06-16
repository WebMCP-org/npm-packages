import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: 'https://deeac9265a27366ab55cf0007ab9f4b9@o4510053563891712.ingest.us.sentry.io/4511057049026560',
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  enableLogs: true,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
