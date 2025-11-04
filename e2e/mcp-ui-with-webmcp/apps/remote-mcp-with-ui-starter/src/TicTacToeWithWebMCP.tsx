import { useWebMCP } from '@mcp-b/react-webmcp';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { type Board, type Player, TicTacToe } from './TicTacToe';

// Game statistics interface
interface GameStats {
  totalGames: number;
  liveGames: number;
  clankersWins: number;
  carbonUnitsWins: number;
  draws: number;
  lastUpdated: string;
}

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
    `- Player ${humanPlayer} = Carbon Units 👤`,
    `- Player ${agentPlayer} = Clankers 🤖`,
    '',
    formatBoardMarkdown(board),
    '',
  ];

  if (winner === 'Draw') {
    lines.push("**Status:** Game Over - It's a draw!");
  } else if (winner) {
    const winnerLabel = winner === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push(`**Status:** Game Over - Player ${winner} (${winnerLabel}) wins!`);
  } else {
    const currentRole = currentPlayer === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push('**Status:** Game in progress');
    lines.push(`**Current Turn:** Player ${currentPlayer} (${currentRole})`);
    if (currentPlayer === humanPlayer) {
      lines.push('**Action:** Waiting for Carbon Units to move via the UI.');
    } else {
      lines.push('**Action:** Awaiting Clankers move.');
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
    `Player ${player} (${player === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖'}) placed at position ${index}.`,
    '',
    formatBoardMarkdown(board),
    '',
  ];

  if (status.winner === 'Draw') {
    lines.push("**Game Over:** It's a draw!");
  } else if (status.winner) {
    const winnerLabel = status.winner === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push(`**Game Over:** Player ${status.winner} (${winnerLabel}) wins!`);
  } else if (nextPlayer) {
    const nextLabel = nextPlayer === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push(`**Next Turn:** Player ${nextPlayer} (${nextLabel})`);
    if (nextPlayer === agentPlayer) {
      lines.push('**Reminder:** You are Clankers 🤖—make your move using this tool.');
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
    `Carbon Units 👤 plays as Player ${humanPlayer}.`,
    `Clankers 🤖 plays as Player ${agentPlayer}.`,
    '',
    formatBoardMarkdown(board),
    '',
    '**Status:** New game started. Player X goes first.',
  ];

  if (agentPlayer === 'X') {
    lines.push('**Action:** Clankers 🤖 opens the game.');
  } else {
    lines.push('**Action:** Carbon Units 👤 opens the game via the UI.');
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
    `- Move: Player ${actor} (${actor === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖'}) placed at position ${index}.`,
    `- Carbon Units 👤 plays as Player ${humanPlayer}`,
    `- Clankers 🤖 plays as Player ${agentPlayer}`,
    '',
  ];

  if (status.winner === 'Draw') {
    lines.push("**Status:** Game over – it's a draw.");
  } else if (status.winner) {
    const winnerLabel = status.winner === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push(`**Status:** Game over – Player ${status.winner} (${winnerLabel}) wins!`);
  } else if (nextPlayer) {
    const nextLabel = nextPlayer === humanPlayer ? 'Carbon Units 👤' : 'Clankers 🤖';
    lines.push(`**Next Turn:** Player ${nextPlayer} (${nextLabel})`);
    if (nextPlayer === agentPlayer) {
      lines.push('**Action:** Awaiting Clankers 🤖 move.');
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
    `- Carbon Units 👤 plays as Player ${humanPlayer}`,
    `- Clankers 🤖 plays as Player ${agentPlayer}`,
    '',
  ];

  if (currentPlayer === agentPlayer) {
    lines.push('**Next Turn:** Clankers 🤖 opens the game.');
    lines.push('**Action:** Awaiting Clankers 🤖 move.');
  } else {
    lines.push('**Next Turn:** Carbon Units 👤 opens the game via the UI.');
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

  // Stats state
  const [stats, setStats] = useState<GameStats | null>(null);

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

  /**
   * Stats WebSocket Connection
   *
   * Establishes a WebSocket connection for real-time stats updates.
   * Automatically reconnects with exponential backoff on disconnection.
   * Falls back to REST API if WebSocket fails repeatedly.
   */
  useEffect(() => {
    // Construct WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/stats/ws`;

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const BASE_RECONNECT_DELAY = 1000; // 1 second
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Stats WebSocket connected');
          reconnectAttempts = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const data: GameStats = JSON.parse(event.data);
            setStats(data);
          } catch (error) {
            console.error('Failed to parse stats message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('Stats WebSocket error:', error);
        };

        ws.onclose = (event) => {
          console.log(`Stats WebSocket closed: code=${event.code}, reason=${event.reason}`);

          // Attempt to reconnect with exponential backoff
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(
              BASE_RECONNECT_DELAY * 2 ** reconnectAttempts,
              MAX_RECONNECT_DELAY
            );

            console.log(
              `Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`
            );

            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connect();
            }, delay);
          } else {
            console.warn(
              'Max WebSocket reconnection attempts reached. Stats will not update automatically.'
            );
            // Could optionally fall back to polling here if needed
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
      }
    };

    // Establish initial connection
    connect();

    // Cleanup function
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        // Set a flag to prevent reconnection during intentional close
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        ws.close(1000, 'Component unmounting');
      }
    };
  }, []);

  /**
   * Game Completion Tracking
   *
   * Notifies the server when a game completes with the result.
   * Maps X/O winners to Clankers/Carbon Units based on role assignments.
   * Note: liveGames counter is now managed by WebSocket connections automatically.
   */
  useEffect(() => {
    const notifyGameComplete = async () => {
      if (!winner) return;

      try {
        let result: 'clankers' | 'carbonUnits' | 'draw';
        if (winner === 'Draw') {
          result = 'draw';
        } else if (winner === agentPlayer) {
          result = 'clankers';
        } else {
          result = 'carbonUnits';
        }

        const response = await fetch('/api/stats/game-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result }),
        });

        if (response.ok) {
          const data: GameStats = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to notify game completion:', error);
      }
    };

    notifyGameComplete();
  }, [winner, agentPlayer]);

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

  /**
   * Notify Parent of Current Document Size
   *
   * Sends the current document dimensions to the parent window via postMessage.
   * This allows the parent to resize the iframe to fit the content properly.
   *
   * Based on Kent C. Dodds' pattern from:
   * https://github.com/idosal/mcp-ui/issues/100
   */
  const notifyParentOfCurrentDocumentSize = useCallback(() => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }

    const height = document.documentElement.scrollHeight;
    const width = document.documentElement.scrollWidth;

    window.parent.postMessage(
      {
        type: 'ui-size-change',
        payload: { height, width },
      },
      '*'
    );

    console.log(`📏 Size notification sent: ${width}x${height}`);
  }, []);

  /**
   * Notify parent of initial size after readiness
   *
   * Once the parent is ready, send the initial document size.
   * Uses requestAnimationFrame to ensure accurate measurements after layout.
   */
  useEffect(() => {
    if (!isParentReady) {
      return;
    }

    requestAnimationFrame(() => {
      notifyParentOfCurrentDocumentSize();
    });
  }, [isParentReady, notifyParentOfCurrentDocumentSize]);

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
   * This tool allows Clankers (AI) to make a move on the board.
   * It accepts a position parameter (0-8) and validates:
   * - Position is in valid range
   * - It's Clankers' turn
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
   * so Carbon Units can continue playing.
   */
  useWebMCP({
    name: 'tictactoe_ai_move',
    description: `Play as Player ${agentPlayer} (Clankers 🤖). Provide a board position (0-8) to place your ${agentPlayer}.`,
    inputSchema: {
      position: z
        .number()
        .int()
        .min(0)
        .max(8)
        .describe('Cell position (0-8) in row-major order where Clankers 🤖 should move.'),
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
    <div className="flex flex-col gap-1.5 font-sans">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-sm font-bold text-black mb-0.5">Beat The Clankers 🤖</h1>

        {/* Tier 2: Game Outcomes (Primary Stats) */}
        {stats && (
          <div className="flex items-center justify-center gap-3 text-xs text-black mb-0.5">
            <span className="font-semibold">👤 {stats.carbonUnitsWins} Humans</span>
            <span className="text-black">•</span>
            <span className="font-semibold">🤖 {stats.clankersWins} Clankers</span>
            <span className="text-black">•</span>
            <span className="font-semibold">🤝 {stats.draws} Draws</span>
          </div>
        )}

        {/* Tier 3: Meta Stats (Secondary) */}
        {stats && (
          <div className="flex items-center justify-center gap-2 text-[0.625rem] text-black">
            <span title="Total games played">📊 {stats.totalGames} total</span>
            <span className="text-black">•</span>
            <span title="Active games">🎮 {stats.liveGames} active</span>
          </div>
        )}
      </div>

      <div className="relative">
        {statusText && (
          <div
            className="absolute top-0 left-0 right-0 text-xs text-center p-1.5 text-black [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] z-10 pointer-events-none"
            aria-live="polite"
          >
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <fieldset className="flex flex-col gap-3 pointer-events-auto border-none p-0 m-0 min-w-0">
              <legend className="text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] mb-2">
                Pick your side:
              </legend>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xs font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
                  👤 Carbon Units
                </span>
                <span className="text-[0.625rem] font-bold text-white/70 uppercase">vs</span>
                <span className="text-xs font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
                  🤖 Clankers
                </span>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  className="py-2.5 px-5 border-2 border-white rounded-md text-xl font-bold cursor-pointer transition-all duration-150 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] min-w-14 hover:scale-105 hover:border-[3px] active:scale-95"
                  onClick={() => confirmRoleSelection('X')}
                  title="Play as X (Carbon Units go first)"
                >
                  X
                </button>
                <button
                  type="button"
                  className="py-2.5 px-5 border-2 border-white rounded-md text-xl font-bold cursor-pointer transition-all duration-150 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] min-w-14 hover:scale-105 hover:border-[3px] active:scale-95"
                  onClick={() => confirmRoleSelection('O')}
                  title="Play as O (Clankers go first)"
                >
                  O
                </button>
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
};
