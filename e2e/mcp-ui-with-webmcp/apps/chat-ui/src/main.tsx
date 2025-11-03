import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UIResourceProvider } from './contexts/UIResourceContext';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <UIResourceProvider>
      <App />
    </UIResourceProvider>
  </ErrorBoundary>
);
