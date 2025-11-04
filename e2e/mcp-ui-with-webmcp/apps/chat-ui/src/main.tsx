import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UIResourceProvider } from './contexts/UIResourceContext';

// Initialize Sentry for error tracking and performance monitoring
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
const isDevelopment = environment === 'development';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment,
    // Setting this option to true will send default PII data to Sentry
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // Performance Monitoring
    tracesSampleRate: isDevelopment ? 1.0 : 0.2, // 100% in dev, 20% in production
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    // NOTE: Only trace our own API endpoints and known services to avoid CORS issues with external MCP servers
    tracePropagationTargets: [
      /^\/api\//, // Only same-origin API routes (e.g., /api/chat)
      /^https:\/\/.*\.workers\.dev/,
      /^https:\/\/.*\.anthropic\.com/,
    ],
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    // Ignore specific errors that are not actionable
    ignoreErrors: [
      // Browser extension errors
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      // Network errors that are expected
      'NetworkError',
      'Failed to fetch',
    ],
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <UIResourceProvider>
      <App />
    </UIResourceProvider>
  </ErrorBoundary>
);
