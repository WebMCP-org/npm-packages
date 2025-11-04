import { createUIResource } from '@mcp-ui/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';

/**
 * MCP UI with WebMCP Agent
 *
 * Demonstrates UI resources that can be displayed in MCP clients,
 * including a Tic-Tac-Toe game that uses WebMCP for dynamic tool registration.
 */
export class MyMCP extends McpAgent<Cloudflare.Env> {
  server = new McpServer({
    name: 'mcp-ui-webmcp-cloudflare',
    version: '1.0.0',
  });

  async init() {
    /**
     * Tool 1: Show External URL
     *
     * Demonstrates how to display an external URL in an iframe.
     * This is useful for showing web pages from other domains.
     */
    this.server.tool(
      'showExternalUrl',
      'Creates a UI resource displaying an external URL (example.com). This demonstrates iframe embedding of external websites.',
      {},
      async () => {
        try {
          const uiResource = createUIResource({
            uri: 'ui://greeting',
            content: { type: 'externalUrl', iframeUrl: 'https://example.com' },
            encoding: 'text',
          });

          return {
            content: [uiResource],
          };
        } catch (error) {
          console.error('Error creating external URL resource:', error);
          throw error;
        }
      }
    );

    /**
     * Tool 2: Show Raw HTML
     *
     * Demonstrates how to render raw HTML content directly.
     * The HTML is sandboxed for security.
     */
    this.server.tool(
      'showRawHtml',
      'Creates a UI resource displaying raw HTML. This demonstrates rendering HTML content directly without an external URL.',
      {},
      async () => {
        try {
          const uiResource = createUIResource({
            uri: 'ui://raw-html-demo',
            content: {
              type: 'rawHtml',
              htmlString:
                '<h1>Hello from Raw HTML</h1><p>This content is rendered directly in the UI.</p>',
            },
            encoding: 'text',
          });

          return {
            content: [uiResource],
          };
        } catch (error) {
          console.error('Error creating raw HTML resource:', error);
          throw error;
        }
      }
    );

    /**
     * Tool 3: Show Remote DOM
     *
     * Demonstrates how to execute JavaScript that builds a DOM dynamically.
     * The script runs in the client and has access to a special 'root' element.
     */
    this.server.tool(
      'showRemoteDom',
      'Creates a UI resource displaying a remote DOM script. This demonstrates dynamic UI generation via JavaScript.',
      {},
      async () => {
        try {
          const remoteDomScript = `
						const p = document.createElement('ui-text');
						p.textContent = 'This is a remote DOM element from the server.';
						root.appendChild(p);
					`;

          const uiResource = createUIResource({
            uri: 'ui://remote-dom-demo',
            content: {
              type: 'remoteDom',
              script: remoteDomScript,
              framework: 'react',
            },
            encoding: 'text',
          });

          return {
            content: [uiResource],
          };
        } catch (error) {
          console.error('Error creating remote DOM resource:', error);
          throw error;
        }
      }
    );

    /**
     * Tool 4: Show Tic-Tac-Toe Game (WebMCP Integration Demo)
     *
     * This is the most comprehensive example, demonstrating:
     * - MCP UI: Serving an interactive web app via iframe
     * - WebMCP: The iframe registers tools back to the MCP server
     * - Bidirectional communication between AI and embedded UI
     *
     * The TicTacToe game is built with React and dynamically registers
     * three WebMCP tools that become available after the UI loads:
     * - tictactoe_get_state: Get current board state
     * - tictactoe_ai_move: Make a move (AI plays as O)
     * - tictactoe_reset: Reset the game
     */
    this.server.tool(
      'showTicTacToeGame',
      `Displays an interactive Tic-Tac-Toe game where you (AI) can play as player O against a human player X.

After calling this tool, the game UI will appear. The game registers WebMCP tools that become available:
- tictactoe_get_state: Check current board state and whose turn it is
- tictactoe_ai_move: Make a move as player O (call this when it's your turn)
- tictactoe_reset: Start a new game

Use this tool when the user wants to play Tic-Tac-Toe. After the UI loads, use tictactoe_get_state to see the board and begin playing.`,
      {},
      async () => {
        try {
          // Dynamically construct the iframe URL based on the current deployment
          // This ensures the URL works in both development and production environments
          const iframeUrl = `${this.env.APP_URL}/`;
          const uiResource = createUIResource({
            uri: 'ui://tictactoe-game',
            content: {
              type: 'externalUrl',
              iframeUrl: iframeUrl,
            },
            encoding: 'blob',
          });

          return {
            content: [
              {
                type: 'text',
                text: `# Tic-Tac-Toe Game Started

The game board is now displayed in the side panel.

**How to play:**
1. You are player **O** (AI)
2. Human player is **X** and goes first
3. After human makes their move, use \`tictactoe_get_state\` to see the board
4. Then use \`tictactoe_ai_move\` with a position (0-8) to make your move

**Available tools:**
- \`tictactoe_get_state\` - View current board and game status
- \`tictactoe_ai_move\` - Make your move as player O
- \`tictactoe_reset\` - Start a new game

Wait for the human player to make the first move, then check the state and respond!`,
              },
              uiResource,
            ],
          };
        } catch (error) {
          console.error('Error creating TicTacToe game resource:', error);
          throw error;
        }
      }
    );

    /**
     * Tool 5: Get TicTacToe Statistics
     *
     * Fetches global statistics for all TicTacToe games played.
     * Tracks wins for Clankers (AI) and Carbon Units (humans), plus draws and live games.
     */
    this.server.tool(
      'tictactoe_get_stats',
      'Get global statistics for all TicTacToe games. Shows wins for Clankers (AI) vs Carbon Units (humans), draws, live games, and total games played.',
      {},
      async () => {
        try {
          const id = this.env.GAME_STATS.idFromName('global-stats');
          const stub = this.env.GAME_STATS.get(id);
          const response = await stub.fetch(new Request('http://internal/stats'));
          const stats = await response.json<{
            totalGames: number;
            liveGames: number;
            clankersWins: number;
            carbonUnitsWins: number;
            draws: number;
            lastUpdated: string;
          }>();

          // Calculate win percentages
          const totalCompleted = stats.totalGames;
          const clankersWinRate =
            totalCompleted > 0 ? ((stats.clankersWins / totalCompleted) * 100).toFixed(1) : '0.0';
          const carbonUnitsWinRate =
            totalCompleted > 0
              ? ((stats.carbonUnitsWins / totalCompleted) * 100).toFixed(1)
              : '0.0';
          const drawRate =
            totalCompleted > 0 ? ((stats.draws / totalCompleted) * 100).toFixed(1) : '0.0';

          return {
            content: [
              {
                type: 'text',
                text: `# TicTacToe Global Statistics 🤖 vs 🧬

**Current Status:**
- 🎮 Live games in progress: ${stats.liveGames}
- 📊 Total games completed: ${totalCompleted}

**Scoreboard:**
- 🤖 Clankers (AI) wins: ${stats.clankersWins} (${clankersWinRate}%)
- 🧬 Carbon Units (Humans) wins: ${stats.carbonUnitsWins} (${carbonUnitsWinRate}%)
- 🤝 Draws: ${stats.draws} (${drawRate}%)

**Last updated:** ${new Date(stats.lastUpdated).toLocaleString()}

${
  stats.clankersWins > stats.carbonUnitsWins
    ? '🏆 Clankers are currently dominating!'
    : stats.carbonUnitsWins > stats.clankersWins
      ? '🏆 Carbon Units are holding strong!'
      : "⚖️ It's a tie! The battle continues..."
}`,
              },
            ],
          };
        } catch (error) {
          console.error('Error fetching TicTacToe stats:', error);
          throw error;
        }
      }
    );

    /**
     * Prompt: Play Tic Tac Toe
     *
     * A convenience prompt that users can trigger to start a game.
     * Prompts are pre-defined message templates that can be invoked by name.
     */
    this.server.prompt('PlayTicTacToe', 'Start a game of Tic Tac Toe', async () => {
      try {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: "Hey, let's play a game of Tic Tac Toe!",
              },
            },
          ],
        };
      } catch (error) {
        console.error('Error creating prompt:', error);
        throw error;
      }
    });
  }
}
