// Web Model Context API Test App
// Tests strict tool replacement plus MCPB extension APIs

// Import the global package to initialize document.modelContext
import '@mcp-b/global';
import type { BrowserMcpServer, PromptDescriptor, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type {
  InputSchema,
  ModelContextTesting,
  RegistrationHandle,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

const modelContext = document.modelContext as BrowserMcpServer;
const baseToolControllers: AbortController[] = [];
let baseResourceRegistrations: RegistrationHandle[] = [];
let basePromptRegistrations: RegistrationHandle[] = [];
let dynamicToolController: AbortController | null = null;

function getTestingAPI(): ModelContextTesting | undefined {
  return navigator.modelContextTesting;
}

type RegisteredToolDescriptor = ToolDescriptor & { inputSchema: InputSchema };

async function replaceOwnedTools(tools: RegisteredToolDescriptor[]): Promise<void> {
  for (const controller of baseToolControllers.splice(0)) {
    controller.abort();
  }

  for (const tool of tools) {
    const controller = new AbortController();
    baseToolControllers.push(controller);
    await modelContext.registerTool(tool, { signal: controller.signal });
  }
}

function replaceOwnedResources(resources: ResourceDescriptor[]): void {
  for (const registration of baseResourceRegistrations) {
    registration.unregister();
  }
  baseResourceRegistrations = resources.map((resource) => modelContext.registerResource(resource));
}

function replaceOwnedPrompts(prompts: PromptDescriptor[]): void {
  for (const registration of basePromptRegistrations) {
    registration.unregister();
  }
  basePromptRegistrations = prompts.map((prompt) => modelContext.registerPrompt(prompt));
}

// Counter state
let counter = 0;

const DYNAMIC_TOOL_NAME = 'dynamicTool';

// Dynamic resource registration
let dynamicResourceRegistration: { unregister: () => void } | null = null;

// Dynamic prompt registration
let dynamicPromptRegistration: { unregister: () => void } | null = null;

// App state for resources
const appConfig = {
  theme: 'dark',
  language: 'en',
  version: '1.0.0',
};

// DOM Elements
const apiStatusEl = requireElement<HTMLDivElement>('api-status');
const counterDisplayEl = requireElement<HTMLDivElement>('counter-display');
const logEl = requireElement<HTMLDivElement>('log');
const dynamicStatusEl = requireElement<HTMLDivElement>('dynamic-status');

const incrementBtn = requireElement<HTMLButtonElement>('increment');
const decrementBtn = requireElement<HTMLButtonElement>('decrement');
const resetBtn = requireElement<HTMLButtonElement>('reset');
const getCounterBtn = requireElement<HTMLButtonElement>('get-counter');

const registerDynamicBtn = requireElement<HTMLButtonElement>('register-dynamic');
const unregisterDynamicBtn = requireElement<HTMLButtonElement>('unregister-dynamic');
const callDynamicBtn = requireElement<HTMLButtonElement>('call-dynamic');

const replaceBaseToolsBtn = requireElement<HTMLButtonElement>('replace-base-tools');
const listAllToolsBtn = requireElement<HTMLButtonElement>('list-all-tools');
const clearLogBtn = requireElement<HTMLButtonElement>('clear-log');

const testingApiStatusEl = requireElement<HTMLDivElement>('testing-api-status');
const checkTestingApiBtn = requireElement<HTMLButtonElement>('check-testing-api');

// Resource DOM elements
const resourcesStatusEl = requireElement<HTMLDivElement>('resources-status');
const registerBaseResourcesBtn = requireElement<HTMLButtonElement>('register-base-resources');
const registerDynamicResourceBtn = requireElement<HTMLButtonElement>('register-dynamic-resource');
const unregisterDynamicResourceBtn = requireElement<HTMLButtonElement>(
  'unregister-dynamic-resource'
);

// Prompt DOM elements
const promptsStatusEl = requireElement<HTMLDivElement>('prompts-status');
const registerBasePromptsBtn = requireElement<HTMLButtonElement>('register-base-prompts');
const registerDynamicPromptBtn = requireElement<HTMLButtonElement>('register-dynamic-prompt');
const unregisterDynamicPromptBtn = requireElement<HTMLButtonElement>('unregister-dynamic-prompt');

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

function hasRegisteredTool(name: string): boolean {
  return modelContext.listTools().some((tool) => tool.name === name);
}

// Check if API is available
function checkAPIAvailability() {
  if ('modelContext' in document) {
    apiStatusEl.textContent = 'API: Ready ✅';
    apiStatusEl.className = 'status connected';
    apiStatusEl.setAttribute('data-status', 'ready');
    log('document.modelContext API is available', 'success');
    return true;
  }
  apiStatusEl.textContent = 'API: Not Available ❌';
  apiStatusEl.className = 'status disconnected';
  apiStatusEl.setAttribute('data-status', 'unavailable');
  log('document.modelContext API is NOT available', 'error');
  return false;
}

// Register base tools using AbortSignal-scoped registerTool calls.
async function registerBaseTools() {
  try {
    log('Registering base tools via registerTool()...');

    await replaceOwnedTools([
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
    ]);

    log('Base tools registered successfully (Bucket A)', 'success');
  } catch (error) {
    log(`Failed to register base tools: ${error}`, 'error');
    console.error(error);
  }
}

// Register a dynamic tool (Bucket B) using registerTool
async function registerDynamicTool() {
  try {
    if (hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
      log('Dynamic tool already registered', 'error');
      return;
    }

    log('Registering dynamic tool via registerTool()...');

    dynamicToolController = new AbortController();
    await modelContext.registerTool(
      {
        name: DYNAMIC_TOOL_NAME,
        description: 'A dynamically registered tool',
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
                text: 'Dynamic tool executed successfully!',
              },
            ],
          };
        },
      },
      { signal: dynamicToolController.signal }
    );

    log('Dynamic tool registered successfully', 'success');
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
    if (!hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
      log('No dynamic tool to unregister', 'error');
      return;
    }

    log('Unregistering dynamic tool...');
    dynamicToolController?.abort();
    dynamicToolController = null;

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
  if (!hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
    log('Dynamic tool is not registered', 'error');
    return;
  }

  log('Dynamic tool would be called by MCP client', 'info');
  log('In a real scenario, an MCP client would call this tool', 'info');
}

// Replace base tools to test two-bucket system
async function replaceBaseTools() {
  try {
    log('Replacing base tools with new set (Bucket A should be replaced)...');

    await replaceOwnedTools([
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
    ]);

    log('Base tools replaced! Old tools (increment, decrement, etc.) are gone.', 'success');
    if (hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
      log('Dynamic tool still registered after base tool replacement', 'info');
    } else {
      log('Dynamic tool cleared by AbortSignal cleanup', 'info');
      dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
      dynamicStatusEl.style.background = '#f5f5f5';
      registerDynamicBtn.disabled = false;
      unregisterDynamicBtn.disabled = true;
      callDynamicBtn.disabled = true;
    }
  } catch (error) {
    log(`Failed to replace base tools: ${error}`, 'error');
    console.error(error);
  }
}

// List all registered tools.
function listAllTools() {
  log('Listing all registered tools...', 'info');
  const tools = modelContext.listTools();
  log(`Total tools registered: ${tools.length}`, 'info');
  for (const tool of tools) {
    log(`  - ${tool.name}: ${tool.description}`, 'info');
  }
}

// ==================== RESOURCES ====================

// Register base resources (Bucket A)
function registerBaseResources() {
  try {
    log('Registering base resources via registerResource()...', 'info');

    replaceOwnedResources([
      {
        uri: 'config://app-settings',
        name: 'App Settings',
        description: 'Application configuration settings',
        mimeType: 'application/json',
        async read() {
          log('Reading app settings resource', 'info');
          return {
            contents: [
              {
                uri: 'config://app-settings',
                text: JSON.stringify(appConfig, null, 2),
                mimeType: 'application/json',
              },
            ],
          };
        },
      },
      {
        uri: 'counter://value',
        name: 'Counter Value',
        description: 'Current counter value',
        mimeType: 'text/plain',
        async read() {
          log('Reading counter value resource', 'info');
          return {
            contents: [
              {
                uri: 'counter://value',
                text: `Counter: ${counter}`,
                mimeType: 'text/plain',
              },
            ],
          };
        },
      },
    ]);

    log('Base resources registered successfully (Bucket A)', 'success');
    if (resourcesStatusEl) {
      resourcesStatusEl.textContent = 'Resources: Base registered (Bucket A) ✅';
      resourcesStatusEl.style.background = '#d4edda';
      resourcesStatusEl.setAttribute('data-resources', 'base-registered');
    }
  } catch (error) {
    log(`Failed to register base resources: ${error}`, 'error');
    console.error(error);
  }
}

// Register dynamic resource (Bucket B)
function registerDynamicResource() {
  try {
    if (dynamicResourceRegistration) {
      log('Dynamic resource already registered', 'error');
      return;
    }

    log('Registering dynamic resource via registerResource()...', 'info');

    dynamicResourceRegistration = modelContext.registerResource({
      uri: 'dynamic://status',
      name: 'Dynamic Status',
      description: 'A dynamically registered resource',
      mimeType: 'application/json',
      async read() {
        log('Reading dynamic status resource', 'info');
        return {
          contents: [
            {
              uri: 'dynamic://status',
              text: JSON.stringify({
                status: 'active',
                timestamp: new Date().toISOString(),
                counter,
              }),
              mimeType: 'application/json',
            },
          ],
        };
      },
    });

    log('Dynamic resource registered successfully (Bucket B)', 'success');
    if (resourcesStatusEl) {
      resourcesStatusEl.textContent = 'Resources: Dynamic registered (Bucket B) ✅';
      resourcesStatusEl.style.background = '#d4edda';
      resourcesStatusEl.setAttribute('data-resources', 'dynamic-registered');
    }
    registerDynamicResourceBtn.disabled = true;
    unregisterDynamicResourceBtn.disabled = false;
  } catch (error) {
    log(`Failed to register dynamic resource: ${error}`, 'error');
    console.error(error);
  }
}

// Unregister dynamic resource
function unregisterDynamicResource() {
  try {
    if (!dynamicResourceRegistration) {
      log('No dynamic resource to unregister', 'error');
      return;
    }

    log('Unregistering dynamic resource...', 'info');
    dynamicResourceRegistration.unregister();
    dynamicResourceRegistration = null;

    log('Dynamic resource unregistered successfully', 'success');
    if (resourcesStatusEl) {
      resourcesStatusEl.textContent = 'Resources: Dynamic unregistered';
      resourcesStatusEl.style.background = '#f5f5f5';
      resourcesStatusEl.setAttribute('data-resources', 'dynamic-unregistered');
    }
    registerDynamicResourceBtn.disabled = false;
    unregisterDynamicResourceBtn.disabled = true;
  } catch (error) {
    log(`Failed to unregister dynamic resource: ${error}`, 'error');
    console.error(error);
  }
}

// ==================== PROMPTS ====================

// Register base prompts (Bucket A)
function registerBasePrompts() {
  try {
    log('Registering base prompts via registerPrompt()...', 'info');

    replaceOwnedPrompts([
      {
        name: 'greeting',
        description: 'A simple greeting prompt',
        async get() {
          log('Getting greeting prompt', 'info');
          return {
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: 'Hello! How can you help me today?' },
              },
            ],
          };
        },
      },
      {
        name: 'code-review',
        description: 'Review code for best practices',
        argsSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The code to review' },
            language: { type: 'string', description: 'Programming language' },
          },
          required: ['code'],
        },
        async get(args: Record<string, string>) {
          log(`Getting code-review prompt with args: ${JSON.stringify(args)}`, 'info');
          const code = args.code;
          const language = args.language || 'unknown';
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please review this ${language} code for best practices:\n\n\`\`\`${language}\n${code}\n\`\`\``,
                },
              },
            ],
          };
        },
      },
    ]);

    log('Base prompts registered successfully (Bucket A)', 'success');
    if (promptsStatusEl) {
      promptsStatusEl.textContent = 'Prompts: Base registered (Bucket A) ✅';
      promptsStatusEl.style.background = '#d4edda';
      promptsStatusEl.setAttribute('data-prompts', 'base-registered');
    }
  } catch (error) {
    log(`Failed to register base prompts: ${error}`, 'error');
    console.error(error);
  }
}

// Register dynamic prompt (Bucket B)
function registerDynamicPrompt() {
  try {
    if (dynamicPromptRegistration) {
      log('Dynamic prompt already registered', 'error');
      return;
    }

    log('Registering dynamic prompt via registerPrompt()...', 'info');

    dynamicPromptRegistration = modelContext.registerPrompt({
      name: 'dynamic-summary',
      description: 'A dynamically registered prompt for summarization',
      argsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
        },
        required: ['text'],
      },
      async get(args: Record<string, string>) {
        log(`Getting dynamic-summary prompt with args: ${JSON.stringify(args)}`, 'info');
        const text = args.text;
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please summarize the following text:\n\n${text}`,
              },
            },
          ],
        };
      },
    });

    log('Dynamic prompt registered successfully (Bucket B)', 'success');
    if (promptsStatusEl) {
      promptsStatusEl.textContent = 'Prompts: Dynamic registered (Bucket B) ✅';
      promptsStatusEl.style.background = '#d4edda';
      promptsStatusEl.setAttribute('data-prompts', 'dynamic-registered');
    }
    registerDynamicPromptBtn.disabled = true;
    unregisterDynamicPromptBtn.disabled = false;
  } catch (error) {
    log(`Failed to register dynamic prompt: ${error}`, 'error');
    console.error(error);
  }
}

// Unregister dynamic prompt
function unregisterDynamicPrompt() {
  try {
    if (!dynamicPromptRegistration) {
      log('No dynamic prompt to unregister', 'error');
      return;
    }

    log('Unregistering dynamic prompt...', 'info');
    dynamicPromptRegistration.unregister();
    dynamicPromptRegistration = null;

    log('Dynamic prompt unregistered successfully', 'success');
    if (promptsStatusEl) {
      promptsStatusEl.textContent = 'Prompts: Dynamic unregistered';
      promptsStatusEl.style.background = '#f5f5f5';
      promptsStatusEl.setAttribute('data-prompts', 'dynamic-unregistered');
    }
    registerDynamicPromptBtn.disabled = false;
    unregisterDynamicPromptBtn.disabled = true;
  } catch (error) {
    log(`Failed to unregister dynamic prompt: ${error}`, 'error');
    console.error(error);
  }
}

// Check if modelContextTesting API is available
function checkTestingAPI() {
  if (testingApiStatusEl) {
    if ('modelContextTesting' in navigator) {
      const testingAPI = getTestingAPI();
      const isNative =
        testingAPI && !testingAPI.constructor.name.includes('WebModelContextTesting');

      testingApiStatusEl.textContent = `Testing API: Available ✅ (${isNative ? 'Native' : 'Polyfill'})`;
      testingApiStatusEl.style.background = '#d4edda';
      testingApiStatusEl.setAttribute('data-testing-api', 'available');
      testingApiStatusEl.setAttribute('data-testing-api-type', isNative ? 'native' : 'polyfill');

      log(
        `navigator.modelContextTesting is available (${isNative ? 'Native' : 'Polyfill'})`,
        'success'
      );

      const methods = ['listTools', 'executeTool', 'addEventListener'];
      log(`Available methods: ${methods.join(', ')}`, 'info');
    } else {
      testingApiStatusEl.textContent = 'Testing API: Not Available ❌';
      testingApiStatusEl.style.background = '#f8d7da';
      testingApiStatusEl.setAttribute('data-testing-api', 'unavailable');
      log('navigator.modelContextTesting is NOT available', 'error');
    }
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

// Resource event listeners
registerBaseResourcesBtn.addEventListener('click', registerBaseResources);
registerDynamicResourceBtn.addEventListener('click', registerDynamicResource);
unregisterDynamicResourceBtn.addEventListener('click', unregisterDynamicResource);

// Prompt event listeners
registerBasePromptsBtn.addEventListener('click', registerBasePrompts);
registerDynamicPromptBtn.addEventListener('click', registerDynamicPrompt);
unregisterDynamicPromptBtn.addEventListener('click', unregisterDynamicPrompt);

// Historical MCP-B compatibility event listeners
const chromiumButtons = {
  unregisterTool: document.getElementById('chromium-unregister-tool'),
  clearContext: document.getElementById('chromium-clear-context'),
  executeTool: document.getElementById('chromium-execute-tool'),
  listTools: document.getElementById('chromium-list-tools'),
  callbackRegister: document.getElementById('chromium-test-callback-register'),
  callbackUnregister: document.getElementById('chromium-test-callback-unregister'),
  callbackProvide: document.getElementById('chromium-test-callback-provide'),
  callbackClear: document.getElementById('chromium-test-callback-clear'),
};

if (chromiumButtons.unregisterTool) {
  chromiumButtons.unregisterTool.addEventListener('click', testChromiumUnregisterTool);
}
if (chromiumButtons.clearContext) {
  chromiumButtons.clearContext.addEventListener('click', testChromiumClearContext);
}
if (chromiumButtons.executeTool) {
  chromiumButtons.executeTool.addEventListener('click', testChromiumExecuteTool);
}
if (chromiumButtons.listTools) {
  chromiumButtons.listTools.addEventListener('click', testChromiumListTools);
}
if (chromiumButtons.callbackRegister) {
  chromiumButtons.callbackRegister.addEventListener('click', testChromiumCallbackRegister);
}
if (chromiumButtons.callbackUnregister) {
  chromiumButtons.callbackUnregister.addEventListener('click', testChromiumCallbackUnregister);
}
if (chromiumButtons.callbackProvide) {
  chromiumButtons.callbackProvide.addEventListener('click', testChromiumCallbackProvide);
}
if (chromiumButtons.callbackClear) {
  chromiumButtons.callbackClear.addEventListener('click', testChromiumCallbackClear);
}

// Initialize
updateCounterDisplay();
log('Application initialized');

if (checkAPIAvailability()) {
  void registerBaseTools().then(() => {
    log('✅ Test app ready! Use buttons to test two-bucket system.', 'success');
  });
}

// Historical MCP-B compatibility test functions

// Test compatibility removal
function testChromiumUnregisterTool() {
  try {
    log('Testing MCP-B compatibility removal...', 'info');

    if (!hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
      log('No dynamic tool registered. Register one first.', 'error');
      return;
    }

    const toolName = DYNAMIC_TOOL_NAME;
    dynamicToolController?.abort();
    dynamicToolController = null;

    dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
    dynamicStatusEl.style.background = '#f5f5f5';
    registerDynamicBtn.disabled = false;
    unregisterDynamicBtn.disabled = true;
    callDynamicBtn.disabled = true;

    log(`Tool unregistered via AbortSignal cleanup: ${toolName}`, 'success');
  } catch (error) {
    log(`AbortSignal cleanup failed: ${error}`, 'error');
  }
}

// Test AbortSignal cleanup.
function testChromiumClearContext() {
  try {
    log('Testing AbortSignal cleanup...', 'info');

    for (const controller of baseToolControllers.splice(0)) {
      controller.abort();
    }
    if (dynamicToolController) {
      dynamicToolController.abort();
      dynamicToolController = null;
    }

    dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
    dynamicStatusEl.style.background = '#f5f5f5';
    registerDynamicBtn.disabled = false;
    unregisterDynamicBtn.disabled = true;
    callDynamicBtn.disabled = true;

    log('All tools cleared via AbortSignal cleanup', 'success');
  } catch (error) {
    log(`AbortSignal cleanup failed: ${error}`, 'error');
  }
}

// Test deprecated testing-shim execution
async function testChromiumExecuteTool() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = getTestingAPI();
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing compatibility executeTool()...', 'info');

    const tools = await modelContext.getTools();
    if (tools.length === 0) {
      log('No tools registered. Register tools first.', 'error');
      return;
    }

    const firstTool = tools[0];
    if (!firstTool) {
      log('No tool available to execute', 'error');
      return;
    }
    const inputJson = JSON.stringify({});

    log(`Calling executeTool("${firstTool.name}", "${inputJson}")`, 'info');
    const result = await testingAPI.executeTool(firstTool.name, inputJson);

    log(`executeTool() succeeded with result: ${JSON.stringify(result)}`, 'success');
  } catch (error) {
    log(`executeTool() failed: ${error}`, 'error');
  }
}

// Test deprecated testing-shim discovery
function testChromiumListTools() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = getTestingAPI();
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing compatibility listTools()...', 'info');

    const tools = testingAPI.listTools();
    log(`listTools() returned ${tools.length} tools`, 'success');

    if (tools.length > 0) {
      const firstTool = tools[0];
      if (!firstTool) {
        return;
      }
      log(`First tool: ${firstTool.name}`, 'info');
      log(`inputSchema is string: ${typeof firstTool.inputSchema === 'string'}`, 'info');

      // Verify it's valid JSON
      try {
        if (typeof firstTool.inputSchema === 'string') {
          JSON.parse(firstTool.inputSchema);
        }
        log('inputSchema is valid JSON ✅', 'success');
      } catch {
        log('inputSchema is NOT valid JSON ❌', 'error');
      }
    }
  } catch (error) {
    log(`listTools() failed: ${error}`, 'error');
  }
}

// Test toolchange on registerTool
function testChromiumCallbackRegister() {
  try {
    log('Testing toolchange on registerTool...', 'info');

    let callbackFired = false;
    modelContext.addEventListener(
      'toolchange',
      () => {
        callbackFired = true;
        log('Callback fired on registerTool!', 'success');
      },
      { once: true }
    );

    // Register a tool to trigger callback
    const controller = new AbortController();
    void modelContext.registerTool(
      {
        name: 'callbackTest1',
        description: 'Test callback',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'test' }] };
        },
      },
      { signal: controller.signal }
    );

    setTimeout(() => {
      controller.abort();
      if (callbackFired) {
        const statusEl = document.getElementById('chromium-callback-status');
        if (statusEl) statusEl.setAttribute('data-register-fired', 'true');
        log('Callback test passed ✅', 'success');
      } else {
        log('Callback did NOT fire ❌', 'error');
      }
    }, 100);
  } catch (error) {
    log(`Callback test failed: ${error}`, 'error');
  }
}

// Test toolchange on AbortSignal unregistration
function testChromiumCallbackUnregister() {
  try {
    log('Testing toolchange on AbortSignal unregistration...', 'info');

    let callbackFired = false;
    modelContext.addEventListener(
      'toolchange',
      () => {
        callbackFired = true;
        log('toolchange fired on AbortSignal cleanup!', 'success');
      },
      { once: true }
    );

    // Unregister the dynamic tool to trigger callback
    if (hasRegisteredTool(DYNAMIC_TOOL_NAME)) {
      dynamicToolController?.abort();
      dynamicToolController = null;

      setTimeout(() => {
        if (callbackFired) {
          const statusEl = document.getElementById('chromium-callback-status');
          if (statusEl) statusEl.setAttribute('data-unregister-fired', 'true');
          log('Callback test passed ✅', 'success');
        } else {
          log('Callback did NOT fire ❌', 'error');
        }
      }, 100);
    } else {
      log('No dynamic tool to unregister', 'error');
    }
  } catch (error) {
    log(`Callback test failed: ${error}`, 'error');
  }
}

// Test grouped registration toolchange.
async function testChromiumCallbackProvide() {
  try {
    log('Testing toolchange on grouped registration...', 'info');

    let callbackFired = false;
    modelContext.addEventListener(
      'toolchange',
      () => {
        callbackFired = true;
        log('Callback fired on registerTool!', 'success');
      },
      { once: true }
    );

    // Register a tool to trigger callback
    await replaceOwnedTools([
      {
        name: 'callbackTest2',
        description: 'Test callback',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: 'test' }] };
        },
      },
    ]);

    setTimeout(() => {
      if (callbackFired) {
        const statusEl = document.getElementById('chromium-callback-status');
        if (statusEl) statusEl.setAttribute('data-provide-fired', 'true');
        log('Callback test passed ✅', 'success');
      } else {
        log('Callback did NOT fire ❌', 'error');
      }
    }, 100);
  } catch (error) {
    log(`Callback test failed: ${error}`, 'error');
  }
}

// Test toolchange on bulk AbortSignal cleanup.
function testChromiumCallbackClear() {
  try {
    log('Testing toolchange on bulk AbortSignal cleanup...', 'info');

    let callbackFired = false;
    modelContext.addEventListener(
      'toolchange',
      () => {
        callbackFired = true;
        log('Callback fired on AbortSignal cleanup!', 'success');
      },
      { once: true }
    );

    // Abort base registrations to trigger callback
    for (const controller of baseToolControllers.splice(0)) {
      controller.abort();
    }

    setTimeout(() => {
      if (callbackFired) {
        const statusEl = document.getElementById('chromium-callback-status');
        if (statusEl) statusEl.setAttribute('data-clear-fired', 'true');
        log('Callback test passed ✅', 'success');
      } else {
        log('Callback did NOT fire ❌', 'error');
      }
    }, 100);
  } catch (error) {
    log(`Callback test failed: ${error}`, 'error');
  }
}

// ==================== NOTIFICATION BATCHING TESTS ====================

/**
 * Tests for microtask-based notification batching.
 * These tests verify that rapid tool registrations
 * are coalesced into a single notification.
 */

// Notification tracking state
let toolNotificationCount = 0;

function listenForToolChanges(listener: () => void): () => void {
  modelContext.addEventListener('toolchange', listener);
  return () => modelContext.removeEventListener('toolchange', listener);
}

function registerTemporaryTool(name: string, text: string): AbortController {
  const controller = new AbortController();
  void modelContext.registerTool(
    {
      name,
      description: `Temporary notification test tool: ${name}`,
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text }] };
      },
    },
    { signal: controller.signal }
  );
  return controller;
}

// Test: Register N tools rapidly (synchronously) and count notifications
function testRapidToolRegistration(count: number): Promise<{
  registeredCount: number;
  notificationCount: number;
}> {
  return new Promise((resolve) => {
    log(`Testing rapid registration of ${count} tools...`, 'info');

    toolNotificationCount = 0;
    const stopListening = listenForToolChanges(() => toolNotificationCount++);

    // Register N tools synchronously (should batch into 1 notification)
    const registrations: AbortController[] = [];
    for (let i = 0; i < count; i++) {
      registrations.push(registerTemporaryTool(`batchTestTool_${i}`, `Tool ${i} executed`));
    }

    log(`Registered ${registrations.length} tools synchronously`, 'info');

    setTimeout(() => {
      stopListening();

      const result = {
        registeredCount: registrations.length,
        notificationCount: toolNotificationCount,
      };

      log(
        `Result: ${result.registeredCount} tools registered, ${result.notificationCount} notification(s) sent`,
        result.notificationCount <= 1 ? 'success' : 'error'
      );

      registrations.forEach((controller) => controller.abort());

      resolve(result);
    }, 50);
  });
}

// Test: Register tools across multiple tasks (should send multiple notifications)
function testMultiTaskToolRegistration(count: number): Promise<{
  registeredCount: number;
  notificationCount: number;
}> {
  return new Promise((resolve) => {
    log(`Testing multi-task registration of ${count} tools...`, 'info');

    toolNotificationCount = 0;
    const stopListening = listenForToolChanges(() => toolNotificationCount++);
    const registrations: AbortController[] = [];
    let registered = 0;

    function registerNext() {
      if (registered >= count) {
        setTimeout(() => {
          stopListening();

          const result = {
            registeredCount: registrations.length,
            notificationCount: toolNotificationCount,
          };

          log(
            `Result: ${result.registeredCount} tools registered across tasks, ${result.notificationCount} notification(s) sent`,
            result.notificationCount === count ? 'success' : 'info'
          );

          registrations.forEach((controller) => controller.abort());

          resolve(result);
        }, 50);
        return;
      }

      const i = registered++;
      registrations.push(registerTemporaryTool(`multiTaskTool_${i}`, `Tool ${i} executed`));

      setTimeout(registerNext, 10);
    }

    registerNext();
  });
}

// Test: Mixed rapid and delayed registrations
function testMixedRegistrationBatching(): Promise<{
  phase1Notifications: number;
  phase2Notifications: number;
  phase3Notifications: number;
}> {
  return new Promise((resolve) => {
    log('Testing mixed registration batching...', 'info');

    let phase1Notifications = 0;
    let phase2Notifications = 0;
    let phase3Notifications = 0;
    let currentPhase = 1;

    const stopListening = listenForToolChanges(() => {
      if (currentPhase === 1) phase1Notifications++;
      else if (currentPhase === 2) phase2Notifications++;
      else if (currentPhase === 3) phase3Notifications++;
    });
    const registrations: AbortController[] = [];

    // Phase 1: Register 5 tools synchronously (should batch to 1 notification)
    for (let i = 0; i < 5; i++) {
      registrations.push(registerTemporaryTool(`mixedPhase1_${i}`, 'test'));
    }

    // After microtask, move to phase 2
    setTimeout(() => {
      currentPhase = 2;

      // Phase 2: Register 3 more tools synchronously (should batch to 1 notification)
      for (let i = 0; i < 3; i++) {
        registrations.push(registerTemporaryTool(`mixedPhase2_${i}`, 'test'));
      }

      setTimeout(() => {
        currentPhase = 3;

        // Phase 3: Register 2 more tools synchronously (should batch to 1 notification)
        for (let i = 0; i < 2; i++) {
          registrations.push(registerTemporaryTool(`mixedPhase3_${i}`, 'test'));
        }

        setTimeout(() => {
          stopListening();
          const result = {
            phase1Notifications,
            phase2Notifications,
            phase3Notifications,
          };

          log(
            `Result: Phase1=${phase1Notifications}, Phase2=${phase2Notifications}, Phase3=${phase3Notifications}`,
            phase1Notifications === 1 && phase2Notifications === 1 && phase3Notifications === 1
              ? 'success'
              : 'error'
          );

          registrations.forEach((controller) => controller.abort());

          resolve(result);
        }, 50);
      }, 50);
    }, 50);
  });
}

// Type for test API
declare global {
  interface Window {
    testApp: {
      counter: () => number;
      registerBaseTools: () => Promise<void>;
      registerDynamicTool: () => Promise<void>;
      unregisterDynamicTool: () => void;
      replaceBaseTools: () => Promise<void>;
      listAllTools: () => void;
      getAPIStatus: () => boolean;
      checkTestingAPI: () => void;
      hasTestingAPI: () => boolean;
      // Historical MCP-B compatibility tests
      testChromiumUnregisterTool: () => void;
      testChromiumClearContext: () => void;
      testChromiumExecuteTool: () => Promise<void>;
      testChromiumListTools: () => void;
      testChromiumCallbackRegister: () => void;
      testChromiumCallbackUnregister: () => void;
      testChromiumCallbackProvide: () => Promise<void>;
      testChromiumCallbackClear: () => void;
      // Resource tests
      registerBaseResources: () => void;
      registerDynamicResource: () => void;
      unregisterDynamicResource: () => void;
      // Prompt tests
      registerBasePrompts: () => void;
      registerDynamicPrompt: () => void;
      unregisterDynamicPrompt: () => void;
      // Notification batching tests
      testRapidToolRegistration: (count: number) => Promise<{
        registeredCount: number;
        notificationCount: number;
      }>;
      testMultiTaskToolRegistration: (count: number) => Promise<{
        registeredCount: number;
        notificationCount: number;
      }>;
      testMixedRegistrationBatching: () => Promise<{
        phase1Notifications: number;
        phase2Notifications: number;
        phase3Notifications: number;
      }>;
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
  getAPIStatus: () => 'modelContext' in document,
  checkTestingAPI,
  hasTestingAPI: () => 'modelContextTesting' in navigator,
  // Historical MCP-B compatibility tests
  testChromiumUnregisterTool,
  testChromiumClearContext,
  testChromiumExecuteTool,
  testChromiumListTools,
  testChromiumCallbackRegister,
  testChromiumCallbackUnregister,
  testChromiumCallbackProvide,
  testChromiumCallbackClear,
  // Resource tests
  registerBaseResources,
  registerDynamicResource,
  unregisterDynamicResource,
  // Prompt tests
  registerBasePrompts,
  registerDynamicPrompt,
  unregisterDynamicPrompt,
  // Notification batching tests
  testRapidToolRegistration,
  testMultiTaskToolRegistration,
  testMixedRegistrationBatching,
};
