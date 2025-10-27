import { useMcpClient, useWebMCP, useWebMCPContext } from '@mcp-b/react-webmcp';
import { useState } from 'react';
import { z } from 'zod';

// Counter state (shared across the app)
let globalCounter = 0;

function App() {
  const [posts, setPosts] = useState([
    { id: '1', title: 'First Post', likes: 0 },
    { id: '2', title: 'Second Post', likes: 5 },
    { id: '3', title: 'Third Post', likes: 10 },
  ]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [logs, setLogs] = useState<
    Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>
  >([]);

  // MCP Client for displaying registered tools
  const { tools: clientTools } = useMcpClient();

  // Helper to add logs
  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random()}`;
    setLogs((prev) => [...prev, { id, message: `[${timestamp}] ${message}`, type }]);
  };

  // Tool 1: Counter Increment (Mutation)
  const incrementTool = useWebMCP({
    name: 'counter_increment',
    description: 'Increment the counter by a specified amount',
    inputSchema: {
      amount: z.number().min(1).max(100).default(1).describe('Amount to increment'),
    },
    annotations: {
      title: 'Increment Counter',
      readOnlyHint: false,
      idempotentHint: false,
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate async
      globalCounter += input.amount;
      addLog(`Incremented counter by ${input.amount}. New value: ${globalCounter}`, 'success');
      return { counter: globalCounter, incremented: input.amount };
    },
    onError: (error) => {
      addLog(`Error incrementing: ${error.message}`, 'error');
    },
  });

  // Tool 2: Counter Decrement (Mutation)
  const decrementTool = useWebMCP({
    name: 'counter_decrement',
    description: 'Decrement the counter by a specified amount',
    inputSchema: {
      amount: z.number().min(1).max(100).default(1).describe('Amount to decrement'),
    },
    annotations: {
      title: 'Decrement Counter',
      readOnlyHint: false,
      idempotentHint: false,
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      globalCounter -= input.amount;
      addLog(`Decremented counter by ${input.amount}. New value: ${globalCounter}`, 'success');
      return { counter: globalCounter, decremented: input.amount };
    },
  });

  // Tool 3: Counter Reset (Destructive)
  const resetTool = useWebMCP({
    name: 'counter_reset',
    description: 'Reset the counter to zero. This action cannot be undone.',
    annotations: {
      title: 'Reset Counter',
      readOnlyHint: false,
      destructiveHint: true,
    },
    elicitation: {
      message: 'Are you sure you want to reset the counter? This cannot be undone.',
      when: () => globalCounter !== 0,
    },
    handler: async () => {
      const oldValue = globalCounter;
      globalCounter = 0;
      addLog(`Reset counter from ${oldValue} to 0`, 'success');
      return { oldValue, newValue: 0 };
    },
  });

  // Tool 4: Get Counter (Read-only query)
  const getCounterTool = useWebMCP({
    name: 'counter_get',
    description: 'Get the current counter value',
    annotations: {
      title: 'Get Counter',
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async () => {
      addLog(`Retrieved counter value: ${globalCounter}`, 'info');
      return { counter: globalCounter };
    },
  });

  // Tool 5: Like Post
  const likePostTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID. Increments the like count.',
    inputSchema: {
      postId: z.string().describe('The post ID to like'),
    },
    annotations: {
      title: 'Like Post',
      readOnlyHint: false,
      idempotentHint: true,
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setPosts((prev) =>
        prev.map((post) => (post.id === input.postId ? { ...post, likes: post.likes + 1 } : post))
      );
      const post = posts.find((p) => p.id === input.postId);
      if (!post) {
        throw new Error(`Post not found: ${input.postId}`);
      }
      addLog(`Liked post: ${post.title}`, 'success');
      return { postId: input.postId, newLikes: post.likes + 1 };
    },
  });

  // Tool 6: Search Posts
  const searchPostsTool = useWebMCP({
    name: 'posts_search',
    description: 'Search posts by keyword',
    inputSchema: {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().min(1).max(10).default(10).describe('Max results'),
    },
    annotations: {
      title: 'Search Posts',
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const results = posts
        .filter((post) => post.title.toLowerCase().includes(input.query.toLowerCase()))
        .slice(0, input.limit);
      setSearchResults(results.map((p) => p.title));
      addLog(`Found ${results.length} posts matching "${input.query}"`, 'info');
      return {
        query: input.query,
        results: results.map((p) => ({ id: p.id, title: p.title, likes: p.likes })),
        count: results.length,
      };
    },
    formatOutput: (output) => {
      return `Found ${output.count} posts:\n${output.results.map((r) => `• ${r.title} (${r.likes} likes)`).join('\n')}`;
    },
  });

  // Tool 7: Context tool - Current State
  useWebMCPContext('context_app_state', 'Get the current application state', () => ({
    counter: globalCounter,
    totalPosts: posts.length,
    totalLikes: posts.reduce((sum, post) => sum + post.likes, 0),
    searchResultsCount: searchResults.length,
  }));

  // Manual test buttons
  const handleIncrement = async () => {
    try {
      await incrementTool.execute({ amount: 1 });
    } catch (error) {
      console.error(error);
    }
  };

  const handleDecrement = async () => {
    try {
      await decrementTool.execute({ amount: 1 });
    } catch (error) {
      console.error(error);
    }
  };

  const handleReset = async () => {
    try {
      await resetTool.execute({});
    } catch (error) {
      console.error(error);
    }
  };

  const handleGet = async () => {
    try {
      await getCounterTool.execute({});
    } catch (error) {
      console.error(error);
    }
  };

  const handleLikePost = async (postId: string) => {
    try {
      await likePostTool.execute({ postId });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSearch = async () => {
    try {
      await searchPostsTool.execute({ query: 'post', limit: 10 });
    } catch (error) {
      console.error(error);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // Calculate total executions
  const totalExecutions =
    incrementTool.state.executionCount +
    decrementTool.state.executionCount +
    resetTool.state.executionCount +
    getCounterTool.state.executionCount +
    likePostTool.state.executionCount +
    searchPostsTool.state.executionCount;

  const isAnyExecuting =
    incrementTool.state.isExecuting ||
    decrementTool.state.isExecuting ||
    resetTool.state.isExecuting ||
    getCounterTool.state.isExecuting ||
    likePostTool.state.isExecuting ||
    searchPostsTool.state.isExecuting;

  return (
    <div className="app-container">
      <h1>React WebMCP Test App</h1>
      <p className="subtitle">
        Testing <code>@mcp-b/react-webmcp</code> hooks with various tool types
      </p>

      {/* Status Badge */}
      <div style={{ marginBottom: '2rem' }}>
        <span
          className={`status-badge ${isAnyExecuting ? 'executing' : 'ready'}`}
          data-testid="app-status"
        >
          {isAnyExecuting ? 'Executing' : 'Ready'}
        </span>
      </div>

      {/* Counter Section */}
      <div className="section">
        <h2>Counter Tools (Mutation & Query)</h2>
        <div className="counter-display" data-testid="counter-display">
          {globalCounter}
        </div>

        <div className="button-group">
          <button
            type="button"
            className="primary"
            onClick={handleIncrement}
            disabled={incrementTool.state.isExecuting}
            data-testid="increment-btn"
          >
            {incrementTool.state.isExecuting && <span className="spinner" />}
            Increment (+1)
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleDecrement}
            disabled={decrementTool.state.isExecuting}
            data-testid="decrement-btn"
          >
            {decrementTool.state.isExecuting && <span className="spinner" />}
            Decrement (-1)
          </button>
          <button
            type="button"
            className="danger"
            onClick={handleReset}
            disabled={resetTool.state.isExecuting}
            data-testid="reset-btn"
          >
            {resetTool.state.isExecuting && <span className="spinner" />}
            Reset
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleGet}
            disabled={getCounterTool.state.isExecuting}
            data-testid="get-counter-btn"
          >
            {getCounterTool.state.isExecuting && <span className="spinner" />}
            Get Value
          </button>
        </div>

        {(incrementTool.state.error || decrementTool.state.error || resetTool.state.error) && (
          <div className="error-message" data-testid="counter-error">
            {incrementTool.state.error?.message ||
              decrementTool.state.error?.message ||
              resetTool.state.error?.message}
          </div>
        )}
      </div>

      {/* Posts Section */}
      <div className="section">
        <h2>Posts Tools (Like & Search)</h2>

        <div style={{ marginBottom: '1rem' }}>
          {posts.map((post) => (
            <div
              key={post.id}
              style={{
                background: 'white',
                padding: '1rem',
                borderRadius: '6px',
                marginBottom: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              data-testid={`post-${post.id}`}
            >
              <div>
                <strong>{post.title}</strong>
                <div style={{ color: '#718096', fontSize: '0.85rem' }}>
                  Likes: <span data-testid={`post-${post.id}-likes`}>{post.likes}</span>
                </div>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => handleLikePost(post.id)}
                disabled={likePostTool.state.isExecuting}
                data-testid={`like-post-${post.id}`}
              >
                Like
              </button>
            </div>
          ))}
        </div>

        <div className="button-group">
          <button
            type="button"
            className="primary"
            onClick={handleSearch}
            disabled={searchPostsTool.state.isExecuting}
            data-testid="search-posts-btn"
          >
            {searchPostsTool.state.isExecuting && <span className="spinner" />}
            Search "post"
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="info-box" data-testid="search-results">
            <h3>Search Results ({searchResults.length})</h3>
            <p>{searchResults.join(', ')}</p>
          </div>
        )}

        {likePostTool.state.error && (
          <div className="error-message" data-testid="posts-error">
            {likePostTool.state.error.message}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="section">
        <h2>Statistics</h2>
        <div className="stats">
          <div className="stat-card">
            <div className="label">Total Executions</div>
            <div className="value" data-testid="total-executions">
              {totalExecutions}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Counter Ops</div>
            <div className="value" data-testid="counter-executions">
              {incrementTool.state.executionCount +
                decrementTool.state.executionCount +
                resetTool.state.executionCount +
                getCounterTool.state.executionCount}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Post Ops</div>
            <div className="value" data-testid="post-executions">
              {likePostTool.state.executionCount + searchPostsTool.state.executionCount}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Total Likes</div>
            <div className="value" data-testid="total-likes">
              {posts.reduce((sum, post) => sum + post.likes, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div className="section">
        <h2>
          Event Log
          <button
            type="button"
            onClick={clearLogs}
            style={{
              marginLeft: 'auto',
              background: '#e2e8f0',
              color: '#2d3748',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
            }}
            data-testid="clear-log-btn"
          >
            Clear
          </button>
        </h2>
        <div className="log" data-testid="event-log">
          {logs.length === 0 ? (
            <div style={{ color: '#718096', fontStyle: 'italic' }}>No events yet...</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`log-entry ${log.type}`}>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Registered Tools Section */}
      <div className="section">
        <h2>Registered MCP Tools</h2>
        <p className="subtitle">
          All tools registered via useWebMCP hooks are available through the MCP protocol
        </p>

        {/* Available Tools List */}
        <div style={{ marginBottom: '1rem' }}>
          <h3>Available Tools ({clientTools.length})</h3>
          <div
            style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '6px',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
            data-testid="client-tools-list"
          >
            {clientTools.length === 0 ? (
              <p style={{ color: '#718096', fontStyle: 'italic' }}>Loading tools...</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                {clientTools.map((tool) => (
                  <li key={tool.name} data-testid={`client-tool-${tool.name}`}>
                    <strong>{tool.name}</strong> - {tool.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
