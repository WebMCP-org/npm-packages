import { useState } from 'react';
import {
  MCPConfigExplorer,
  type DetectedConfig,
  type ConfigPlatform,
} from '@mcp-b/mcp-react-config';
import '@mcp-b/mcp-react-config/style.css';
import './App.css';

function App() {
  const [mcpUrl, setMcpUrl] = useState('https://api.example.com/mcp/test-server');
  const [serverName, setServerName] = useState('test-mcp-server');
  const [updatedConfigs, setUpdatedConfigs] = useState<DetectedConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<'explorer' | 'utilities'>('explorer');

  const handleConfigUpdated = (config: DetectedConfig) => {
    setUpdatedConfigs((prev) => [...prev, config]);
    setError(null);
  };

  const handleError = (err: Error) => {
    setError(err.message);
  };

  const clearUpdates = () => {
    setUpdatedConfigs([]);
    setError(null);
  };

  // Test data for utilities
  const [testConfigContent, setTestConfigContent] = useState('');
  const [testPlatform, setTestPlatform] = useState<ConfigPlatform>('claude-desktop');

  return (
    <div className="app">
      <header className="app-header">
        <h1 data-testid="app-title">MCP Config Explorer Test App</h1>
        <p data-testid="app-description">
          Test app for @mcp-b/mcp-react-config package
        </p>
      </header>

      <div className="test-mode-selector">
        <button
          type="button"
          data-testid="mode-explorer"
          onClick={() => setTestMode('explorer')}
          className={testMode === 'explorer' ? 'active' : ''}
        >
          Explorer Component
        </button>
        <button
          type="button"
          data-testid="mode-utilities"
          onClick={() => setTestMode('utilities')}
          className={testMode === 'utilities' ? 'active' : ''}
        >
          Utilities
        </button>
      </div>

      {testMode === 'explorer' && (
        <section className="test-section">
          <div className="controls">
            <div className="control-group">
              <label htmlFor="mcp-url">MCP Server URL:</label>
              <input
                id="mcp-url"
                type="text"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                data-testid="mcp-url-input"
              />
            </div>

            <div className="control-group">
              <label htmlFor="server-name">Server Name:</label>
              <input
                id="server-name"
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                data-testid="server-name-input"
              />
            </div>

            <button
              type="button"
              onClick={clearUpdates}
              data-testid="clear-updates-btn"
              disabled={updatedConfigs.length === 0}
            >
              Clear Updates ({updatedConfigs.length})
            </button>
          </div>

          {error && (
            <div className="error" data-testid="error-message">
              Error: {error}
            </div>
          )}

          {updatedConfigs.length > 0 && (
            <div className="updates" data-testid="updated-configs">
              <h3>Updated Configurations ({updatedConfigs.length})</h3>
              <ul>
                {updatedConfigs.map((config, idx) => (
                  <li key={idx} data-testid={`updated-config-${idx}`}>
                    <strong>{config.platform}</strong>: {config.fileName}
                    <br />
                    <small>{config.path}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="explorer-container" data-testid="explorer-container">
            <MCPConfigExplorer
              mcpUrl={mcpUrl}
              serverName={serverName}
              onConfigUpdated={handleConfigUpdated}
              onError={handleError}
            />
          </div>
        </section>
      )}

      {testMode === 'utilities' && (
        <section className="test-section">
          <div className="utilities-test" data-testid="utilities-test">
            <h2>Utilities Test Interface</h2>

            <div className="control-group">
              <label htmlFor="platform-select">Platform:</label>
              <select
                id="platform-select"
                value={testPlatform}
                onChange={(e) => setTestPlatform(e.target.value as ConfigPlatform)}
                data-testid="platform-select"
              >
                <option value="claude-desktop">Claude Desktop</option>
                <option value="cursor">Cursor</option>
                <option value="vscode">VSCode</option>
                <option value="continue-dev">Continue.dev</option>
                <option value="cline">Cline</option>
                <option value="windsurf">Windsurf</option>
                <option value="codex">Codex</option>
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="config-content">Config Content (JSON/YAML/TOML):</label>
              <textarea
                id="config-content"
                value={testConfigContent}
                onChange={(e) => setTestConfigContent(e.target.value)}
                data-testid="config-content-input"
                rows={10}
                placeholder="Paste existing config content here..."
              />
            </div>

            <div className="button-group">
              <button
                type="button"
                data-testid="test-generate-config"
                onClick={() => {
                  // Test will implement this
                }}
              >
                Generate Config
              </button>
              <button
                type="button"
                data-testid="test-merge-config"
                onClick={() => {
                  // Test will implement this
                }}
              >
                Test Merge
              </button>
              <button
                type="button"
                data-testid="test-format-config"
                onClick={() => {
                  // Test will implement this
                }}
              >
                Format Config
              </button>
            </div>

            <div className="output" data-testid="utility-output">
              <h3>Output:</h3>
              <pre id="utility-output-content"></pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
