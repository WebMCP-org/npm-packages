/**
 * Web Model Context API - Native Chromium Showcase
 * NO POLYFILL - Native API Only
 */

import { detectNativeAPI, getAPIInfo } from './api/detection';
import { templates } from './examples/templates';
import type { ModelContext, ModelContextTesting, Tool } from './types';
import { EventLog } from './ui/eventLog';
import { ToolDisplay } from './ui/toolDisplay';

// Global instances
let eventLog: EventLog;
let toolDisplay: ToolDisplay;
let modelContext: ModelContext;
let modelContextTesting: ModelContextTesting;

// Bucket tracking
let bucketATools: string[] = [];
const bucketBRegistrations = new Map<string, { unregister: () => void }>();

/**
 * Initialize the application
 */
function init(): void {
  // Detect native API
  const detection = detectNativeAPI();
  updateDetectionBanner(detection);

  if (!detection.isNative) {
    // Show error and stop
    disableApp();
    console.error('Native API not detected:', detection);
    console.info('API Info:', getAPIInfo());
    return;
  }

  // Get API references
  modelContext = navigator.modelContext!;
  modelContextTesting = navigator.modelContextTesting!;

  // Initialize UI managers
  eventLog = new EventLog('event-log');
  toolDisplay = new ToolDisplay('tools-output', 'tool-count');

  // Setup event listeners
  setupEventListeners();
  setupToolChangeListener();

  eventLog.success('Application initialized', 'Native API ready');
}

/**
 * Update the detection banner
 */
function updateDetectionBanner(detection: ReturnType<typeof detectNativeAPI>): void {
  const banner = document.getElementById('detection-banner');
  const status = document.getElementById('detection-status');

  if (!banner || !status) return;

  if (detection.isNative) {
    banner.className = 'sticky top-0 z-50 bg-green-600 text-white shadow-lg';
    status.innerHTML = `
      <span class="flex items-center gap-4 py-3 text-sm">${detection.message}</span>
    `;
  } else if (detection.available && detection.isPolyfill) {
    banner.className = 'sticky top-0 z-50 bg-yellow-600 text-white shadow-lg';
    status.innerHTML = `<span class="flex items-center gap-4 py-3 text-sm">${detection.message}</span>`;
  } else {
    banner.className = 'sticky top-0 z-50 bg-red-600 text-white shadow-lg';
    status.innerHTML = `<span class="flex items-center gap-4 py-3 text-sm">${detection.message}</span>`;
  }
}

/**
 * Disable app when native API is not available
 */
function disableApp(): void {
  const buttons = document.querySelectorAll('button');
  const textareas = document.querySelectorAll('textarea');
  const selects = document.querySelectorAll('select');

  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });

  textareas.forEach((ta) => {
    ta.disabled = true;
    ta.style.opacity = '0.5';
  });

  selects.forEach((sel) => {
    sel.disabled = true;
    sel.style.opacity = '0.5';
  });
}

/**
 * Setup all event listeners
 */
function setupEventListeners(): void {
  // Editor controls
  const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
  const clearEditorBtn = document.getElementById('clear-editor');
  const registerCodeBtn = document.getElementById('register-code');
  const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;

  templateSelect?.addEventListener('change', () => {
    const template = templates[templateSelect.value];
    if (template) {
      codeEditor.value = template;
      eventLog.info('Template loaded', templateSelect.value);
      templateSelect.value = '';
    }
  });

  clearEditorBtn?.addEventListener('click', () => {
    codeEditor.value = '';
    hideError();
    eventLog.info('Editor cleared');
  });

  registerCodeBtn?.addEventListener('click', () => {
    executeEditorCode(codeEditor.value);
  });

  // Two-bucket demo
  document.getElementById('provide-counter-tools')?.addEventListener('click', provideCounterTools);
  document.getElementById('replace-bucket-a')?.addEventListener('click', replaceBucketA);
  document.getElementById('register-timer-tool')?.addEventListener('click', registerTimerTool);
  document.getElementById('unregister-timer')?.addEventListener('click', unregisterTimerTool);

  // Native methods
  document.getElementById('list-tools')?.addEventListener('click', listToolsDemo);
  document.getElementById('execute-tool')?.addEventListener('click', executeToolDemo);
  document.getElementById('unregister-tool')?.addEventListener('click', unregisterToolDemo);
  document.getElementById('clear-context')?.addEventListener('click', clearContextDemo);

  // Testing API
  document.getElementById('testing-list-tools')?.addEventListener('click', testingListTools);
  document.getElementById('testing-execute')?.addEventListener('click', testingExecute);
  document.getElementById('get-tool-calls')?.addEventListener('click', getToolCalls);
  document.getElementById('clear-tool-calls')?.addEventListener('click', clearToolCalls);
  document.getElementById('set-mock')?.addEventListener('click', setMockResponse);
  document.getElementById('reset-testing')?.addEventListener('click', resetTesting);

  // Tool executor
  document.getElementById('exec-button')?.addEventListener('click', executeSelectedTool);

  // Clear log
  document.getElementById('clear-log')?.addEventListener('click', () => {
    eventLog.clear();
  });
}

/**
 * Setup tool change listener
 */
function setupToolChangeListener(): void {
  modelContext.addEventListener('toolschange', () => {
    eventLog.info('Event: toolschange', 'Tools have changed');
    refreshToolDisplay();
  });
}

/**
 * Execute code from the editor
 */
function executeEditorCode(code: string): void {
  hideError();

  if (!code.trim()) {
    showError('Please enter some code');
    return;
  }

  try {
    // Execute the code
    // Note: In a real app, you'd want to sanitize this more carefully
    // biome-ignore lint/security/noGlobalEval: This is a demo/testing tool
    eval(code);

    eventLog.success('Code executed', 'Tool registered successfully');
    refreshToolDisplay();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
    eventLog.error('Execution failed', message);
  }
}

/**
 * Show error message
 */
function showError(message: string): void {
  const errorDiv = document.getElementById('editor-error');
  if (errorDiv) {
    errorDiv.textContent = `Error: ${message}`;
    errorDiv.classList.remove('hidden');
  }
}

/**
 * Hide error message
 */
function hideError(): void {
  const errorDiv = document.getElementById('editor-error');
  if (errorDiv) {
    errorDiv.classList.add('hidden');
  }
}

/**
 * Refresh tool display
 */
function refreshToolDisplay(): void {
  const tools = modelContext.listTools();
  toolDisplay.setTools(tools);
  updateToolExecutorSelect(tools);
  updateBucketIndicators();
}

/**
 * Update bucket indicators
 */
function updateBucketIndicators(): void {
  const bucketADiv = document.getElementById('bucket-a-tools');
  const bucketBDiv = document.getElementById('bucket-b-tools');

  if (bucketADiv) {
    bucketADiv.textContent = bucketATools.length > 0 ? bucketATools.join(', ') : 'Empty';
  }

  if (bucketBDiv) {
    const bucketBNames = Array.from(bucketBRegistrations.keys());
    bucketBDiv.textContent = bucketBNames.length > 0 ? bucketBNames.join(', ') : 'Empty';
  }
}

/**
 * Update tool executor select dropdown
 */
function updateToolExecutorSelect(tools: Tool[]): void {
  const select = document.getElementById('exec-tool-select') as HTMLSelectElement;
  if (!select) return;

  select.innerHTML = '<option value="">Select a tool...</option>';

  for (const tool of tools) {
    const option = document.createElement('option');
    option.value = tool.name;
    option.textContent = `${tool.name} - ${tool.description}`;
    select.appendChild(option);
  }
}

// ==================== Two-Bucket Demos ====================

function provideCounterTools(): void {
  let counter = 0;

  const tools: Tool[] = [
    {
      name: 'counter_increment',
      description: 'Increment counter',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        counter++;
        return { content: [{ type: 'text', text: `Counter: ${counter}` }] };
      },
    },
    {
      name: 'counter_decrement',
      description: 'Decrement counter',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        counter--;
        return { content: [{ type: 'text', text: `Counter: ${counter}` }] };
      },
    },
    {
      name: 'counter_get',
      description: 'Get counter value',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: `Counter: ${counter}` }] };
      },
    },
  ];

  modelContext.provideContext({ tools });
  bucketATools = tools.map((t) => t.name);

  eventLog.success('Bucket A updated', 'Counter tools registered via provideContext()');
  refreshToolDisplay();
}

function replaceBucketA(): void {
  const greetTool: Tool = {
    name: 'greet',
    description: 'Greet someone',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
    async execute(input) {
      return { content: [{ type: 'text', text: `Hello, ${input.name}!` }] };
    },
  };

  modelContext.provideContext({ tools: [greetTool] });
  bucketATools = ['greet'];

  eventLog.success('Bucket A replaced', 'Old counter tools removed, greet tool added');
  refreshToolDisplay();
}

function registerTimerTool(): void {
  let startTime: number | null = null;

  const timerTool: Tool = {
    name: 'timer',
    description: 'Start/stop/check timer',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'check'] },
      },
      required: ['action'],
    },
    async execute(input) {
      switch (input.action) {
        case 'start':
          startTime = Date.now();
          return { content: [{ type: 'text', text: 'Timer started' }] };
        case 'stop': {
          if (!startTime) {
            return { content: [{ type: 'text', text: 'Timer not running' }], isError: true };
          }
          const elapsed = Date.now() - startTime;
          startTime = null;
          return { content: [{ type: 'text', text: `Elapsed: ${(elapsed / 1000).toFixed(2)}s` }] };
        }
        case 'check': {
          if (!startTime) {
            return { content: [{ type: 'text', text: 'Timer not running' }], isError: true };
          }
          const elapsed = Date.now() - startTime;
          return { content: [{ type: 'text', text: `Running: ${(elapsed / 1000).toFixed(2)}s` }] };
        }
        default:
          return { content: [{ type: 'text', text: 'Invalid action' }], isError: true };
      }
    },
  };

  const registration = modelContext.registerTool(timerTool);
  bucketBRegistrations.set('timer', registration);

  eventLog.success('Bucket B updated', 'Timer tool registered via registerTool()');
  refreshToolDisplay();
}

function unregisterTimerTool(): void {
  const registration = bucketBRegistrations.get('timer');
  if (registration) {
    registration.unregister();
    bucketBRegistrations.delete('timer');
    eventLog.success('Tool unregistered', 'Timer tool removed from Bucket B');
    refreshToolDisplay();
  } else {
    eventLog.warning('Timer tool not found', 'Nothing to unregister');
  }
}

// ==================== Native Method Demos ====================

function listToolsDemo(): void {
  const tools = modelContext.listTools();
  const result = document.getElementById('native-result');

  if (result) {
    result.textContent = JSON.stringify(
      tools.map((t) => ({ name: t.name, description: t.description })),
      null,
      2
    );
    result.classList.remove('hidden');
  }

  eventLog.info('listTools() called', `Found ${tools.length} tools`);
}

async function executeToolDemo(): Promise<void> {
  const tools = modelContext.listTools();
  const result = document.getElementById('native-result');

  if (tools.length === 0) {
    eventLog.warning('No tools available', 'Register some tools first');
    return;
  }

  try {
    const firstTool = tools[0];
    const toolResult = await modelContext.executeTool(firstTool.name, {});

    if (result) {
      result.textContent = JSON.stringify(toolResult, null, 2);
      result.classList.remove('hidden');
    }

    eventLog.success(`executeTool("${firstTool.name}")`, 'Tool executed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    eventLog.error('executeTool() failed', message);

    if (result) {
      result.textContent = `Error: ${message}`;
      result.classList.remove('hidden');
    }
  }
}

function unregisterToolDemo(): void {
  if (bucketATools.length === 0) {
    eventLog.warning('No Bucket A tools', 'Use provideContext() first');
    return;
  }

  const toolName = bucketATools[0];
  modelContext.unregisterTool(toolName);

  eventLog.success('unregisterTool() called', `Removed "${toolName}" (native method)`);
  refreshToolDisplay();
}

function clearContextDemo(): void {
  modelContext.clearContext();
  bucketATools = [];
  bucketBRegistrations.clear();

  eventLog.success('clearContext() called', 'All tools cleared (native method)');
  refreshToolDisplay();
}

// ==================== Testing API Demos ====================

function testingListTools(): void {
  const tools = modelContextTesting.listTools();
  const result = document.getElementById('testing-result');

  if (result) {
    result.textContent = JSON.stringify(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema, // This is a JSON string!
      })),
      null,
      2
    );
    result.classList.remove('hidden');
  }

  eventLog.info('Testing.listTools() called', `Found ${tools.length} tools`);
}

async function testingExecute(): Promise<void> {
  const tools = modelContextTesting.listTools();
  const result = document.getElementById('testing-result');

  if (tools.length === 0) {
    eventLog.warning('No tools available', 'Register some tools first');
    return;
  }

  try {
    const firstTool = tools[0];
    // Note: executeTool takes JSON STRING, not object
    const toolResult = await modelContextTesting.executeTool(firstTool.name, '{}');

    if (result) {
      result.textContent = `Result (string):\n${toolResult}`;
      result.classList.remove('hidden');
    }

    eventLog.success(`Testing.executeTool("${firstTool.name}")`, 'Tool executed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    eventLog.error('Testing.executeTool() failed', message);

    if (result) {
      result.textContent = `Error: ${message}`;
      result.classList.remove('hidden');
    }
  }
}

function getToolCalls(): void {
  const calls = modelContextTesting.getToolCalls();
  const result = document.getElementById('testing-result');

  if (result) {
    result.textContent = JSON.stringify(calls, null, 2);
    result.classList.remove('hidden');
  }

  eventLog.info('getToolCalls() called', `Found ${calls.length} calls`);
}

function clearToolCalls(): void {
  modelContextTesting.clearToolCalls();
  const result = document.getElementById('testing-result');

  if (result) {
    result.textContent = 'Tool call history cleared';
    result.classList.remove('hidden');
  }

  eventLog.success('clearToolCalls() called', 'History cleared');
}

function setMockResponse(): void {
  const tools = modelContextTesting.listTools();

  if (tools.length === 0) {
    eventLog.warning('No tools available', 'Register some tools first');
    return;
  }

  const toolName = tools[0].name;
  const mockResponse = 'This is a mocked response!';

  modelContextTesting.setMockToolResponse(toolName, mockResponse);

  const result = document.getElementById('testing-result');
  if (result) {
    result.textContent = `Mock set for "${toolName}"\nResponse: ${mockResponse}`;
    result.classList.remove('hidden');
  }

  eventLog.success('setMockToolResponse() called', `Mocked "${toolName}"`);
}

function resetTesting(): void {
  modelContextTesting.reset();

  const result = document.getElementById('testing-result');
  if (result) {
    result.textContent = 'Testing API reset';
    result.classList.remove('hidden');
  }

  eventLog.success('reset() called', 'Testing state cleared');
}

// ==================== Tool Executor ====================

async function executeSelectedTool(): Promise<void> {
  const select = document.getElementById('exec-tool-select') as HTMLSelectElement;
  const input = document.getElementById('exec-input') as HTMLTextAreaElement;
  const result = document.getElementById('exec-result');

  if (!select.value) {
    eventLog.warning('No tool selected', 'Please select a tool first');
    return;
  }

  try {
    const args = input.value.trim() ? JSON.parse(input.value) : {};
    const toolResult = await modelContext.executeTool(select.value, args);

    if (result) {
      result.textContent = JSON.stringify(toolResult, null, 2);
      result.classList.remove('hidden');
    }

    eventLog.success(`Executed "${select.value}"`, 'Tool executed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (result) {
      result.textContent = `Error: ${message}`;
      result.classList.remove('hidden');
    }

    eventLog.error('Execution failed', message);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
