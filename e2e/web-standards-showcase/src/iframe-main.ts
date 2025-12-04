/**
 * Iframe Context Test Page
 * Handles tool registration and context management within an iframe
 */

import { detectNativeAPI } from './api/detection';
import type { ModelContext, Tool } from './types';

// State tracking
let modelContext: ModelContext;
let bucketATools: string[] = [];
const bucketBRegistrations = new Map<string, { unregister: () => void }>();

/**
 * Initialize the iframe application
 */
function init(): void {
  const detection = detectNativeAPI();
  updateBanner(detection);

  if (!detection.isNative) {
    disableControls();
    logEvent('error', 'Native API not detected');
    return;
  }

  // biome-ignore lint/style/noNonNullAssertion: Checked in detection step above
  modelContext = navigator.modelContext!;

  setupEventListeners();
  setupToolChangeListener();

  logEvent('success', 'Iframe context initialized');
  notifyParent('iframe-ready', { origin: window.location.origin });
  refreshToolDisplay();
}

/**
 * Update the status banner
 */
function updateBanner(detection: ReturnType<typeof detectNativeAPI>): void {
  const banner = document.getElementById('iframe-banner');
  const status = document.getElementById('iframe-status');

  if (!banner || !status) return;

  if (detection.isNative) {
    banner.className = 'mb-4 rounded-lg bg-green-600 px-4 py-2 text-white';
    status.innerHTML = '<span class="text-sm">Native API Ready</span>';
  } else {
    banner.className = 'mb-4 rounded-lg bg-red-600 px-4 py-2 text-white';
    status.innerHTML = '<span class="text-sm">Native API Not Available</span>';
  }
}

/**
 * Disable all controls when API is not available
 */
function disableControls(): void {
  const buttons = document.querySelectorAll('button');
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

/**
 * Setup event listeners for buttons
 */
function setupEventListeners(): void {
  document.getElementById('register-iframe-tool-a')?.addEventListener('click', registerBucketATool);
  document.getElementById('register-iframe-tool-b')?.addEventListener('click', registerBucketBTool);
  document
    .getElementById('unregister-iframe-tool-b')
    ?.addEventListener('click', unregisterBucketBTool);
  document.getElementById('clear-iframe-context')?.addEventListener('click', clearContext);

  // Listen for messages from parent
  window.addEventListener('message', handleParentMessage);
}

/**
 * Setup tool change listener
 */
function setupToolChangeListener(): void {
  modelContext.addEventListener('toolschange', () => {
    logEvent('info', 'Tools changed event');
    refreshToolDisplay();
    notifyParent('tools-changed', { tools: getToolNames() });
  });
}

/**
 * Handle messages from parent window
 */
function handleParentMessage(event: MessageEvent): void {
  const data = event.data;

  if (data?.type === 'iframe-command') {
    switch (data.command) {
      case 'register-bucket-a':
        registerBucketATool();
        break;
      case 'register-bucket-b':
        registerBucketBTool();
        break;
      case 'unregister-bucket-b':
        unregisterBucketBTool();
        break;
      case 'clear-context':
        clearContext();
        break;
      case 'get-tools':
        notifyParent('tools-list', { tools: getToolNames() });
        break;
    }
  }
}

/**
 * Send message to parent window
 */
function notifyParent(type: string, data: unknown): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: `iframe-${type}`, data }, '*');
  }
}

/**
 * Register a tool via provideContext (Bucket A)
 */
function registerBucketATool(): void {
  const tool: Tool = {
    name: 'iframe_echo',
    description: 'Echo tool registered in iframe via provideContext (Bucket A)',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo' },
      },
      required: ['message'],
    },
    async execute(input) {
      return `[Iframe Echo]: ${input.message}`;
    },
  };

  modelContext.provideContext({ tools: [tool] });
  bucketATools = ['iframe_echo'];

  logEvent('success', 'Registered iframe_echo via provideContext (Bucket A)');
  notifyParent('tool-registered', { name: 'iframe_echo', bucket: 'A' });
  refreshToolDisplay();
}

/**
 * Register a tool via registerTool (Bucket B)
 */
function registerBucketBTool(): void {
  if (bucketBRegistrations.has('iframe_timestamp')) {
    logEvent('warning', 'Tool iframe_timestamp already registered');
    return;
  }

  const tool: Tool = {
    name: 'iframe_timestamp',
    description: 'Timestamp tool registered in iframe via registerTool (Bucket B)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async execute() {
      return `[Iframe Timestamp]: ${new Date().toISOString()}`;
    },
  };

  const registration = modelContext.registerTool(tool);
  bucketBRegistrations.set('iframe_timestamp', registration);

  const unregisterBtn = document.getElementById('unregister-iframe-tool-b') as HTMLButtonElement;
  if (unregisterBtn) {
    unregisterBtn.disabled = false;
  }

  logEvent('success', 'Registered iframe_timestamp via registerTool (Bucket B)');
  notifyParent('tool-registered', { name: 'iframe_timestamp', bucket: 'B' });
  refreshToolDisplay();
}

/**
 * Unregister Bucket B tool
 */
function unregisterBucketBTool(): void {
  const registration = bucketBRegistrations.get('iframe_timestamp');
  if (registration) {
    registration.unregister();
    bucketBRegistrations.delete('iframe_timestamp');

    const unregisterBtn = document.getElementById('unregister-iframe-tool-b') as HTMLButtonElement;
    if (unregisterBtn) {
      unregisterBtn.disabled = true;
    }

    logEvent('success', 'Unregistered iframe_timestamp (Bucket B)');
    notifyParent('tool-unregistered', { name: 'iframe_timestamp', bucket: 'B' });
    refreshToolDisplay();
  }
}

/**
 * Clear context (removes Bucket A tools)
 */
function clearContext(): void {
  modelContext.clearContext();
  bucketATools = [];

  logEvent('success', 'Context cleared (Bucket A tools removed)');
  notifyParent('context-cleared', {});
  refreshToolDisplay();
}

/**
 * Get list of tool names
 */
function getToolNames(): string[] {
  return modelContext.listTools().map((t) => t.name);
}

/**
 * Refresh the tool display
 */
function refreshToolDisplay(): void {
  const tools = modelContext.listTools();

  // Update tool list
  const toolList = document.getElementById('iframe-tool-list');
  if (toolList) {
    if (tools.length === 0) {
      toolList.innerHTML = '<span class="text-muted-foreground">No tools registered</span>';
    } else {
      toolList.innerHTML = tools
        .map(
          (t) =>
            `<div class="flex items-center gap-2 py-1">
              <div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
              <span class="font-medium">${t.name}</span>
              <span class="text-muted-foreground">- ${t.description}</span>
            </div>`
        )
        .join('');
    }
  }

  // Update bucket indicators
  const bucketADiv = document.getElementById('iframe-bucket-a');
  const bucketBDiv = document.getElementById('iframe-bucket-b');

  if (bucketADiv) {
    bucketADiv.textContent = bucketATools.length > 0 ? bucketATools.join(', ') : 'Empty';
  }

  if (bucketBDiv) {
    const bucketBNames = Array.from(bucketBRegistrations.keys());
    bucketBDiv.textContent = bucketBNames.length > 0 ? bucketBNames.join(', ') : 'Empty';
  }
}

/**
 * Log an event to the iframe's event log
 */
function logEvent(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
  const log = document.getElementById('iframe-event-log');
  if (!log) return;

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

  log.insertBefore(entry, log.firstChild);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

// Expose for parent window testing
// biome-ignore lint/suspicious/noExplicitAny: Intentional window extension for testing
(window as any).iframeTestApp = {
  getTools: getToolNames,
  registerBucketA: registerBucketATool,
  registerBucketB: registerBucketBTool,
  unregisterBucketB: unregisterBucketBTool,
  clearContext,
};
