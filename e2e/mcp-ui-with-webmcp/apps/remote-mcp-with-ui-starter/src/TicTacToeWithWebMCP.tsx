import { useWebMCP } from '@mcp-b/react-webmcp';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { type Board, type Player, TicTacToe } from './TicTacToe';

type GameStatus = {
  winner: Player | 'Draw' | null;
  winningLine: number[] | null;
};

type MoveResult =
  | { ok: true; board: Board; status: GameStatus; nextPlayer: Player | null }
  | { ok: false; message: string };

type MoveNotificationParams = {
  index: number;
  actor: Player;
  board: Board;
  status: GameStatus;
  nextPlayer: Player | null;
  humanPlayer: Player;
  agentPlayer: Player;
};

type NewGameNotificationParams = {
  board: Board;
  currentPlayer: Player;
  humanPlayer: Player;
  agentPlayer: Player;
};

const WINNING_COMBINATIONS: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const createEmptyBoard = (): Board => Array(9).fill(null) as Board;

const evaluateBoard = (board: Board): GameStatus => {
  for (const combination of WINNING_COMBINATIONS) {
    const [a, b, c] = combination;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return {
        winner: board[a],
        winningLine: combination,
      };
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { winner: 'Draw', winningLine: null };
  }

  return { winner: null, winningLine: null };
};

const getAvailableMoves = (board: Board): number[] =>
  board
    .map((cell, index) => (cell === null ? index : null))
    .filter((value): value is number => value !== null);

const formatBoardMarkdown = (board: Board): string => {
  const cells = board.map((cell) => cell ?? ' ');

  return [
    '## Current Board State',
    '',
    '```',
    ` ${cells[0]} | ${cells[1]} | ${cells[2]}`,
    '-----------',
    ` ${cells[3]} | ${cells[4]} | ${cells[5]}`,
    '-----------',
    ` ${cells[6]} | ${cells[7]} | ${cells[8]}`,
    '```',
    '',
    '**Position Reference:**',
    '```',
    ' 0 | 1 | 2',
    '-----------',
    ' 3 | 4 | 5',
    '-----------',
    ' 6 | 7 | 8',
    '```',
  ].join('\n');
};

const formatGameStateMarkdown = (
  board: Board,
  currentPlayer: Player,
  winner: Player | 'Draw' | null,
  humanPlayer: Player,
  agentPlayer: Player
): string => {
  const availableMoves = getAvailableMoves(board);

  const lines: string[] = [
    '# Tic-Tac-Toe Game State',
    '',
    '**Player Roles:**',
    `- Player ${humanPlayer} = Human`,
    `- Player ${agentPlayer} = AI/Assistant`,
    '',
    formatBoardMarkdown(board),
    '',
  ];

  if (winner === 'Draw') {
    lines.push("**Status:** Game Over - It's a draw!");
  } else if (winner) {
    const winnerLabel = winner === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push(`**Status:** Game Over - Player ${winner} (${winnerLabel}) wins!`);
  } else {
    const currentRole = currentPlayer === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push('**Status:** Game in progress');
    lines.push(`**Current Turn:** Player ${currentPlayer} (${currentRole})`);
    if (currentPlayer === humanPlayer) {
      lines.push('**Action:** Waiting for the human to move via the UI.');
    } else {
      lines.push('**Action:** Awaiting AI/Assistant move.');
    }
    if (availableMoves.length > 0) {
      lines.push(`**Available Moves:** ${availableMoves.join(', ')}`);
    }
  }

  return lines.join('\n');
};

const formatMoveMarkdown = (
  player: Player,
  index: number,
  board: Board,
  status: GameStatus,
  nextPlayer: Player | null,
  humanPlayer: Player,
  agentPlayer: Player
): string => {
  const lines: string[] = [
    '# Move Successful',
    '',
    `Player ${player} (${player === humanPlayer ? 'Human' : 'AI/Assistant'}) placed at position ${index}.`,
    '',
    formatBoardMarkdown(board),
    '',
  ];

  if (status.winner === 'Draw') {
    lines.push("**Game Over:** It's a draw!");
  } else if (status.winner) {
    const winnerLabel = status.winner === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push(`**Game Over:** Player ${status.winner} (${winnerLabel}) wins!`);
  } else if (nextPlayer) {
    const nextLabel = nextPlayer === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push(`**Next Turn:** Player ${nextPlayer} (${nextLabel})`);
    if (nextPlayer === agentPlayer) {
      lines.push('**Reminder:** You are the AI/Assistant—make your move using this tool.');
    }

    const remainingMoves = getAvailableMoves(board);
    if (remainingMoves.length > 0) {
      lines.push(`**Available Moves:** ${remainingMoves.join(', ')}`);
    }
  }

  return lines.join('\n');
};

const formatResetMarkdown = (board: Board, humanPlayer: Player, agentPlayer: Player): string => {
  const availableMoves = getAvailableMoves(board);

  const lines: string[] = [
    '# Game Reset',
    '',
    `Human plays as Player ${humanPlayer}.`,
    `AI/Assistant plays as Player ${agentPlayer}.`,
    '',
    formatBoardMarkdown(board),
    '',
    '**Status:** New game started. Player X goes first.',
  ];

  if (agentPlayer === 'X') {
    lines.push('**Action:** AI/Assistant opens the game.');
  } else {
    lines.push('**Action:** Human opens the game via the UI.');
  }

  if (availableMoves.length > 0) {
    lines.push(`**Available Moves:** ${availableMoves.join(', ')}`);
  }

  return lines.join('\n');
};

const formatMoveNotification = ({
  index,
  actor,
  board,
  status,
  nextPlayer,
  humanPlayer,
  agentPlayer,
}: MoveNotificationParams): string => {
  const lines: string[] = [
    '# Tic-Tac-Toe Update',
    '',
    `- Move: Player ${actor} (${actor === humanPlayer ? 'Human' : 'AI/Assistant'}) placed at position ${index}.`,
    `- Human plays as Player ${humanPlayer}`,
    `- AI/Assistant plays as Player ${agentPlayer}`,
    '',
  ];

  if (status.winner === 'Draw') {
    lines.push("**Status:** Game over – it's a draw.");
  } else if (status.winner) {
    const winnerLabel = status.winner === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push(`**Status:** Game over – Player ${status.winner} (${winnerLabel}) wins!`);
  } else if (nextPlayer) {
    const nextLabel = nextPlayer === humanPlayer ? 'Human' : 'AI/Assistant';
    lines.push(`**Next Turn:** Player ${nextPlayer} (${nextLabel})`);
    if (nextPlayer === agentPlayer) {
      lines.push('**Action:** Awaiting AI/Assistant move.');
    }
  }

  const availableMoves = getAvailableMoves(board);
  if (!status.winner && availableMoves.length > 0) {
    lines.push(`**Available Moves:** ${availableMoves.join(', ')}`);
  }

  lines.push('', formatBoardMarkdown(board));

  return lines.join('\n');
};

const formatNewGameNotification = ({
  board,
  currentPlayer,
  humanPlayer,
  agentPlayer,
}: NewGameNotificationParams): string => {
  const availableMoves = getAvailableMoves(board);

  const lines: string[] = [
    '# Tic-Tac-Toe New Game',
    '',
    `- Human plays as Player ${humanPlayer}`,
    `- AI/Assistant plays as Player ${agentPlayer}`,
    '',
  ];

  if (currentPlayer === agentPlayer) {
    lines.push('**Next Turn:** AI/Assistant opens the game.');
    lines.push('**Action:** Awaiting AI/Assistant move.');
  } else {
    lines.push('**Next Turn:** Human opens the game via the UI.');
  }

  if (availableMoves.length > 0) {
    lines.push(`**Available Moves:** ${availableMoves.join(', ')}`);
  }

  lines.push('', formatBoardMarkdown(board));

  return lines.join('\n');
};

interface TicTacToeWithWebMCPProps {
  /**
   * Whether to show animations on moves and wins
   * @default true
   */
  animated?: boolean;
}

/**
 * TicTacToeWithWebMCP Component
 *
 * This component wraps the pure TicTacToe game component with WebMCP integration.
 * It demonstrates how to:
 * 1. Register dynamic tools using useWebMCP hook
 * 2. Communicate with parent window via postMessage
 * 3. Handle parent-child readiness protocol
 * 4. Manage game state and tool execution
 *
 * The component registers 3 WebMCP tools:
 * - tictactoe_get_state: Read current game state
 * - tictactoe_ai_move: Make a move as the AI player
 * - tictactoe_reset: Reset the game
 *
 * @example
 * // In mini-apps/tictactoe/main.tsx:
 * initializeWebModelContext({ transport: { tabServer: {...} } });
 * render(<TicTacToeWithWebMCP />);
 */
export const TicTacToeWithWebMCP: React.FC<TicTacToeWithWebMCPProps> = ({ animated = true }) => {
  // Game state
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [humanPlayer, setHumanPlayer] = useState<Player>('X');

  // WebMCP/Parent communication state
  const [isParentReady, setIsParentReady] = useState<boolean>(false);

  // UI state
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(true);
  const [isWaitingForAIMove, setIsWaitingForAIMove] = useState<boolean>(false);

  // Derived state: AI plays the opposite of human
  const agentPlayer: Player = humanPlayer === 'X' ? 'O' : 'X';

  /**
   * Parent Readiness Protocol
   *
   * This effect handles the "parent readiness" protocol, which ensures
   * that the parent window (AI assistant) is ready to receive messages
   * before the child (this iframe) starts sending tool registrations
   * and notifications.
   *
   * Protocol flow:
   * 1. Child sends "ui-lifecycle-iframe-ready" on mount
   * 2. Parent responds with one of several "ready" message types
   * 3. Child sets isParentReady=true
   * 4. Child can now safely register tools and send notifications
   *
   * This prevents race conditions where the child sends messages
   * before the parent is listening.
   */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const embedded = window.parent !== window;

    if (!embedded) {
      setIsParentReady(true);
      return;
    }

    const markReady = () => {
      setIsParentReady((prev) => (prev ? prev : true));
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      const { type, payload } = data as {
        type?: string;
        payload?: unknown;
      };

      if (type === 'ui-lifecycle-iframe-render-data') {
        markReady();
        return;
      }

      if (type === 'parent-ready') {
        markReady();
        return;
      }

      if (payload && typeof payload === 'object') {
        const maybePayload = payload as {
          ready?: unknown;
          status?: unknown;
          response?: { status?: unknown };
        };

        if (
          maybePayload.response &&
          typeof maybePayload.response === 'object' &&
          'status' in maybePayload.response &&
          maybePayload.response.status === 'ready'
        ) {
          markReady();
          return;
        }

        if (maybePayload.status === 'ready' || maybePayload.ready === true) {
          markReady();
          return;
        }
      }

      if (type === 'ui-message-response' || type === 'ui-message-received') {
        markReady();
      }
    };

    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const performReset = useCallback(
    (nextHumanPlayer: Player = humanPlayer) => {
      const chosenHuman = nextHumanPlayer;
      const nextAgent: Player = chosenHuman === 'X' ? 'O' : 'X';
      const freshBoard = createEmptyBoard();

      setHumanPlayer(chosenHuman);
      setBoard(freshBoard);
      setWinner(null);
      setWinningLine(null);
      setCurrentPlayer('X');

      return { board: freshBoard, human: chosenHuman, agent: nextAgent };
    },
    [humanPlayer]
  );

  const performMove = useCallback(
    (index: number, actor: Player): MoveResult => {
      if (!Number.isInteger(index) || index < 0 || index > 8) {
        return { ok: false, message: 'Position must be an integer between 0 and 8.' };
      }

      if (winner) {
        const ending =
          winner === 'Draw'
            ? 'The game already ended in a draw. Call `tictactoe_reset` to start over.'
            : `Player ${winner} already won. Call \`tictactoe_reset\` to start a new game.`;
        return { ok: false, message: ending };
      }

      if (actor !== currentPlayer) {
        return { ok: false, message: `It's Player ${currentPlayer}'s turn.` };
      }

      if (board[index]) {
        return {
          ok: false,
          message: `Cell ${index} is already occupied by Player ${board[index]}. Choose an empty cell.`,
        };
      }

      const nextBoard = [...board] as Board;
      nextBoard[index] = actor;

      const status = evaluateBoard(nextBoard);
      const toggledPlayer = actor === 'X' ? 'O' : 'X';

      setBoard(nextBoard);
      setWinner(status.winner);
      setWinningLine(status.winningLine);
      setCurrentPlayer(toggledPlayer);

      return {
        ok: true,
        board: nextBoard,
        status,
        nextPlayer: status.winner ? null : toggledPlayer,
      };
    },
    [board, currentPlayer, winner]
  );

  const postNotifyMarkdown = useCallback(
    (content: string, logLabel: string) => {
      if (!isParentReady) {
        console.info(`[TicTacToe] Deferred notify until parent ready: ${logLabel}`);
        return;
      }

      if (typeof window === 'undefined' || window.parent === window) {
        return;
      }

      window.parent.postMessage(
        {
          type: 'notify',
          payload: { message: content },
        },
        '*'
      );

      console.log(`📤 ${logLabel}`);
    },
    [isParentReady]
  );

  const notifyParent = useCallback(
    (index: number, actor: Player, boardState: Board, status: GameStatus, next: Player | null) => {
      const content = formatMoveNotification({
        index,
        actor,
        board: boardState,
        status,
        nextPlayer: next,
        humanPlayer,
        agentPlayer,
      });

      postNotifyMarkdown(content, 'Move update delivered to parent');
    },
    [agentPlayer, humanPlayer, postNotifyMarkdown]
  );

  const announceNewGame = useCallback(
    (boardState: Board, human: Player, agent: Player) => {
      const content = formatNewGameNotification({
        board: boardState,
        currentPlayer: 'X',
        humanPlayer: human,
        agentPlayer: agent,
      });

      postNotifyMarkdown(content, 'New game announcement delivered to parent');
    },
    [postNotifyMarkdown]
  );

  const handleUserMove = useCallback(
    (index: number, player: Player) => {
      if (!isParentReady) {
        console.warn('[TicTacToe] Ignoring move until parent signals readiness.');
        return;
      }

      if (isRoleModalOpen) {
        console.warn('[TicTacToe] Move blocked while awaiting new game selection.');
        return;
      }

      if (isWaitingForAIMove) {
        console.warn('[TicTacToe] Move blocked while waiting for AI to respond.');
        return;
      }

      const result = performMove(index, player);
      if (!result.ok) {
        console.warn(`[TicTacToe] ${result.message}`);
        return;
      }

      // If AI is next, block UI until AI responds
      if (result.nextPlayer === agentPlayer) {
        setIsWaitingForAIMove(true);
      }

      notifyParent(index, player, result.board, result.status, result.nextPlayer);
    },
    [agentPlayer, isParentReady, isRoleModalOpen, isWaitingForAIMove, notifyParent, performMove]
  );

  const handleReset = useCallback(() => {
    if (!isParentReady) {
      console.warn('[TicTacToe] Cannot start a new game until parent is ready.');
      return;
    }

    performReset();
    setIsWaitingForAIMove(false);
    setIsRoleModalOpen(true);
  }, [isParentReady, performReset]);

  const confirmRoleSelection = useCallback(
    (selectedHuman: Player) => {
      if (!isParentReady) {
        console.warn('[TicTacToe] Waiting for parent readiness before starting a new game.');
        return;
      }

      const { board: freshBoard, human, agent } = performReset(selectedHuman);
      setIsWaitingForAIMove(false);
      setIsRoleModalOpen(false);
      announceNewGame(freshBoard, human, agent);
    },
    [announceNewGame, isParentReady, performReset]
  );

  /**
   * WebMCP Tool 1: tictactoe_get_state
   *
   * This tool allows the AI to check the current game state.
   * It's a read-only, idempotent operation that returns formatted
   * markdown with the board state, player roles, and status.
   *
   * Annotations:
   * - readOnlyHint: Indicates this tool doesn't modify state
   * - idempotentHint: Calling it multiple times has the same effect
   *
   * The AI typically calls this after the game loads or after
   * the human makes a move to see the updated board.
   */
  useWebMCP({
    name: 'tictactoe_get_state',
    description:
      'Get the current Tic-Tac-Toe state including board layout, roles, and game status.',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async () =>
      formatGameStateMarkdown(board, currentPlayer, winner, humanPlayer, agentPlayer),
  });

  /**
   * WebMCP Tool 2: tictactoe_ai_move
   *
   * This tool allows the AI to make a move on the board.
   * It accepts a position parameter (0-8) and validates:
   * - Position is in valid range
   * - It's the AI's turn
   * - The cell is empty
   * - The game is not over
   *
   * Annotations:
   * - idempotentHint: false - calling with same position is NOT idempotent
   *
   * Input validation is done using Zod schemas, which provide:
   * - Type safety
   * - Runtime validation
   * - Auto-generated documentation
   *
   * After a successful move, this unblocks the UI (setIsWaitingForAIMove)
   * so the human can continue playing.
   */
  useWebMCP({
    name: 'tictactoe_ai_move',
    description: `Play as Player ${agentPlayer} (AI/Assistant). Provide a board position (0-8) to place your ${agentPlayer}.`,
    inputSchema: {
      position: z
        .number()
        .int()
        .min(0)
        .max(8)
        .describe('Cell position (0-8) in row-major order where the AI/Assistant should move.'),
    },
    annotations: {
      idempotentHint: false,
    },
    handler: async ({ position }) => {
      if (isRoleModalOpen) {
        throw new Error('Cannot move yet: waiting for the human to start a new game.');
      }

      const result = performMove(position, agentPlayer);
      if (!result.ok) {
        throw new Error(result.message);
      }

      // Unblock UI after AI move completes
      setIsWaitingForAIMove(false);

      return formatMoveMarkdown(
        agentPlayer,
        position,
        result.board,
        result.status,
        result.nextPlayer,
        humanPlayer,
        agentPlayer
      );
    },
  });

  /**
   * WebMCP Tool 3: tictactoe_reset
   *
   * This tool resets the game board while keeping role assignments.
   * It's a destructive operation that clears the board and reopens
   * the role selection modal.
   *
   * Annotations:
   * - destructiveHint: Warns that this operation destroys data
   * - idempotentHint: Calling multiple times has the same effect
   *
   * This is useful when the game is over and both players want
   * to play again without reloading the iframe.
   */
  useWebMCP({
    name: 'tictactoe_reset',
    description: 'Reset the board and keep the current human/AI role assignments.',
    annotations: {
      destructiveHint: true,
      idempotentHint: true,
    },
    handler: async () => {
      const { board: freshBoard, human, agent } = performReset();
      setIsWaitingForAIMove(false);
      setIsRoleModalOpen(true);
      return formatResetMarkdown(freshBoard, human, agent);
    },
  });

  const showRoleSelection = isParentReady && isRoleModalOpen;
  const showStatusMessage = !isParentReady || isWaitingForAIMove;

  const statusText = showStatusMessage
    ? !isParentReady
      ? 'Connecting...'
      : 'AI thinking...'
    : winner
      ? ''
      : `${currentPlayer}'s turn`;

  return (
    <div className="tic-tac-toe-with-webmcp">
      <div className="tic-tac-toe-game-area">
        {statusText && (
          <div className="tic-tac-toe-status-overlay" aria-live="polite">
            {statusText}
          </div>
        )}

        <TicTacToe
          animated={animated}
          board={board}
          currentPlayer={currentPlayer}
          winner={winner}
          winningLine={winningLine}
          onMove={handleUserMove}
          onReset={handleReset}
        />

        {showRoleSelection && (
          <div className="tic-tac-toe-role-overlay">
            <fieldset className="tic-tac-toe-role-selection">
              <legend className="tic-tac-toe-role-prompt">Pick your side:</legend>
              <button
                type="button"
                className="tic-tac-toe-role-button"
                onClick={() => confirmRoleSelection('X')}
              >
                X
              </button>
              <button
                type="button"
                className="tic-tac-toe-role-button"
                onClick={() => confirmRoleSelection('O')}
              >
                O
              </button>
            </fieldset>
          </div>
        )}
      </div>

      <style>{`
        .tic-tac-toe-with-webmcp {
          display: inline-block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .tic-tac-toe-game-area {
          position: relative;
        }

        .tic-tac-toe-status-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          font-size: 0.75rem;
          text-align: center;
          padding: 0.375rem;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          z-index: 10;
          pointer-events: none;
        }

        .tic-tac-toe-role-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          pointer-events: none;
        }

        .tic-tac-toe-role-prompt {
          font-size: 0.875rem;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        }

        .tic-tac-toe-role-selection {
          display: flex;
          gap: 0.75rem;
          pointer-events: auto;
          border: none;
          padding: 0;
          margin: 0;
          min-width: 0;
        }

        .tic-tac-toe-role-button {
          padding: 0.625rem 1.25rem;
          border: 2px solid #fff;
          border-radius: 6px;
          font-size: 1.25rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          min-width: 3.5rem;
        }

        .tic-tac-toe-role-button:hover {
          transform: scale(1.05);
          border-width: 3px;
        }

        .tic-tac-toe-role-button:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
};
