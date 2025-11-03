import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UIResourceProvider } from './contexts/UIResourceContext';

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
