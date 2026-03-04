import { useMcpClient } from '@mcp-b/react-webmcp';
import { useState } from 'react';

/**
 * Component that demonstrates consuming MCP tools via the client API
 * This shows how to:
 * - List available tools from the server
 * - Call tools via client.callTool()
 * - Handle tool list changes (notifications)
 */
export function ClientConsumer() {
  const { client, tools, isConnected, isLoading, error, capabilities } = useMcpClient();
  const [callResult, setCallResult] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);

  const handleCallTool = async (toolName: string, args: Record<string, unknown>) => {
    if (!client || !isConnected) {
      setCallResult('Error: Client not connected');
      return;
    }

    setIsExecuting(true);
    setCallResult('');

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      // Extract text content from result
      const content = result.content as Array<
        { type: 'text'; text: string } | { type: string; [key: string]: unknown }
      >;
      const textContent = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      setCallResult(`Success: ${textContent}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCallResult(`Error: ${errorMessage}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Test buttons for various tools
  const testIncrementCounter = () => handleCallTool('counter_increment', { amount: 1 });
  const testIncrementBy5 = () => handleCallTool('counter_increment', { amount: 5 });
  const testInvalidIncrement = () => handleCallTool('counter_increment', { amount: 'invalid' });
  const testGetCounter = () => handleCallTool('counter_get', {});
  const testLikePost = () => handleCallTool('posts_like', { postId: '1' });
  const testSearchPosts = () => handleCallTool('posts_search', { query: 'post', limit: 5 });
  const testContextTool = () => handleCallTool('context_app_state', {});

  if (isLoading) {
    return (
      <div className="section">
        <h2>MCP Client Consumer</h2>
        <p>Connecting to MCP server...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section">
        <h2>MCP Client Consumer</h2>
        <div className="error-message" data-testid="client-error">
          Connection Error: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>MCP Client Consumer</h2>
      <p className="subtitle">
        Consuming tools via <code>McpClientProvider</code> and <code>useMcpClient</code>
      </p>

      {/* Connection Status */}
      <div style={{ marginBottom: '1rem' }}>
        <div data-testid="client-connection-status">
          <strong>Connection Status:</strong>{' '}
          <span className={isConnected ? 'success-text' : 'error-text'}>
            {isConnected ? 'Connected ✓' : 'Disconnected ✗'}
          </span>
        </div>
        <div data-testid="client-capabilities">
          <strong>Server Capabilities:</strong>{' '}
          {capabilities ? (
            <>
              {capabilities.tools && 'Tools '}
              {capabilities.resources && 'Resources '}
              {capabilities.prompts && 'Prompts'}
            </>
          ) : (
            'None'
          )}
        </div>
      </div>

      {/* Available Tools List */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Available Tools ({tools.length})</h3>
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
          {tools.length === 0 ? (
            <p style={{ color: '#718096', fontStyle: 'italic' }}>No tools available</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {tools.map((tool) => (
                <li key={tool.name} data-testid={`client-tool-${tool.name}`}>
                  <strong>{tool.name}</strong> - {tool.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Test Tool Calls */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Call Tools via Client</h3>
        <div className="button-group">
          <button
            type="button"
            className="secondary"
            onClick={testIncrementCounter}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-increment"
          >
            {isExecuting && <span className="spinner" />}
            Call counter_increment
          </button>
          <button
            type="button"
            className="secondary"
            onClick={testIncrementBy5}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-increment-by-5"
          >
            Call counter_increment (amount: 5)
          </button>
          <button
            type="button"
            className="secondary"
            onClick={testGetCounter}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-get-counter"
          >
            Call counter_get
          </button>
          <button
            type="button"
            className="secondary"
            onClick={testLikePost}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-like-post"
          >
            Call posts_like
          </button>
          <button
            type="button"
            className="secondary"
            onClick={testSearchPosts}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-search"
          >
            Call posts_search
          </button>
          <button
            type="button"
            className="secondary"
            onClick={testContextTool}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-context"
          >
            Call context_app_state
          </button>
          <button
            type="button"
            className="danger"
            onClick={testInvalidIncrement}
            disabled={!isConnected || isExecuting}
            data-testid="client-call-invalid"
          >
            Call with invalid args
          </button>
        </div>
      </div>

      {/* Call Result */}
      {callResult && (
        <div
          className={callResult.startsWith('Error') ? 'error-message' : 'info-box'}
          data-testid="client-call-result"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          <strong>Last Call Result:</strong>
          <br />
          {callResult}
        </div>
      )}
    </div>
  );
}
