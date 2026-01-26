import { useMcpClient, useWebMCP } from '@mcp-b/react-webmcp';
import { useEffect, useState } from 'react';
import { z } from 'zod';

// Counter state
let globalCounter = 0;

function App() {
  const [logs, setLogs] = useState<
    Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>
  >([]);
  const [zodInfo, setZodInfo] = useState<{
    isZod3: boolean;
    hasDef: boolean;
    hasZod: boolean;
  } | null>(null);

  // MCP Client for displaying registered tools
  const { tools: clientTools } = useMcpClient();

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random()}`;
    setLogs((prev) => [...prev, { id, message: `[${timestamp}] ${message}`, type }]);
  };

  // Check Zod version on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: Run only once on mount
  useEffect(() => {
    const testSchema = z.string();
    const hasZod = '_zod' in testSchema;
    const hasDef = '_def' in testSchema;
    const isZod3 = hasDef && !hasZod;
    setZodInfo({ isZod3, hasDef, hasZod });

    if (!isZod3) {
      addLog('WARNING: Expected Zod 3.x but detected different version!', 'error');
    } else {
      addLog('Zod 3.x detected correctly', 'success');
    }
  }, []);

  // Tool 1: Counter Increment
  const incrementTool = useWebMCP({
    name: 'react18_counter_increment',
    description: 'Increment the counter (React 18 + Zod 3)',
    inputSchema: {
      amount: z.number().min(1).max(100).default(1).describe('Amount to increment'),
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      globalCounter += input.amount;
      addLog(`Incremented by ${input.amount}. New value: ${globalCounter}`, 'success');
      return { counter: globalCounter, incremented: input.amount };
    },
    onError: (error) => {
      addLog(`Error: ${error.message}`, 'error');
    },
  });

  // Tool 2: Counter Decrement
  const decrementTool = useWebMCP({
    name: 'react18_counter_decrement',
    description: 'Decrement the counter (React 18 + Zod 3)',
    inputSchema: {
      amount: z.number().min(1).max(100).default(1).describe('Amount to decrement'),
    },
    handler: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      globalCounter -= input.amount;
      addLog(`Decremented by ${input.amount}. New value: ${globalCounter}`, 'success');
      return { counter: globalCounter, decremented: input.amount };
    },
  });

  // Tool 3: User Validator (comprehensive validation test)
  const userValidatorTool = useWebMCP({
    name: 'react18_user_validator',
    description: 'Validate user data (React 18 + Zod 3)',
    inputSchema: {
      username: z.string().min(3).max(20).describe('Username (3-20 chars)'),
      email: z.string().email().describe('Valid email address'),
      age: z.number().int().min(18).max(120).describe('Age (18-120)'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
    },
    handler: async ({ username, email, age, tags }) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      addLog(
        `Validated: ${username}, ${email}, age=${age}, tags=${tags?.join(',') || 'none'}`,
        'success'
      );
      return { valid: true, username, email, age, tags };
    },
    onError: (error) => {
      addLog(`Validation error: ${error.message}`, 'error');
    },
  });

  // Tool 4: Reset Counter
  const resetTool = useWebMCP({
    name: 'react18_counter_reset',
    description: 'Reset the counter to zero',
    handler: async () => {
      const oldValue = globalCounter;
      globalCounter = 0;
      addLog(`Reset counter from ${oldValue} to 0`, 'success');
      return { oldValue, newValue: 0 };
    },
  });

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

  const handleValidUser = async () => {
    try {
      await userValidatorTool.execute({
        username: 'testuser',
        email: 'test@example.com',
        age: 25,
        tags: ['react18', 'zod3'],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleInvalidEmail = async () => {
    try {
      await userValidatorTool.execute({
        username: 'testuser',
        email: 'not-an-email',
        age: 25,
      });
    } catch (_error) {
      addLog('Invalid email rejected as expected', 'success');
    }
  };

  const handleAgeTooLow = async () => {
    try {
      await userValidatorTool.execute({
        username: 'testuser',
        email: 'test@example.com',
        age: 15,
      });
    } catch (_error) {
      addLog('Age too low rejected as expected', 'success');
    }
  };

  const clearLogs = () => setLogs([]);

  const isAnyExecuting =
    incrementTool.state.isExecuting ||
    decrementTool.state.isExecuting ||
    resetTool.state.isExecuting ||
    userValidatorTool.state.isExecuting;

  const totalExecutions =
    incrementTool.state.executionCount +
    decrementTool.state.executionCount +
    resetTool.state.executionCount +
    userValidatorTool.state.executionCount;

  return (
    <div className="app-container">
      <h1>React 18 + Zod 3 Test App</h1>
      <p className="subtitle">
        <span className="badge react18">React 18</span>
        <span className="badge zod3">Zod 3.25.x</span>
        Testing <code>@mcp-b/react-webmcp</code> with Zod 3
      </p>

      {/* Status */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span className={`status-badge ${isAnyExecuting ? 'executing' : 'ready'}`}>
          {isAnyExecuting ? 'Executing' : 'Ready'}
        </span>
      </div>

      {/* Zod Version Check */}
      <div className="section">
        <h2>Zod Version Check</h2>
        {zodInfo && (
          <div style={{ padding: '0.5rem', background: 'white', borderRadius: '6px' }}>
            <p style={{ color: zodInfo.isZod3 ? '#22543d' : '#742a2a', fontWeight: 'bold' }}>
              {zodInfo.isZod3 ? '✓ Zod 3.x detected (correct)' : '✗ Wrong Zod version!'}
            </p>
            <p style={{ color: '#718096', fontSize: '0.85rem' }}>
              Has _def: {zodInfo.hasDef.toString()}, Has _zod: {zodInfo.hasZod.toString()}
            </p>
          </div>
        )}
      </div>

      {/* Counter Section */}
      <div className="section">
        <h2>Counter Tools</h2>
        <div className="counter-display">{globalCounter}</div>
        <div className="button-group">
          <button
            className="primary"
            onClick={handleIncrement}
            disabled={incrementTool.state.isExecuting}
          >
            {incrementTool.state.isExecuting && <span className="spinner" />}
            Increment (+1)
          </button>
          <button
            className="primary"
            onClick={handleDecrement}
            disabled={decrementTool.state.isExecuting}
          >
            {decrementTool.state.isExecuting && <span className="spinner" />}
            Decrement (-1)
          </button>
          <button className="danger" onClick={handleReset} disabled={resetTool.state.isExecuting}>
            {resetTool.state.isExecuting && <span className="spinner" />}
            Reset
          </button>
        </div>
      </div>

      {/* Validation Tests Section */}
      <div className="section">
        <h2>Validation Tests</h2>
        <div className="button-group">
          <button
            className="secondary"
            onClick={handleValidUser}
            disabled={userValidatorTool.state.isExecuting}
          >
            {userValidatorTool.state.isExecuting && <span className="spinner" />}
            Valid User
          </button>
          <button className="danger" onClick={handleInvalidEmail}>
            Test Invalid Email
          </button>
          <button className="danger" onClick={handleAgeTooLow}>
            Test Age Too Low
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="section">
        <h2>Statistics</h2>
        <div className="stats">
          <div className="stat-card">
            <div className="label">Total Executions</div>
            <div className="value">{totalExecutions}</div>
          </div>
          <div className="stat-card">
            <div className="label">Registered Tools</div>
            <div className="value">{clientTools.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Log Entries</div>
            <div className="value">{logs.length}</div>
          </div>
        </div>
      </div>

      {/* Registered Tools */}
      <div className="section">
        <h2>Registered MCP Tools ({clientTools.length})</h2>
        <div
          style={{
            background: 'white',
            padding: '1rem',
            borderRadius: '6px',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          {clientTools.length === 0 ? (
            <p style={{ color: '#718096', fontStyle: 'italic' }}>Loading tools...</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {clientTools.map((tool) => (
                <li key={tool.name} style={{ marginBottom: '0.25rem' }}>
                  <strong>{tool.name}</strong> - {tool.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Event Log */}
      <div className="section">
        <h2>
          Event Log
          <button
            onClick={clearLogs}
            style={{
              marginLeft: 'auto',
              background: '#e2e8f0',
              color: '#2d3748',
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
            }}
          >
            Clear
          </button>
        </h2>
        <div className="log">
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
    </div>
  );
}

export default App;
