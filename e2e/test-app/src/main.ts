// Web Model Context API Test App
// Tests window.navigator.modelContext with two-bucket tool management

// Import the global package to initialize navigator.modelContext
import '@mcp-b/global';

// Counter state
let counter = 0;

// Dynamic tool registration
let dynamicToolRegistration: { unregister: () => void } | null = null;

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

// Resource DOM elements
const resourcesStatusEl = document.getElementById('resources-status');
const registerBaseResourcesBtn = document.getElementById(
  'register-base-resources'
) as HTMLButtonElement;
const registerDynamicResourceBtn = document.getElementById(
  'register-dynamic-resource'
) as HTMLButtonElement;
const unregisterDynamicResourceBtn = document.getElementById(
  'unregister-dynamic-resource'
) as HTMLButtonElement;
const listResourcesBtn = document.getElementById('list-resources') as HTMLButtonElement;
const listResourceTemplatesBtn = document.getElementById(
  'list-resource-templates'
) as HTMLButtonElement;
const readStaticResourceBtn = document.getElementById('read-static-resource') as HTMLButtonElement;
const readTemplateResourceBtn = document.getElementById(
  'read-template-resource'
) as HTMLButtonElement;

// Prompt DOM elements
const promptsStatusEl = document.getElementById('prompts-status');
const registerBasePromptsBtn = document.getElementById(
  'register-base-prompts'
) as HTMLButtonElement;
const registerDynamicPromptBtn = document.getElementById(
  'register-dynamic-prompt'
) as HTMLButtonElement;
const unregisterDynamicPromptBtn = document.getElementById(
  'unregister-dynamic-prompt'
) as HTMLButtonElement;
const listPromptsBtn = document.getElementById('list-prompts') as HTMLButtonElement;
const getPromptWithoutArgsBtn = document.getElementById(
  'get-prompt-without-args'
) as HTMLButtonElement;
const getPromptWithArgsBtn = document.getElementById('get-prompt-with-args') as HTMLButtonElement;

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

// ==================== RESOURCES ====================

// Register base resources (Bucket A)
function registerBaseResources() {
  try {
    log('Registering base resources via provideContext()...', 'info');

    navigator.modelContext.provideContext({
      resources: [
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
        {
          uri: 'file://{path}',
          name: 'File Reader',
          description: 'Read files from the virtual filesystem',
          mimeType: 'text/plain',
          async read(uri: URL, params?: Record<string, string>) {
            const path = params?.path ?? 'unknown';
            log(`Reading file resource: ${path}`, 'info');
            return {
              contents: [
                {
                  uri: uri.href,
                  text: `Contents of file: ${path}\nThis is mock file content for testing.`,
                  mimeType: 'text/plain',
                },
              ],
            };
          },
        },
      ],
    });

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

    dynamicResourceRegistration = navigator.modelContext.registerResource({
      uri: 'dynamic://status',
      name: 'Dynamic Status',
      description: 'A dynamically registered resource that persists across provideContext calls',
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

// List all resources
function listResources() {
  try {
    log('Listing all registered resources...', 'info');
    const resources = navigator.modelContext.listResources();
    log(`Total resources: ${resources.length}`, 'success');

    if (resourcesStatusEl) {
      resourcesStatusEl.setAttribute('data-resource-count', resources.length.toString());
    }

    resources.forEach((resource) => {
      log(`  - ${resource.uri}: ${resource.name}`, 'info');
    });
  } catch (error) {
    log(`Failed to list resources: ${error}`, 'error');
    console.error(error);
  }
}

// List resource templates
function listResourceTemplates() {
  try {
    log('Listing all resource templates...', 'info');
    const templates = navigator.modelContext.listResourceTemplates();
    log(`Total templates: ${templates.length}`, 'success');

    if (resourcesStatusEl) {
      resourcesStatusEl.setAttribute('data-template-count', templates.length.toString());
    }

    templates.forEach((template) => {
      log(`  - ${template.uriTemplate}: ${template.name}`, 'info');
    });
  } catch (error) {
    log(`Failed to list resource templates: ${error}`, 'error');
    console.error(error);
  }
}

// Read static resource
async function readStaticResource() {
  try {
    log('Reading static resource config://app-settings...', 'info');

    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          readResource: (
            uri: string
          ) => Promise<{ contents: Array<{ uri: string; text?: string }> }>;
        };
      };
    };

    if (w.__mcpBridge) {
      const result = await w.__mcpBridge.modelContext.readResource('config://app-settings');
      log('Resource read successfully:', 'success');
      if (result.contents[0]?.text) {
        log(`  Content: ${result.contents[0].text}`, 'info');
      }
      if (resourcesStatusEl) {
        resourcesStatusEl.setAttribute('data-read-static', 'success');
      }
    } else {
      log('__mcpBridge not available', 'error');
    }
  } catch (error) {
    log(`Failed to read resource: ${error}`, 'error');
    console.error(error);
  }
}

// Read template resource
async function readTemplateResource() {
  try {
    log('Reading template resource file://test.txt...', 'info');

    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          readResource: (
            uri: string
          ) => Promise<{ contents: Array<{ uri: string; text?: string }> }>;
        };
      };
    };

    if (w.__mcpBridge) {
      const result = await w.__mcpBridge.modelContext.readResource('file://test.txt');
      log('Template resource read successfully:', 'success');
      if (result.contents[0]?.text) {
        log(`  Content: ${result.contents[0].text}`, 'info');
      }
      if (resourcesStatusEl) {
        resourcesStatusEl.setAttribute('data-read-template', 'success');
      }
    } else {
      log('__mcpBridge not available', 'error');
    }
  } catch (error) {
    log(`Failed to read template resource: ${error}`, 'error');
    console.error(error);
  }
}

// ==================== PROMPTS ====================

// Register base prompts (Bucket A)
function registerBasePrompts() {
  try {
    log('Registering base prompts via provideContext()...', 'info');

    navigator.modelContext.provideContext({
      prompts: [
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
          async get(args: Record<string, unknown>) {
            log(`Getting code-review prompt with args: ${JSON.stringify(args)}`, 'info');
            const code = args.code as string;
            const language = (args.language as string) || 'unknown';
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
      ],
    });

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

    dynamicPromptRegistration = navigator.modelContext.registerPrompt({
      name: 'dynamic-summary',
      description: 'A dynamically registered prompt for summarization',
      argsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
        },
        required: ['text'],
      },
      async get(args: Record<string, unknown>) {
        log(`Getting dynamic-summary prompt with args: ${JSON.stringify(args)}`, 'info');
        const text = args.text as string;
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

// List all prompts
function listPrompts() {
  try {
    log('Listing all registered prompts...', 'info');
    const prompts = navigator.modelContext.listPrompts();
    log(`Total prompts: ${prompts.length}`, 'success');

    if (promptsStatusEl) {
      promptsStatusEl.setAttribute('data-prompt-count', prompts.length.toString());
    }

    prompts.forEach((prompt) => {
      log(`  - ${prompt.name}: ${prompt.description}`, 'info');
    });
  } catch (error) {
    log(`Failed to list prompts: ${error}`, 'error');
    console.error(error);
  }
}

// Get prompt without arguments
async function getPromptWithoutArgs() {
  try {
    log('Getting prompt without args (greeting)...', 'info');

    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          getPrompt: (
            name: string,
            args?: Record<string, unknown>
          ) => Promise<{
            messages: Array<{ role: string; content: { type: string; text: string } }>;
          }>;
        };
      };
    };

    if (w.__mcpBridge) {
      const result = await w.__mcpBridge.modelContext.getPrompt('greeting');
      log('Prompt retrieved successfully:', 'success');
      if (result.messages[0]?.content) {
        const content = result.messages[0].content;
        log(`  Message: ${content.text}`, 'info');
      }
      if (promptsStatusEl) {
        promptsStatusEl.setAttribute('data-get-prompt-no-args', 'success');
      }
    } else {
      log('__mcpBridge not available', 'error');
    }
  } catch (error) {
    log(`Failed to get prompt: ${error}`, 'error');
    console.error(error);
  }
}

// Get prompt with arguments
async function getPromptWithArgs() {
  try {
    log('Getting prompt with args (code-review)...', 'info');

    const w = window as unknown as {
      __mcpBridge?: {
        modelContext: {
          getPrompt: (
            name: string,
            args?: Record<string, unknown>
          ) => Promise<{
            messages: Array<{ role: string; content: { type: string; text: string } }>;
          }>;
        };
      };
    };

    if (w.__mcpBridge) {
      const result = await w.__mcpBridge.modelContext.getPrompt('code-review', {
        code: 'console.log("Hello World");',
        language: 'javascript',
      });
      log('Prompt with args retrieved successfully:', 'success');
      if (result.messages[0]?.content) {
        const content = result.messages[0].content;
        log(`  Message: ${content.text.substring(0, 100)}...`, 'info');
      }
      if (promptsStatusEl) {
        promptsStatusEl.setAttribute('data-get-prompt-with-args', 'success');
      }
    } else {
      log('__mcpBridge not available', 'error');
    }
  } catch (error) {
    log(`Failed to get prompt with args: ${error}`, 'error');
    console.error(error);
  }
}

// Check if modelContextTesting API is available
function checkTestingAPI() {
  if (testingApiStatusEl) {
    if ('modelContextTesting' in navigator) {
      const testingAPI = navigator.modelContextTesting;
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

      const methods = [
        'getToolCalls',
        'clearToolCalls',
        'setMockToolResponse',
        'clearMockToolResponse',
        'clearAllMockToolResponses',
        'getRegisteredTools',
        'reset',
      ];
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
      log(
        `Last call: ${lastCall.toolName} at ${new Date(lastCall.timestamp).toLocaleTimeString()}`,
        'info'
      );
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

    if (
      result.content[0].type === 'text' &&
      result.content[0].text === 'This is a MOCK response!'
    ) {
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

// Resource event listeners
registerBaseResourcesBtn.addEventListener('click', registerBaseResources);
registerDynamicResourceBtn.addEventListener('click', registerDynamicResource);
unregisterDynamicResourceBtn.addEventListener('click', unregisterDynamicResource);
listResourcesBtn.addEventListener('click', listResources);
listResourceTemplatesBtn.addEventListener('click', listResourceTemplates);
readStaticResourceBtn.addEventListener('click', readStaticResource);
readTemplateResourceBtn.addEventListener('click', readTemplateResource);

// Prompt event listeners
registerBasePromptsBtn.addEventListener('click', registerBasePrompts);
registerDynamicPromptBtn.addEventListener('click', registerDynamicPrompt);
unregisterDynamicPromptBtn.addEventListener('click', unregisterDynamicPrompt);
listPromptsBtn.addEventListener('click', listPrompts);
getPromptWithoutArgsBtn.addEventListener('click', getPromptWithoutArgs);
getPromptWithArgsBtn.addEventListener('click', getPromptWithArgs);

// Sampling & Elicitation event listeners
const samplingButtons = {
  checkSamplingApi: document.getElementById('check-sampling-api'),
  testSamplingCall: document.getElementById('test-sampling-call'),
  testElicitationCall: document.getElementById('test-elicitation-call'),
};

if (samplingButtons.checkSamplingApi) {
  samplingButtons.checkSamplingApi.addEventListener('click', checkSamplingApi);
}
if (samplingButtons.testSamplingCall) {
  samplingButtons.testSamplingCall.addEventListener('click', testSamplingCall);
}
if (samplingButtons.testElicitationCall) {
  samplingButtons.testElicitationCall.addEventListener('click', testElicitationCall);
}

// Chromium native API event listeners
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
  registerBaseTools();
  log('✅ Test app ready! Use buttons to test two-bucket system.', 'success');
}

// ==================== SAMPLING & ELICITATION ====================

const samplingStatusEl = document.getElementById('sampling-status');

// Check if sampling/elicitation API is available
function checkSamplingApi() {
  try {
    log('Checking sampling/elicitation API availability...', 'info');

    const hasCreateMessage = 'createMessage' in navigator.modelContext;
    const hasElicitInput = 'elicitInput' in navigator.modelContext;

    if (samplingStatusEl) {
      if (hasCreateMessage && hasElicitInput) {
        samplingStatusEl.textContent =
          'Sampling/Elicitation: Available ✅ (createMessage, elicitInput)';
        samplingStatusEl.style.background = '#d4edda';
        samplingStatusEl.setAttribute('data-sampling-api', 'available');
      } else {
        samplingStatusEl.textContent = `Sampling/Elicitation: Partial ⚠️ (createMessage: ${hasCreateMessage}, elicitInput: ${hasElicitInput})`;
        samplingStatusEl.style.background = '#fff3cd';
        samplingStatusEl.setAttribute('data-sampling-api', 'partial');
      }
    }

    log(`createMessage available: ${hasCreateMessage}`, hasCreateMessage ? 'success' : 'error');
    log(`elicitInput available: ${hasElicitInput}`, hasElicitInput ? 'success' : 'error');
  } catch (error) {
    log(`Failed to check sampling API: ${error}`, 'error');
  }
}

// Test createMessage call (should fail without connected client)
async function testSamplingCall() {
  try {
    log('Testing createMessage() - this should fail without a connected client...', 'info');

    const result = await navigator.modelContext.createMessage({
      messages: [{ role: 'user', content: { type: 'text', text: 'Hello, this is a test!' } }],
      maxTokens: 100,
    });

    // If we got here, a client responded (unexpected in this test environment)
    log(`createMessage() succeeded unexpectedly: ${JSON.stringify(result)}`, 'success');
    if (samplingStatusEl) {
      samplingStatusEl.setAttribute('data-sampling-call', 'success');
    }
  } catch (error) {
    // Expected behavior - no connected client with sampling capability
    log(`createMessage() threw error (expected): ${error}`, 'info');
    if (samplingStatusEl) {
      samplingStatusEl.setAttribute('data-sampling-call', 'error-no-client');
    }

    // Check if it's the expected error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Sampling is not supported') ||
      errorMessage.includes('no connected client')
    ) {
      log('✅ Correct error thrown for missing client capability', 'success');
    }
  }
}

// Test elicitInput call (should fail without connected client)
async function testElicitationCall() {
  try {
    log('Testing elicitInput() - this should fail without a connected client...', 'info');

    const result = await navigator.modelContext.elicitInput({
      message: 'Please provide your name',
      requestedSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', description: 'Your name' },
        },
        required: ['name'],
      },
    });

    // If we got here, a client responded (unexpected in this test environment)
    log(`elicitInput() succeeded unexpectedly: ${JSON.stringify(result)}`, 'success');
    if (samplingStatusEl) {
      samplingStatusEl.setAttribute('data-elicitation-call', 'success');
    }
  } catch (error) {
    // Expected behavior - no connected client with elicitation capability
    log(`elicitInput() threw error (expected): ${error}`, 'info');
    if (samplingStatusEl) {
      samplingStatusEl.setAttribute('data-elicitation-call', 'error-no-client');
    }

    // Check if it's the expected error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Elicitation is not supported') ||
      errorMessage.includes('no connected client')
    ) {
      log('✅ Correct error thrown for missing client capability', 'success');
    }
  }
}

// Chromium Native API Test Functions

// Test unregisterTool (Chromium native API)
function testChromiumUnregisterTool() {
  try {
    log('Testing unregisterTool() (Chromium native API)...', 'info');

    if (!dynamicToolRegistration) {
      log('No dynamic tool registered. Register one first.', 'error');
      return;
    }

    const toolName = 'dynamicTool';
    navigator.modelContext.unregisterTool(toolName);

    dynamicToolRegistration = null;
    dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
    dynamicStatusEl.style.background = '#f5f5f5';
    registerDynamicBtn.disabled = false;
    unregisterDynamicBtn.disabled = true;
    callDynamicBtn.disabled = true;

    log(`Tool unregistered via unregisterTool(): ${toolName}`, 'success');
  } catch (error) {
    log(`unregisterTool() failed: ${error}`, 'error');
  }
}

// Test clearContext (Chromium native API)
function testChromiumClearContext() {
  try {
    log('Testing clearContext() (Chromium native API)...', 'info');

    navigator.modelContext.clearContext();

    dynamicToolRegistration = null;
    dynamicStatusEl.textContent = 'Dynamic tool status: Not registered';
    dynamicStatusEl.style.background = '#f5f5f5';
    registerDynamicBtn.disabled = false;
    unregisterDynamicBtn.disabled = true;
    callDynamicBtn.disabled = true;

    log('All tools cleared via clearContext()', 'success');
  } catch (error) {
    log(`clearContext() failed: ${error}`, 'error');
  }
}

// Test executeTool (Chromium native API)
async function testChromiumExecuteTool() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing executeTool() (Chromium native API)...', 'info');

    const tools = navigator.modelContext.listTools();
    if (tools.length === 0) {
      log('No tools registered. Register tools first.', 'error');
      return;
    }

    const firstTool = tools[0];
    const inputJson = JSON.stringify({});

    log(`Calling executeTool("${firstTool.name}", "${inputJson}")`, 'info');
    const result = await testingAPI.executeTool(firstTool.name, inputJson);

    log(`executeTool() succeeded with result: ${JSON.stringify(result)}`, 'success');
  } catch (error) {
    log(`executeTool() failed: ${error}`, 'error');
  }
}

// Test listTools (Chromium native API)
function testChromiumListTools() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing listTools() (Chromium native API)...', 'info');

    const tools = testingAPI.listTools();
    log(`listTools() returned ${tools.length} tools`, 'success');

    if (tools.length > 0) {
      const firstTool = tools[0];
      log(`First tool: ${firstTool.name}`, 'info');
      log(`inputSchema is string: ${typeof firstTool.inputSchema === 'string'}`, 'info');

      // Verify it's valid JSON
      try {
        JSON.parse(firstTool.inputSchema);
        log('inputSchema is valid JSON ✅', 'success');
      } catch {
        log('inputSchema is NOT valid JSON ❌', 'error');
      }
    }
  } catch (error) {
    log(`listTools() failed: ${error}`, 'error');
  }
}

// Test registerToolsChangedCallback on registerTool
function testChromiumCallbackRegister() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing registerToolsChangedCallback() on registerTool...', 'info');

    let callbackFired = false;
    testingAPI.registerToolsChangedCallback(() => {
      callbackFired = true;
      log('Callback fired on registerTool!', 'success');
    });

    // Register a tool to trigger callback
    navigator.modelContext.registerTool({
      name: 'callbackTest1',
      description: 'Test callback',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'test' }] };
      },
    });

    setTimeout(() => {
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

// Test registerToolsChangedCallback on unregisterTool
function testChromiumCallbackUnregister() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing registerToolsChangedCallback() on unregisterTool...', 'info');

    let callbackFired = false;
    testingAPI.registerToolsChangedCallback(() => {
      callbackFired = true;
      log('Callback fired on unregisterTool!', 'success');
    });

    // Unregister the dynamic tool to trigger callback
    if (dynamicToolRegistration) {
      navigator.modelContext.unregisterTool('dynamicTool');
      dynamicToolRegistration = null;

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

// Test registerToolsChangedCallback on provideContext
function testChromiumCallbackProvide() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing registerToolsChangedCallback() on provideContext...', 'info');

    let callbackFired = false;
    testingAPI.registerToolsChangedCallback(() => {
      callbackFired = true;
      log('Callback fired on provideContext!', 'success');
    });

    // Call provideContext to trigger callback
    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'callbackTest2',
          description: 'Test callback',
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        },
      ],
    });

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

// Test registerToolsChangedCallback on clearContext
function testChromiumCallbackClear() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  try {
    log('Testing registerToolsChangedCallback() on clearContext...', 'info');

    let callbackFired = false;
    testingAPI.registerToolsChangedCallback(() => {
      callbackFired = true;
      log('Callback fired on clearContext!', 'success');
    });

    // Call clearContext to trigger callback
    navigator.modelContext.clearContext();

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
 * These tests verify that rapid tool/resource/prompt registrations
 * are coalesced into a single notification.
 */

// Notification tracking state
let toolNotificationCount = 0;
let resourceNotificationCount = 0;
let promptNotificationCount = 0;
let notificationTrackingEnabled = false;

// Start tracking notifications
function startNotificationTracking() {
  if (!('modelContextTesting' in navigator)) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  const testingAPI = navigator.modelContextTesting;
  if (!testingAPI) {
    log('modelContextTesting API not available', 'error');
    return;
  }

  // Reset counts
  toolNotificationCount = 0;
  resourceNotificationCount = 0;
  promptNotificationCount = 0;
  notificationTrackingEnabled = true;

  // Register callback to count tool notifications
  testingAPI.registerToolsChangedCallback(() => {
    if (notificationTrackingEnabled) {
      toolNotificationCount++;
      log(`[Notification Tracking] Tool notification #${toolNotificationCount}`, 'info');
    }
  });

  log('Notification tracking started', 'success');
}

// Stop tracking and return counts
function stopNotificationTracking(): {
  tools: number;
  resources: number;
  prompts: number;
} {
  notificationTrackingEnabled = false;
  log(
    `Notification tracking stopped. Counts: tools=${toolNotificationCount}, resources=${resourceNotificationCount}, prompts=${promptNotificationCount}`,
    'success'
  );
  return {
    tools: toolNotificationCount,
    resources: resourceNotificationCount,
    prompts: promptNotificationCount,
  };
}

// Test: Register N tools rapidly (synchronously) and count notifications
function testRapidToolRegistration(count: number): Promise<{
  registeredCount: number;
  notificationCount: number;
}> {
  return new Promise((resolve) => {
    log(`Testing rapid registration of ${count} tools...`, 'info');

    // Reset notification count
    toolNotificationCount = 0;
    notificationTrackingEnabled = true;

    // Register callback before registrations
    if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
      navigator.modelContextTesting.registerToolsChangedCallback(() => {
        if (notificationTrackingEnabled) {
          toolNotificationCount++;
        }
      });
    }

    // Register N tools synchronously (should batch into 1 notification)
    const registrations: Array<{ unregister: () => void }> = [];
    for (let i = 0; i < count; i++) {
      const reg = navigator.modelContext.registerTool({
        name: `batchTestTool_${i}`,
        description: `Batch test tool ${i}`,
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: `Tool ${i} executed` }] };
        },
      });
      registrations.push(reg);
    }

    log(`Registered ${registrations.length} tools synchronously`, 'info');

    // Wait for microtask to complete, then check notification count
    // Use setTimeout to ensure we're after the microtask queue
    setTimeout(() => {
      notificationTrackingEnabled = false;

      const result = {
        registeredCount: registrations.length,
        notificationCount: toolNotificationCount,
      };

      log(
        `Result: ${result.registeredCount} tools registered, ${result.notificationCount} notification(s) sent`,
        result.notificationCount <= 1 ? 'success' : 'error'
      );

      // Cleanup: unregister all test tools
      for (const reg of registrations) {
        reg.unregister();
      }

      resolve(result);
    }, 50); // Wait for microtask + some buffer
  });
}

// Test: Register tools across multiple tasks (should send multiple notifications)
function testMultiTaskToolRegistration(count: number): Promise<{
  registeredCount: number;
  notificationCount: number;
}> {
  return new Promise((resolve) => {
    log(`Testing multi-task registration of ${count} tools...`, 'info');

    // Reset notification count
    toolNotificationCount = 0;
    notificationTrackingEnabled = true;

    // Register callback before registrations
    if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
      navigator.modelContextTesting.registerToolsChangedCallback(() => {
        if (notificationTrackingEnabled) {
          toolNotificationCount++;
        }
      });
    }

    const registrations: Array<{ unregister: () => void }> = [];
    let registered = 0;

    // Register tools across separate tasks using setTimeout
    function registerNext() {
      if (registered >= count) {
        // All registered, wait and check
        setTimeout(() => {
          notificationTrackingEnabled = false;

          const result = {
            registeredCount: registrations.length,
            notificationCount: toolNotificationCount,
          };

          log(
            `Result: ${result.registeredCount} tools registered across tasks, ${result.notificationCount} notification(s) sent`,
            result.notificationCount === count ? 'success' : 'info'
          );

          // Cleanup
          for (const reg of registrations) {
            reg.unregister();
          }

          resolve(result);
        }, 50);
        return;
      }

      const i = registered++;
      const reg = navigator.modelContext.registerTool({
        name: `multiTaskTool_${i}`,
        description: `Multi-task test tool ${i}`,
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return { content: [{ type: 'text', text: `Tool ${i} executed` }] };
        },
      });
      registrations.push(reg);

      // Schedule next registration in a new task
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

    // Register callback
    if ('modelContextTesting' in navigator && navigator.modelContextTesting) {
      navigator.modelContextTesting.registerToolsChangedCallback(() => {
        if (currentPhase === 1) phase1Notifications++;
        else if (currentPhase === 2) phase2Notifications++;
        else if (currentPhase === 3) phase3Notifications++;
      });
    }

    const allRegistrations: Array<{ unregister: () => void }> = [];

    // Phase 1: Register 5 tools synchronously (should batch to 1 notification)
    for (let i = 0; i < 5; i++) {
      allRegistrations.push(
        navigator.modelContext.registerTool({
          name: `mixedPhase1_${i}`,
          description: `Mixed phase 1 tool ${i}`,
          inputSchema: { type: 'object', properties: {} },
          async execute() {
            return { content: [{ type: 'text', text: 'test' }] };
          },
        })
      );
    }

    // After microtask, move to phase 2
    setTimeout(() => {
      currentPhase = 2;

      // Phase 2: Register 3 more tools synchronously (should batch to 1 notification)
      for (let i = 0; i < 3; i++) {
        allRegistrations.push(
          navigator.modelContext.registerTool({
            name: `mixedPhase2_${i}`,
            description: `Mixed phase 2 tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
            async execute() {
              return { content: [{ type: 'text', text: 'test' }] };
            },
          })
        );
      }

      setTimeout(() => {
        currentPhase = 3;

        // Phase 3: Register 2 more tools synchronously (should batch to 1 notification)
        for (let i = 0; i < 2; i++) {
          allRegistrations.push(
            navigator.modelContext.registerTool({
              name: `mixedPhase3_${i}`,
              description: `Mixed phase 3 tool ${i}`,
              inputSchema: { type: 'object', properties: {} },
              async execute() {
                return { content: [{ type: 'text', text: 'test' }] };
              },
            })
          );
        }

        setTimeout(() => {
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

          // Cleanup
          for (const reg of allRegistrations) {
            reg.unregister();
          }

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
      // Chromium native API tests
      testChromiumUnregisterTool: () => void;
      testChromiumClearContext: () => void;
      testChromiumExecuteTool: () => Promise<void>;
      testChromiumListTools: () => void;
      testChromiumCallbackRegister: () => void;
      testChromiumCallbackUnregister: () => void;
      testChromiumCallbackProvide: () => void;
      testChromiumCallbackClear: () => void;
      // Resource tests
      registerBaseResources: () => void;
      registerDynamicResource: () => void;
      unregisterDynamicResource: () => void;
      listResources: () => void;
      listResourceTemplates: () => void;
      readStaticResource: () => Promise<void>;
      readTemplateResource: () => Promise<void>;
      // Prompt tests
      registerBasePrompts: () => void;
      registerDynamicPrompt: () => void;
      unregisterDynamicPrompt: () => void;
      listPrompts: () => void;
      getPromptWithoutArgs: () => Promise<void>;
      getPromptWithArgs: () => Promise<void>;
      // Sampling & Elicitation tests
      checkSamplingApi: () => void;
      testSamplingCall: () => Promise<void>;
      testElicitationCall: () => Promise<void>;
      // Notification batching tests
      startNotificationTracking: () => void;
      stopNotificationTracking: () => { tools: number; resources: number; prompts: number };
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
  getAPIStatus: () => 'modelContext' in navigator,
  checkTestingAPI,
  testToolCallTracking,
  testMockResponse,
  testReset,
  hasTestingAPI: () => 'modelContextTesting' in navigator,
  // Chromium native API tests
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
  listResources,
  listResourceTemplates,
  readStaticResource,
  readTemplateResource,
  // Prompt tests
  registerBasePrompts,
  registerDynamicPrompt,
  unregisterDynamicPrompt,
  listPrompts,
  getPromptWithoutArgs,
  getPromptWithArgs,
  // Sampling & Elicitation tests
  checkSamplingApi,
  testSamplingCall,
  testElicitationCall,
  // Notification batching tests
  startNotificationTracking,
  stopNotificationTracking,
  testRapidToolRegistration,
  testMultiTaskToolRegistration,
  testMixedRegistrationBatching,
};
