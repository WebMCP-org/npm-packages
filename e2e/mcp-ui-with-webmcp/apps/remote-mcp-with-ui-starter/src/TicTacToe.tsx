import { useState } from 'react';

export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];

interface TicTacToeProps {
  /**
   * Whether to show animations on moves and wins
   * @default true
   */
  animated?: boolean;
  /**
   * External board state (for controlled component mode)
   */
  board?: Board;
  /**
   * External current player (for controlled component mode)
   */
  currentPlayer?: Player;
  /**
   * External winner state (for controlled component mode)
   */
  winner?: Player | 'Draw' | null;
  /**
   * External winning line (for controlled component mode)
   */
  winningLine?: number[] | null;
  /**
   * Callback when a move is made
   * @param index - Cell index (0-8)
   * @param player - Player who made the move
   * @param newBoard - Board state after the move
   */
  onMove?: (index: number, player: Player, newBoard: Board) => void;
  /**
   * Callback when game is reset
   */
  onReset?: () => void;
}

/**
 * A fully functional Tic-Tac-Toe game component
 * Can be used as controlled (external state) or uncontrolled (internal state) component
 */
export const TicTacToe: React.FC<TicTacToeProps> = ({
  animated = true,
  board: externalBoard,
  currentPlayer: externalCurrentPlayer,
  winner: externalWinner,
  winningLine: externalWinningLine,
  onMove,
  onReset,
}) => {
  // Internal state (used when not controlled)
  const [internalBoard, setInternalBoard] = useState<Board>([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  const [internalCurrentPlayer, setInternalCurrentPlayer] = useState<Player>('X');
  const [internalWinner, setInternalWinner] = useState<Player | 'Draw' | null>(null);
  const [internalWinningLine, setInternalWinningLine] = useState<number[] | null>(null);

  // Use external state if provided, otherwise use internal state
  const board = externalBoard ?? internalBoard;
  const currentPlayer = externalCurrentPlayer ?? internalCurrentPlayer;
  const winner = externalWinner ?? internalWinner;
  const winningLine = externalWinningLine ?? internalWinningLine;

  // Check if component is controlled
  const isControlled = externalBoard !== undefined;

  // All possible winning combinations
  const winningCombinations = [
    [0, 1, 2], // Top row
    [3, 4, 5], // Middle row
    [6, 7, 8], // Bottom row
    [0, 3, 6], // Left column
    [1, 4, 7], // Middle column
    [2, 5, 8], // Right column
    [0, 4, 8], // Diagonal top-left to bottom-right
    [2, 4, 6], // Diagonal top-right to bottom-left
  ];

  /**
   * Check if there's a winner or draw
   * Returns game status without modifying state
   */
  const checkGameStatus = (
    currentBoard: Board
  ): {
    winner: Player | 'Draw' | null;
    winningLine: number[] | null;
  } => {
    // Check for winner
    for (const combination of winningCombinations) {
      const [a, b, c] = combination as [number, number, number];
      if (
        currentBoard[a] &&
        currentBoard[a] === currentBoard[b] &&
        currentBoard[a] === currentBoard[c]
      ) {
        return {
          winner: currentBoard[a] as Player,
          winningLine: combination,
        };
      }
    }

    // Check for draw
    if (currentBoard.every((cell) => cell !== null)) {
      return { winner: 'Draw', winningLine: null };
    }

    return { winner: null, winningLine: null };
  };

  /**
   * Handle cell click
   */
  const handleCellClick = (index: number): void => {
    // Don't allow moves if game is over or cell is already filled
    if (winner || board[index]) {
      return;
    }

    // Make the move
    const newBoard = [...board] as Board;
    newBoard[index] = currentPlayer;

    if (isControlled) {
      // In controlled mode, notify parent via callback
      onMove?.(index, currentPlayer, newBoard);
    } else {
      // In uncontrolled mode, update internal state
      setInternalBoard(newBoard);

      // Check game status
      const gameStatus = checkGameStatus(newBoard);
      setInternalWinner(gameStatus.winner);
      setInternalWinningLine(gameStatus.winningLine);

      // Switch player
      setInternalCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');

      // Still call onMove callback if provided
      onMove?.(index, currentPlayer, newBoard);
    }
  };

  /**
   * Reset the game
   */
  const resetGame = (): void => {
    if (isControlled) {
      // In controlled mode, notify parent via callback
      onReset?.();
    } else {
      // In uncontrolled mode, reset internal state
      setInternalBoard([null, null, null, null, null, null, null, null, null]);
      setInternalCurrentPlayer('X');
      setInternalWinner(null);
      setInternalWinningLine(null);

      // Still call onReset callback if provided
      onReset?.();
    }
  };

  /**
   * Check if a cell is part of the winning line
   */
  const isWinningCell = (index: number): boolean => {
    return winningLine?.includes(index) ?? false;
  };

  /**
   * Get game over message
   */
  const getGameOverMessage = (): string | null => {
    if (winner === 'Draw') {
      return "It's a draw!";
    }
    if (winner) {
      return `Player ${winner} wins!`;
    }
    return null;
  };

  return (
    <div className={`tic-tac-toe ${animated ? 'animated' : ''}`}>
      <div className="tic-tac-toe-board">
        {board.map((cell, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: TicTacToe board positions are stable and never reorder
            key={`cell-${index}`}
            className={`tic-tac-toe-cell ${cell ? 'filled' : ''} ${
              isWinningCell(index) ? 'winning-cell' : ''
            } ${cell === 'X' ? 'player-x' : cell === 'O' ? 'player-o' : ''}`}
            onClick={() => handleCellClick(index)}
            disabled={!!winner || !!cell}
            aria-label={`Cell ${index + 1}${cell ? `, ${cell}` : ''}`}
          >
            {cell && <span className="cell-value">{cell}</span>}
          </button>
        ))}

        {winner && (
          <div className="tic-tac-toe-game-over-overlay">
            <div className="tic-tac-toe-game-over-message">{getGameOverMessage()}</div>
            <button className="tic-tac-toe-reset-overlay" onClick={resetGame}>
              New Game
            </button>
          </div>
        )}
      </div>

      <style>{`
        .tic-tac-toe {
          display: inline-block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .tic-tac-toe-board {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.625rem;
          padding: 1.25rem;
          background: #f0f0f0;
          border-radius: 1rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        /* Responsive padding for mobile */
        @media (max-width: 768px) {
          .tic-tac-toe-board {
            gap: 0.5rem;
            padding: 1rem;
          }
        }

        @media (max-width: 480px) {
          .tic-tac-toe-board {
            gap: 0.4rem;
            padding: 0.75rem;
          }
        }

        @media (prefers-color-scheme: dark) {
          .tic-tac-toe-board {
            background: #2a2a2a;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          }
        }

        .tic-tac-toe-cell {
          width: 140px;
          height: 140px;
          font-size: 3.5rem;
          font-weight: 700;
          background: white;
          border: 3px solid #ddd;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        /* Responsive sizing for mobile */
        @media (max-width: 768px) {
          .tic-tac-toe-cell {
            width: 90px;
            height: 90px;
            font-size: 2.25rem;
          }
        }

        @media (max-width: 480px) {
          .tic-tac-toe-cell {
            width: 75px;
            height: 75px;
            font-size: 2rem;
          }
        }

        @media (prefers-color-scheme: dark) {
          .tic-tac-toe-cell {
            background: #1a1a1a;
            border-color: #444;
          }
        }

        .tic-tac-toe-cell:not(:disabled):not(.filled):hover {
          background: #f8f8f8;
          border-color: #999;
          transform: scale(1.05);
        }

        @media (prefers-color-scheme: dark) {
          .tic-tac-toe-cell:not(:disabled):not(.filled):hover {
            background: #252525;
            border-color: #666;
          }
        }

        .tic-tac-toe-cell:disabled {
          cursor: not-allowed;
        }

        .tic-tac-toe-cell.filled {
          cursor: default;
        }

        .tic-tac-toe-cell.player-x {
          color: #2196F3;
        }

        .tic-tac-toe-cell.player-o {
          color: #f44336;
        }

        .tic-tac-toe-cell.winning-cell {
          background: #4CAF50 !important;
          border-color: #45a049 !important;
          color: white !important;
        }

        .tic-tac-toe.animated .cell-value {
          animation: cellAppear 0.3s ease;
        }

        .tic-tac-toe.animated .winning-cell {
          animation: winningPulse 0.5s ease infinite alternate;
        }

        @keyframes cellAppear {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes winningPulse {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.05);
          }
        }

        .tic-tac-toe-game-over-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          border-radius: 1rem;
          pointer-events: none;
        }

        .tic-tac-toe-game-over-message {
          font-size: 1.5rem;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
          pointer-events: none;
        }

        @media (max-width: 480px) {
          .tic-tac-toe-game-over-message {
            font-size: 1.125rem;
          }
        }

        .tic-tac-toe-reset-overlay {
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          border: 2px solid #fff;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          pointer-events: auto;
        }

        @media (max-width: 480px) {
          .tic-tac-toe-reset-overlay {
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
          }
        }

        .tic-tac-toe-reset-overlay:hover {
          transform: scale(1.05);
          border-width: 3px;
        }

        .tic-tac-toe-reset-overlay:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
};
