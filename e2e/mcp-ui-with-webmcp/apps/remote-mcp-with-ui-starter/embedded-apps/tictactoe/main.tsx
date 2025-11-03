import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TicTacToeWithWebMCP } from '../../src/TicTacToeWithWebMCP';
import '../../src/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TicTacToeWithWebMCP />
  </StrictMode>
);
