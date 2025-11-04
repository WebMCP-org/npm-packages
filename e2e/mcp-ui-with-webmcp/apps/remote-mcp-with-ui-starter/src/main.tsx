import { initializeWebModelContext } from '@mcp-b/global';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import { ErrorBoundary } from './ErrorBoundary';
import { TicTacToeWithWebMCP } from './TicTacToeWithWebMCP';

initializeWebModelContext({
  transport: {
    tabServer: {
      allowedOrigins: ['*'], // Allow any origin for iframe communication
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <TicTacToeWithWebMCP />
    </ErrorBoundary>
  </StrictMode>
);
