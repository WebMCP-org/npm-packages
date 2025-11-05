// Web Model Context API Test App
// Tests window.navigator.modelContext with two-bucket tool management

// Import the global package to initialize navigator.modelContext
import '@mcp-b/global';

// Counter state
let counter = 0;

// Dynamic tool registration
let dynamicToolRegistration: { unregister: () => void } | null = null;

// DOM Elements
const apiStatusEl = document.getElementById('api-status');
const counterDisplayEl = document.getElementById('counter-display');
const logEl = document.getElementById('log');
const dynamicStatusEl = document.getElementById('dynamic-status');

if (!apiStatusEl || !counterDisplayEl || !logEl || !dynamicStatusEl) {
  throw new Error('Required DOM elements not found');
}

const incrementBtn = document.getElementById('increment') as HTMLButtonElement;
const decrementBtn = document.getElementById('decrement') as HTMLButtonElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;
const getCounterBtn = document.getElementById('get-counter') as HTMLButtonElement;

const registerDynamicBtn = document.getElementById('register-dynamic') as HTMLButtonElement;
const unregisterDynamicBtn = document.getElementById('unregister-dynamic') as HTMLButtonElement;
const callDynamicBtn = document.getElementById('call-dynamic') as HTMLButtonElement;

const replaceBaseToolsBtn = document.getElementById('replace-base-tools') as HTMLButtonElement;
const listAllToolsBtn = document.getElementById('list-all-tools') as HTMLButtonElement;
const clearLogBtn = document.getElementById('clear-log') as HTMLButtonElement;

const testingApiStatusEl = document.getElementById('testing-api-status');
const checkTestingApiBtn = document.getElementById('check-testing-api') as HTMLButtonElement;
const testToolTrackingBtn = document.getElementById('test-tool-tracking') as HTMLButtonElement;
const testMockResponseBtn = document.getElementById('test-mock-response') as HTMLButtonElement;
const testResetBtn = document.getElementById('test-reset') as HTMLButtonElement;

// Logging utility
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Update counter display
function updateCounterDisplay() {
  counterDisplayEl.textContent = counter.toString();
  counterDisplayEl.setAttribute('data-counter', counter.toString());
}

// Check if API is available
function checkAPIAvailability() {
  if ('modelContext' in navigator) {
    apiStatusEl.textContent = 'API: Ready ✅';
    apiStatusEl.className = 'status connected';
    apiStatusEl.setAttribute('data-status', 'ready');
    log('navigator.modelContext API is available', 'success');
    return true;
  }
  apiStatusEl.textContent = 'API: Not Available ❌';
  apiStatusEl.className = 'status disconnected';
  apiStatusEl.setAttribute('data-status', 'unavailable');
  log('navigator.modelContext API is NOT available', 'error');
  return false;
}

// Register base tools (Bucket A) using provideContext
function registerBaseTools() {
  try {
    log('Registering base tools via provideContext()...');

    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'incrementCounter',
          description: 'Increment the counter by 1',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            counter++;
            updateCounterDisplay();
            log(`Counter incremented to ${counter}`, 'success');
            return {
              content: [
                {
                  type: 'text',
                  text: `Counter incremented to ${counter}`,
                },
              ],
            };
          },
        },
        {
          name: 'decrementCounter',
          description: 'Decrement the counter by 1',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            counter--;
            updateCounterDisplay();
            log(`Counter decremented to ${counter}`, 'success');
            return {
              content: [
                {
                  type: 'text',
                  text: `Counter decremented to ${counter}`,
                },
              ],
            };
          },
        },
        {
          name: 'resetCounter',
          description: 'Reset the counter to 0',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            const oldValue = counter;
            counter = 0;
            updateCounterDisplay();
            log(`Counter reset from ${oldValue} to 0`, 'success');
            return {
              content: [
                {
                  type: 'text',
                  text: 'Counter reset to 0',
                },
              ],
            };
          },
        },
        {
          name: 'getCounter',
          description: 'Get the current counter value',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            log(`Counter value retrieved: ${counter}`, 'info');
            return {
              content: [
                {
                  type: 'text',
                  text: `Current counter value: ${counter}`,
                },
              ],
            };
          },
        },
      ],
    });

    log('Base tools registered successfully (Bucket A)', 'success');
  } catch (error) {
    log(`Failed to register base tools: ${error}`, 'error');
    console.error(error);
  }
}

// Register a dynamic tool (Bucket B) using registerTool
function registerDynamicTool() {
  try {
    if (dynamicToolRegistration) {
      log('Dynamic tool already registered', 'error');
      return;
    }

    log('Registering dynamic tool via registerTool()...');

    dynamicToolRegistration = navigator.modelContext.registerTool({
      name: 'dynamicTool',
      description: 'A dynamically registered tool that persists across provideContext calls',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      async execute() {
        log('Dynamic tool executed!', 'success');
        return {
          content: [
            {
              type: 'text',
              text: 'Dynamic tool executed successfully! (Bucket B)',
            },
          ],
        };
      },
    });

    log('Dynamic tool registered successfully (Bucket B)', 'success');
    dynamicStatusEl.textContent = 'Dynamic tool status: Registered ✅';
    dynamicStatusEl.style.background = '#d4edda';
    registerDynamicBtn.disabled = true;
    unregisterDynamicBtn.disabled = false;
    callDynamicBtn.disabled = false;
  } catch (error) {
    log(`Failed to register dynamic tool: ${error}`, 'error');
    console.error(error);
  }
}

// Unregister the dynamic tool
function unregisterDynamicTool() {
  try {
    if (!dynamicToolRegistration) {
      log('No dynamic tool to unregister', 'error');
      return;
    }

    log('Unregistering dynamic tool...');
    dynamicToolRegistration.unregister();
    dynamicToolRegistration = null;

    log('Dynamic tool unregistered successfully', 'success');
    dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
    dynamicStatusEl.style.background = '#f5f5f5';
    registerDynamicBtn.disabled = false;
    unregisterDynamicBtn.disabled = true;
    callDynamicBtn.disabled = true;
  } catch (error) {
    log(`Failed to unregister dynamic tool: ${error}`, 'error');
    console.error(error);
  }
}

// Test calling the dynamic tool (simulated)
function callDynamicTool() {
  if (!dynamicToolRegistration) {
    log('Dynamic tool is not registered', 'error');
    return;
  }

  log('Dynamic tool would be called by MCP client', 'info');
  log('In a real scenario, an MCP client would call this tool', 'info');
}

// Replace base tools to test two-bucket system
function replaceBaseTools() {
  try {
    log('Replacing base tools with new set (Bucket A should be replaced)...');

    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'doubleCounter',
          description: 'Double the counter value',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            counter *= 2;
            updateCounterDisplay();
            log(`Counter doubled to ${counter}`, 'success');
            return {
              content: [
                {
                  type: 'text',
                  text: `Counter doubled to ${counter}`,
                },
              ],
            };
          },
        },
        {
          name: 'halveCounter',
          description: 'Halve the counter value',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          async execute() {
            counter = Math.floor(counter / 2);
            updateCounterDisplay();
            log(`Counter halved to ${counter}`, 'success');
            return {
              content: [
                {
                  type: 'text',
                  text: `Counter halved to ${counter}`,
                },
              ],
            };
          },
        },
      ],
    });

    log('Base tools replaced! Old tools (increment, decrement, etc.) are gone.', 'success');
    if (dynamicToolRegistration) {
      log('✅ Dynamic tool still registered! (Bucket B persists)', 'success');
    }
  } catch (error) {
    log(`Failed to replace base tools: ${error}`, 'error');
    console.error(error);
  }
}

// List all registered tools (simulated)
function listAllTools() {
  log('Listing all registered tools...', 'info');
  log('In a real scenario, an MCP client would call listTools()', 'info');
  log('Check browser console for __mcpBridge.tools to see registered tools', 'info');

  // Access the internal bridge for debugging
  const w = window as unknown as {
    __mcpBridge?: {
      tools: Map<string, { description: string; [key: string]: unknown }>;
    };
  };
  if (w.__mcpBridge) {
    const tools = w.__mcpBridge.tools;
    log(`Total tools registered: ${tools.size}`, 'info');
    tools.forEach((tool, name: string) => {
      log(`  - ${name}: ${tool.description}`, 'info');
    });
  }
}

// Check if modelContextTesting API is available
function checkTestingAPI() {
  if (testingApiStatusEl) {
    if ('modelContextTesting' in navigator) {
      const testingAPI = navigator.modelContextTesting;
      const isNative = testingAPI && !testingAPI.constructor.name.includes('WebModelContextTesting');

      testingApiStatusEl.textContent = `Testing API: Available ✅ (${isNative ? 'Native' : 'Polyfill'})`;
      testingApiStatusEl.style.background = '#d4edda';
      testingApiStatusEl.setAttribute('data-testing-api', 'available');
      testingApiStatusEl.setAttribute('data-testing-api-type', isNative ? 'native' : 'polyfill');

      log(`navigator.modelContextTesting is available (${isNative ? 'Native' : 'Polyfill'})`, 'success');

      const methods = ['getToolCalls', 'clearToolCalls', 'setMockToolResponse', 'clearMockToolResponse', 'clearAllMockToolResponses', 'getRegisteredTools', 'reset'];
      log(`Available methods: ${methods.join(', ')}`, 'info');
    } else {
      testingApiStatusEl.textContent = 'Testing API: Not Available ❌';
      testingApiStatusEl.style.background = '#f8d7da';
      testingApiStatusEl.setAttribute('data-testing-api', 'unavailable');
      log('navigator.modelContextTesting is NOT available', 'error');
    }
  }
}

// Test tool call tracking
async function testToolCallTracking() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  log('Testing tool call tracking...', 'info');

  testingAPI.clearToolCalls();
  log('Cleared tool call history', 'info');

  const tools = navigator.modelContext.listTools();
  if (tools.length === 0) {
    log('No tools registered. Register tools first.', 'error');
    return;
  }

  const firstTool = tools[0];
  log(`Executing tool: ${firstTool.name}`, 'info');

  try {
    await navigator.modelContext.executeTool(firstTool.name, {});

    const calls = testingAPI.getToolCalls();
    log(`Tool calls tracked: ${calls.length}`, 'success');

    if (calls.length > 0) {
      const lastCall = calls[calls.length - 1];
      log(`Last call: ${lastCall.toolName} at ${new Date(lastCall.timestamp).toLocaleTimeString()}`, 'info');
      testingApiStatusEl?.setAttribute('data-tool-calls', calls.length.toString());
    }
  } catch (error) {
    log(`Tool execution failed: ${error}`, 'error');
  }
}

// Test mock response functionality
async function testMockResponse() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  log('Testing mock response...', 'info');

  const tools = navigator.modelContext.listTools();
  if (tools.length === 0) {
    log('No tools registered. Register tools first.', 'error');
    return;
  }

  const firstTool = tools[0];
  const mockResponse = {
    content: [
      {
        type: 'text' as const,
        text: 'This is a MOCK response!',
      },
    ],
  };

  testingAPI.setMockToolResponse(firstTool.name, mockResponse);
  log(`Set mock response for ${firstTool.name}`, 'info');

  try {
    const result = await navigator.modelContext.executeTool(firstTool.name, {});
    log(`Tool returned: ${JSON.stringify(result)}`, 'info');

    if (result.content[0].type === 'text' && result.content[0].text === 'This is a MOCK response!') {
      log('Mock response verified! ✅', 'success');
      testingApiStatusEl?.setAttribute('data-mock-response', 'working');
    } else {
      log('Mock response NOT used', 'error');
    }

    testingAPI.clearMockToolResponse(firstTool.name);
    log(`Cleared mock response for ${firstTool.name}`, 'info');
  } catch (error) {
    log(`Tool execution failed: ${error}`, 'error');
  }
}

// Test reset functionality
function testReset() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  log('Testing reset functionality...', 'info');

  const callsBefore = testingAPI.getToolCalls().length;
  log(`Tool calls before reset: ${callsBefore}`, 'info');

  testingAPI.reset();
  log('Called reset()', 'info');

  const callsAfter = testingAPI.getToolCalls().length;
  log(`Tool calls after reset: ${callsAfter}`, 'info');

  if (callsAfter === 0) {
    log('Reset successful! ✅', 'success');
    testingApiStatusEl?.setAttribute('data-reset', 'working');
    testingApiStatusEl?.removeAttribute('data-tool-calls');
    testingApiStatusEl?.removeAttribute('data-mock-response');
  } else {
    log('Reset failed', 'error');
  }
}

// Event listeners
incrementBtn.addEventListener('click', () => {
  log('Increment button clicked (would call incrementCounter tool)', 'info');
});

decrementBtn.addEventListener('click', () => {
  log('Decrement button clicked (would call decrementCounter tool)', 'info');
});

resetBtn.addEventListener('click', () => {
  log('Reset button clicked (would call resetCounter tool)', 'info');
});

getCounterBtn.addEventListener('click', () => {
  log('Get Counter button clicked (would call getCounter tool)', 'info');
});

registerDynamicBtn.addEventListener('click', registerDynamicTool);
unregisterDynamicBtn.addEventListener('click', unregisterDynamicTool);
callDynamicBtn.addEventListener('click', callDynamicTool);

replaceBaseToolsBtn.addEventListener('click', replaceBaseTools);
listAllToolsBtn.addEventListener('click', listAllTools);

clearLogBtn.addEventListener('click', () => {
  logEl.innerHTML = '';
  log('Log cleared');
});

checkTestingApiBtn.addEventListener('click', checkTestingAPI);
testToolTrackingBtn.addEventListener('click', testToolCallTracking);
testMockResponseBtn.addEventListener('click', testMockResponse);
testResetBtn.addEventListener('click', testReset);

// Initialize
updateCounterDisplay();
log('Application initialized');

if (checkAPIAvailability()) {
  registerBaseTools();
  log('✅ Test app ready! Use buttons to test two-bucket system.', 'success');
}

// Type for test API
declare global {
  interface Window {
    testApp: {
      counter: () => number;
      registerBaseTools: () => void;
      registerDynamicTool: () => void;
      unregisterDynamicTool: () => void;
      replaceBaseTools: () => void;
      listAllTools: () => void;
      getAPIStatus: () => boolean;
      checkTestingAPI: () => void;
      testToolCallTracking: () => Promise<void>;
      testMockResponse: () => Promise<void>;
      testReset: () => void;
      hasTestingAPI: () => boolean;
    };
  }
}

// Expose functions for testing
window.testApp = {
  counter: () => counter,
  registerBaseTools,
  registerDynamicTool,
  unregisterDynamicTool,
  replaceBaseTools,
  listAllTools,
  getAPIStatus: () => 'modelContext' in navigator,
  checkTestingAPI,
  testToolCallTracking,
  testMockResponse,
  testReset,
  hasTestingAPI: () => 'modelContextTesting' in navigator,
};
