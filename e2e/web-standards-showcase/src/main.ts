/**
 * Web Model Context API - Native Chromium Showcase
 * NO POLYFILL - Native API Only
 */

import { detectNativeAPI, getAPIInfo } from './api/detection';
import { templates } from './examples/templates';
import { mountReactToolExecutor } from './mountReactToolExecutor';
import type { ModelContext, ModelContextTesting, Tool, ToolInfo } from './types';
import { EventLog } from './ui/eventLog';

// Global instances
let eventLog: EventLog;
let modelContext: ModelContext;
let modelContextTesting: ModelContextTesting;

// Bucket tracking
let bucketATools: string[] = [];
const bucketBRegistrations = new Map<string, { unregister: () => void }>();

// Iframe context tracking
let iframeReady = false;
let iframeTools: string[] = [];
let iframeBucketBTools: string[] = [];
const iframeBucketBRegistrations = new Map<string, { unregister: () => void }>();

// Iframe event log
class IframeEventLog {
  private container: HTMLElement | null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId);
  }

  log(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
    if (!this.container) return;

    const colors: Record<string, string> = {
      info: 'text-blue-400',
      success: 'text-green-400',
      warning: 'text-yellow-400',
      error: 'text-red-400',
    };

    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `${colors[type]} py-0.5`;
    entry.textContent = `[${timestamp}] ${message}`;

    this.container.insertBefore(entry, this.container.firstChild);
  }

  clear(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

let iframeEventLog: IframeEventLog;

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
  // biome-ignore lint/style/noNonNullAssertion: Checked in detection step above
  modelContext = navigator.modelContext!;
  // biome-ignore lint/style/noNonNullAssertion: Checked in detection step above
  modelContextTesting = navigator.modelContextTesting!;

  // Initialize UI managers
  eventLog = new EventLog('event-log');
  iframeEventLog = new IframeEventLog('iframe-event-log');

  // Setup event listeners
  setupEventListeners();
  setupToolChangeListener();
  setupIframeEventListeners();
  setupIframeMessageListener();

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
  const tools = modelContextTesting.listTools();
  updateToolCount(tools.length);
  updateToolExecutorSelect(tools);
  updateReactToolExecutor(tools);
  updateBucketIndicators();
}

/**
 * Update tool count display
 */
function updateToolCount(count: number): void {
  const countElement = document.getElementById('tool-count');
  if (countElement) {
    countElement.textContent = count === 0 ? '0 tools' : count === 1 ? '1 tool' : `${count} tools`;
  }
}

/**
 * Mount/update React tool executor
 */
function updateReactToolExecutor(tools: ToolInfo[]): void {
  const container = document.getElementById('react-tool-executor');
  if (!container) return;

  mountReactToolExecutor(container, tools, async (toolName: string, argsJson: string) => {
    eventLog.info(`Executing "${toolName}"`, argsJson);
    const result = await modelContextTesting.executeTool(toolName, argsJson);
    eventLog.success(`Executed "${toolName}"`, 'Tool executed successfully');
    return result;
  });
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
function updateToolExecutorSelect(tools: ToolInfo[]): void {
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
        return `Counter: ${counter}`;
      },
    },
    {
      name: 'counter_decrement',
      description: 'Decrement counter',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        counter--;
        return `Counter: ${counter}`;
      },
    },
    {
      name: 'counter_get',
      description: 'Get counter value with structured output',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          counter: { type: 'number', description: 'Current counter value' },
          timestamp: { type: 'string', description: 'ISO timestamp' },
        },
        required: ['counter', 'timestamp'],
      },
      async execute() {
        return { counter, timestamp: new Date().toISOString() };
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
      return `Hello, ${input.name}!`;
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
          return 'Timer started';
        case 'stop': {
          if (!startTime) {
            throw new Error('Timer not running');
          }
          const elapsed = Date.now() - startTime;
          startTime = null;
          return `Elapsed: ${(elapsed / 1000).toFixed(2)}s`;
        }
        case 'check': {
          if (!startTime) {
            throw new Error('Timer not running');
          }
          const elapsed = Date.now() - startTime;
          return `Running: ${(elapsed / 1000).toFixed(2)}s`;
        }
        default:
          throw new Error('Invalid action');
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
  const tools = modelContextTesting.listTools();
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
  const tools = modelContextTesting.listTools();
  const result = document.getElementById('native-result');

  if (tools.length === 0) {
    eventLog.warning('No tools available', 'Register some tools first');
    return;
  }

  try {
    const firstTool = tools[0];
    const toolResult = await modelContextTesting.executeTool(firstTool.name, JSON.stringify({}));

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
    const toolResult = await modelContextTesting.executeTool(select.value, JSON.stringify(args));
    console.log('Tool result:', toolResult);
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

// ==================== Iframe Context Propagation ====================

/**
 * Setup iframe-related event listeners
 */
function setupIframeEventListeners(): void {
  // Parent context controls
  document
    .getElementById('iframe-parent-register-a')
    ?.addEventListener('click', iframeParentRegisterBucketA);
  document
    .getElementById('iframe-parent-register-b')
    ?.addEventListener('click', iframeParentRegisterBucketB);
  document
    .getElementById('iframe-parent-unregister-b')
    ?.addEventListener('click', iframeParentUnregisterBucketB);
  document
    .getElementById('iframe-parent-clear')
    ?.addEventListener('click', iframeParentClearContext);

  // Iframe child controls (send commands to iframe)
  document
    .getElementById('iframe-child-register-a')
    ?.addEventListener('click', () => sendIframeCommand('register-bucket-a'));
  document
    .getElementById('iframe-child-register-b')
    ?.addEventListener('click', () => sendIframeCommand('register-bucket-b'));
  document
    .getElementById('iframe-child-unregister-b')
    ?.addEventListener('click', () => sendIframeCommand('unregister-bucket-b'));
  document
    .getElementById('iframe-child-clear')
    ?.addEventListener('click', () => sendIframeCommand('clear-context'));

  // Iframe management
  document.getElementById('iframe-reload')?.addEventListener('click', reloadIframe);
  document.getElementById('clear-iframe-log')?.addEventListener('click', () => {
    iframeEventLog.clear();
  });
}

/**
 * Setup message listener for iframe communication
 */
function setupIframeMessageListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    // Only accept messages from same origin (for same-origin iframe)
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data?.type?.startsWith('iframe-')) return;

    switch (data.type) {
      case 'iframe-iframe-ready':
        handleIframeReady(data.data);
        break;
      case 'iframe-tools-changed':
        handleIframeToolsChanged(data.data);
        break;
      case 'iframe-tool-registered':
        handleIframeToolRegistered(data.data);
        break;
      case 'iframe-tool-unregistered':
        handleIframeToolUnregistered(data.data);
        break;
      case 'iframe-context-cleared':
        handleIframeContextCleared();
        break;
      case 'iframe-tools-list':
        handleIframeToolsList(data.data);
        break;
    }
  });
}

/**
 * Send a command to the iframe
 */
function sendIframeCommand(command: string): void {
  const iframe = document.getElementById('test-iframe') as HTMLIFrameElement;
  if (iframe?.contentWindow) {
    if (!iframeReady && command !== 'get-tools') {
      iframeEventLog.log('warning', `Iframe not ready, command may not be processed: ${command}`);
    }
    iframe.contentWindow.postMessage({ type: 'iframe-command', command }, '*');
    iframeEventLog.log('info', `Sent command to iframe: ${command}`);
  }
}

/**
 * Handle iframe ready event
 */
function handleIframeReady(data: { origin: string }): void {
  iframeReady = true;
  updateIframeStatusIndicator(true);
  iframeEventLog.log('success', `Iframe ready (origin: ${data.origin})`);

  // Request initial tool list
  sendIframeCommand('get-tools');
}

/**
 * Handle iframe tools changed event
 */
function handleIframeToolsChanged(data: { tools: string[] }): void {
  iframeTools = data.tools;
  updateIframeToolsDisplay();
  updateContextComparison();
  iframeEventLog.log('info', `Iframe tools changed: ${data.tools.length} tools`);
}

/**
 * Handle iframe tool registered event
 */
function handleIframeToolRegistered(data: { name: string; bucket: string }): void {
  if (data.bucket === 'B') {
    iframeBucketBTools.push(data.name);
    updateIframeUnregisterButton(true);
  }
  iframeEventLog.log('success', `Iframe registered: ${data.name} (Bucket ${data.bucket})`);
  sendIframeCommand('get-tools');
}

/**
 * Handle iframe tool unregistered event
 */
function handleIframeToolUnregistered(data: { name: string; bucket: string }): void {
  if (data.bucket === 'B') {
    iframeBucketBTools = iframeBucketBTools.filter((t) => t !== data.name);
    updateIframeUnregisterButton(iframeBucketBTools.length > 0);
  }
  iframeEventLog.log('info', `Iframe unregistered: ${data.name} (Bucket ${data.bucket})`);
  sendIframeCommand('get-tools');
}

/**
 * Handle iframe context cleared event
 */
function handleIframeContextCleared(): void {
  iframeEventLog.log('info', 'Iframe context cleared (Bucket A removed)');
  sendIframeCommand('get-tools');
}

/**
 * Handle iframe tools list response
 */
function handleIframeToolsList(data: { tools: string[] }): void {
  iframeTools = data.tools;
  updateIframeToolsDisplay();
  updateContextComparison();
}

/**
 * Update iframe status indicator
 */
function updateIframeStatusIndicator(ready: boolean): void {
  const indicator = document.getElementById('iframe-status-indicator');
  if (!indicator) return;

  if (ready) {
    indicator.innerHTML = `
      <div class="h-2 w-2 rounded-full bg-green-500"></div>
      <span>Connected</span>
    `;
  } else {
    indicator.innerHTML = `
      <div class="h-2 w-2 animate-pulse rounded-full bg-yellow-500"></div>
      <span>Loading...</span>
    `;
  }
}

/**
 * Update iframe unregister button state
 */
function updateIframeUnregisterButton(enabled: boolean): void {
  const btn = document.getElementById('iframe-child-unregister-b') as HTMLButtonElement;
  if (btn) {
    btn.disabled = !enabled;
  }
}

/**
 * Update iframe tools display
 */
function updateIframeToolsDisplay(): void {
  const childToolsDiv = document.getElementById('iframe-child-tools');
  if (childToolsDiv) {
    if (iframeTools.length === 0) {
      childToolsDiv.innerHTML = '<span class="text-muted-foreground">No tools</span>';
    } else {
      childToolsDiv.innerHTML = iframeTools
        .map(
          (t) =>
            `<div class="flex items-center gap-2 py-0.5">
              <div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
              <span>${t}</span>
            </div>`
        )
        .join('');
    }
  }
}

/**
 * Update parent tools display (for iframe section)
 */
function updateParentToolsDisplay(): void {
  const parentToolsDiv = document.getElementById('iframe-parent-tools');
  const parentTools = modelContext.listTools().map((t) => t.name);

  if (parentToolsDiv) {
    if (parentTools.length === 0) {
      parentToolsDiv.innerHTML = '<span class="text-muted-foreground">No tools</span>';
    } else {
      parentToolsDiv.innerHTML = parentTools
        .map(
          (t) =>
            `<div class="flex items-center gap-2 py-0.5">
              <div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
              <span>${t}</span>
            </div>`
        )
        .join('');
    }
  }

  updateContextComparison();
}

/**
 * Update context comparison display
 */
function updateContextComparison(): void {
  const parentTools = new Set(modelContext.listTools().map((t) => t.name));
  const childTools = new Set(iframeTools);

  // Parent only tools
  const parentOnly = [...parentTools].filter((t) => !childTools.has(t));
  // Iframe only tools
  const childOnly = [...childTools].filter((t) => !parentTools.has(t));
  // Shared tools
  const shared = [...parentTools].filter((t) => childTools.has(t));

  const parentOnlyDiv = document.getElementById('iframe-compare-parent');
  const childOnlyDiv = document.getElementById('iframe-compare-child');
  const sharedDiv = document.getElementById('iframe-compare-shared');

  if (parentOnlyDiv) {
    parentOnlyDiv.textContent = parentOnly.length > 0 ? parentOnly.join(', ') : '-';
  }
  if (childOnlyDiv) {
    childOnlyDiv.textContent = childOnly.length > 0 ? childOnly.join(', ') : '-';
  }
  if (sharedDiv) {
    sharedDiv.textContent = shared.length > 0 ? shared.join(', ') : '-';
  }
}

/**
 * Reload the iframe
 */
function reloadIframe(): void {
  const iframe = document.getElementById('test-iframe') as HTMLIFrameElement;
  if (iframe) {
    iframeReady = false;
    iframeTools = [];
    iframeBucketBTools = [];
    updateIframeStatusIndicator(false);
    updateIframeToolsDisplay();
    updateContextComparison();

    // Store and reassign to trigger reload
    const currentSrc = iframe.src;
    iframe.src = '';
    iframe.src = currentSrc;
    iframeEventLog.log('info', 'Iframe reloaded');
  }
}

// ==================== Parent Context for Iframe Demo ====================

/**
 * Register a tool in parent context via provideContext (Bucket A)
 */
function iframeParentRegisterBucketA(): void {
  const tool: Tool = {
    name: 'parent_greet',
    description: 'Greeting tool registered in parent via provideContext (Bucket A)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' },
      },
      required: ['name'],
    },
    async execute(input) {
      return `[Parent Greet]: Hello, ${input.name}!`;
    },
  };

  modelContext.provideContext({ tools: [tool] });

  iframeEventLog.log('success', 'Parent: Registered parent_greet via provideContext (Bucket A)');
  eventLog.info('Iframe Demo', 'Registered parent_greet in parent context (Bucket A)');
  updateParentToolsDisplay();
}

/**
 * Register a tool in parent context via registerTool (Bucket B)
 */
function iframeParentRegisterBucketB(): void {
  if (iframeBucketBRegistrations.has('parent_time')) {
    iframeEventLog.log('warning', 'Parent: parent_time already registered');
    return;
  }

  const tool: Tool = {
    name: 'parent_time',
    description: 'Time tool registered in parent via registerTool (Bucket B)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async execute() {
      return `[Parent Time]: ${new Date().toLocaleTimeString()}`;
    },
  };

  const registration = modelContext.registerTool(tool);
  iframeBucketBRegistrations.set('parent_time', registration);

  const btn = document.getElementById('iframe-parent-unregister-b') as HTMLButtonElement;
  if (btn) {
    btn.disabled = false;
  }

  iframeEventLog.log('success', 'Parent: Registered parent_time via registerTool (Bucket B)');
  eventLog.info('Iframe Demo', 'Registered parent_time in parent context (Bucket B)');
  updateParentToolsDisplay();
}

/**
 * Unregister parent Bucket B tool
 */
function iframeParentUnregisterBucketB(): void {
  const registration = iframeBucketBRegistrations.get('parent_time');
  if (registration) {
    registration.unregister();
    iframeBucketBRegistrations.delete('parent_time');

    const btn = document.getElementById('iframe-parent-unregister-b') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
    }

    iframeEventLog.log('info', 'Parent: Unregistered parent_time (Bucket B)');
    eventLog.info('Iframe Demo', 'Unregistered parent_time from parent context');
    updateParentToolsDisplay();
  }
}

/**
 * Clear parent context
 */
function iframeParentClearContext(): void {
  modelContext.clearContext();

  iframeEventLog.log('info', 'Parent: Context cleared (Bucket A removed)');
  eventLog.info('Iframe Demo', 'Parent context cleared');
  updateParentToolsDisplay();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
