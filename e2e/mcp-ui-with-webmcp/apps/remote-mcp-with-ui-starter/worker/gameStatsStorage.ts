/**
 * Game statistics tracked for TicTacToe games
 */
export interface GameStats {
  /** Total number of games completed */
  totalGames: number;
  /** Number of active WebSocket connections (live viewers) */
  liveGames: number;
  /** Number of wins by Clankers (AI) */
  clankersWins: number;
  /** Number of wins by Carbon Units (humans) */
  carbonUnitsWins: number;
  /** Number of draws */
  draws: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
}

/**
 * Result of a completed game
 */
export type GameResult = 'clankers' | 'carbonUnits' | 'draw';

/**
 * Durable Object for storing global TicTacToe game statistics
 * Tracks wins/losses/draws between Clankers (AI) and Carbon Units (humans)
 * Supports real-time updates via WebSocket with hibernation
 */
export class GameStatsStorage {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;

    // Restore hibernated WebSocket connections
    // When the Durable Object is evicted from memory and later re-initialized,
    // this ensures we maintain references to active WebSocket connections
    this.state.getWebSockets();
  }

  /**
   * Fetch handler for the Durable Object
   * Routes requests to appropriate methods and handles WebSocket upgrades
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Handle WebSocket upgrade requests
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        return this.handleWebSocketUpgrade(request);
      }

      // GET /stats - Retrieve current statistics
      if (url.pathname === '/stats' && request.method === 'GET') {
        return await this.getStats();
      }

      // POST /game-complete - Record game result
      if (url.pathname === '/game-complete' && request.method === 'POST') {
        return await this.gameComplete(request);
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('GameStatsStorage error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  /**
   * Get current game statistics
   */
  private async getStats(): Promise<Response> {
    const stats = await this.getOrInitializeStats();
    return Response.json(stats);
  }

  /**
   * Record completed game result (win/loss/draw)
   * Note: liveGames is now tracked via WebSocket connections, not game completion
   */
  private async gameComplete(request: Request): Promise<Response> {
    const body = await request.json<{ result: GameResult }>();
    const { result } = body;

    if (!result || !['clankers', 'carbonUnits', 'draw'].includes(result)) {
      return new Response('Invalid game result. Must be "clankers", "carbonUnits", or "draw"', {
        status: 400,
      });
    }

    const stats = await this.getOrInitializeStats();

    // Track game results only (liveGames managed by WebSocket lifecycle)
    stats.totalGames++;
    if (result === 'clankers') {
      stats.clankersWins++;
    } else if (result === 'carbonUnits') {
      stats.carbonUnitsWins++;
    } else {
      stats.draws++;
    }

    stats.lastUpdated = new Date().toISOString();
    await this.state.storage.put('stats', stats);

    // Broadcast updated stats to all connected WebSocket clients
    await this.broadcastStats();

    return Response.json(stats);
  }

  /**
   * Get stats from storage or initialize with defaults
   */
  private async getOrInitializeStats(): Promise<GameStats> {
    let stats = await this.state.storage.get<GameStats>('stats');

    if (!stats) {
      stats = {
        totalGames: 0,
        liveGames: 0,
        clankersWins: 0,
        carbonUnitsWins: 0,
        draws: 0,
        lastUpdated: new Date().toISOString(),
      };
      await this.state.storage.put('stats', stats);
    }

    return stats;
  }

  /**
   * Handle WebSocket upgrade requests
   * Uses the Hibernation API for cost-effective long-lived connections
   * Increments liveGames counter when connection is established
   */
  private handleWebSocketUpgrade(_request: Request): Response {
    // Create a WebSocket pair (client and server ends)
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Use acceptWebSocket() for hibernation support
    // This allows the Durable Object to hibernate when idle, reducing costs
    // Unlike server.accept(), this enables automatic reconnection after hibernation
    this.state.acceptWebSocket(server);

    // Increment live games counter for new connection
    // Send initial stats to the newly connected client
    this.incrementLiveGames()
      .then(() => this.getOrInitializeStats())
      .then((stats) => {
        server.send(JSON.stringify(stats));
      })
      .catch((error) => {
        console.error('Failed to increment live games counter:', error);
        // Close connection if tracking fails to prevent inaccurate count
        server.close(1011, 'Failed to track connection');
      });

    // Return the client side of the WebSocket connection
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast current stats to all connected WebSocket clients
   * Called whenever stats are updated to push real-time updates
   */
  private async broadcastStats(): Promise<void> {
    const stats = await this.getOrInitializeStats();
    const message = JSON.stringify(stats);

    // Get all active WebSocket connections (including hibernated ones)
    const sockets = this.state.getWebSockets();

    // Send stats to each connected client
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch (error) {
        console.error('Error broadcasting to WebSocket:', error);
        // Continue broadcasting to other clients even if one fails
      }
    }
  }

  /**
   * WebSocket message handler
   * Called when a client sends a message to the Durable Object
   * Supports ping/pong for connection health checks
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      // Handle ping/pong for connection health checks
      if (message === 'ping') {
        ws.send('pong');
        return;
      }

      // Handle refresh requests - send current stats
      if (message === 'refresh') {
        const stats = await this.getOrInitializeStats();
        ws.send(JSON.stringify(stats));
        return;
      }

      // Log unknown message types
      console.log('Received unknown WebSocket message:', message);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * WebSocket close handler
   * Called when a WebSocket connection is closed
   * Decrements liveGames counter when connection closes
   */
  async webSocketClose(
    _ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    // Decrement live games counter for closed connection
    await this.decrementLiveGames();

    console.log(`WebSocket closed: code=${code}, reason=${reason}, clean=${wasClean}`);
  }

  /**
   * WebSocket error handler
   * Called when a WebSocket error occurs
   */
  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
  }

  /**
   * Increment the live games counter
   * Called when a new WebSocket connection is established
   */
  private async incrementLiveGames(): Promise<void> {
    const stats = await this.getOrInitializeStats();
    stats.liveGames++;
    stats.lastUpdated = new Date().toISOString();
    await this.state.storage.put('stats', stats);
    await this.broadcastStats();
  }

  /**
   * Decrement the live games counter
   * Called when a WebSocket connection closes
   */
  private async decrementLiveGames(): Promise<void> {
    const stats = await this.getOrInitializeStats();
    if (stats.liveGames > 0) {
      stats.liveGames--;
    }
    stats.lastUpdated = new Date().toISOString();
    await this.state.storage.put('stats', stats);
    await this.broadcastStats();
  }
}
