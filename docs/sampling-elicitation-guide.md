# Sampling & Elicitation Guide

This guide covers how to use the sampling and elicitation APIs in the Web Model Context API polyfill. These features allow your webpage (the MCP server) to request LLM completions and user input from connected MCP clients.

## Overview

In the Model Context Protocol (MCP), sampling and elicitation are **server-to-client** requests:

- **Sampling**: The server (your webpage) requests an LLM completion from the connected client (AI agent)
- **Elicitation**: The server requests user input from the client, either via a form or URL redirect

```
┌─────────────────┐                    ┌─────────────────┐
│   Your Webpage  │  ──── request ───► │   MCP Client    │
│   (MCP Server)  │  ◄─── response ─── │   (AI Agent)    │
└─────────────────┘                    └─────────────────┘
```

## Installation

```bash
# Install the polyfill
npm install @mcp-b/global

# For React applications
npm install @mcp-b/react-webmcp
```

---

## Sampling API

Sampling allows your webpage to request LLM completions from the connected client.

### Basic Usage (Vanilla JS)

```typescript
// First, ensure the polyfill is loaded
import '@mcp-b/global';

// Request an LLM completion
async function askAI(question: string) {
  try {
    const result = await navigator.modelContext.createMessage({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: question }
        }
      ],
      maxTokens: 500,
    });

    console.log('AI Response:', result.content);
    return result;
  } catch (error) {
    console.error('Sampling failed:', error);
    throw error;
  }
}

// Usage
const response = await askAI('Summarize this page content');
```

### Full Sampling Parameters

```typescript
const result = await navigator.modelContext.createMessage({
  // Required: Messages to send to the LLM
  messages: [
    {
      role: 'user',
      content: { type: 'text', text: 'Hello!' }
    },
    {
      role: 'assistant',
      content: { type: 'text', text: 'Hi there! How can I help?' }
    },
    {
      role: 'user',
      content: { type: 'text', text: 'What is the capital of France?' }
    }
  ],

  // Required: Maximum tokens to generate
  maxTokens: 1000,

  // Optional: System prompt
  systemPrompt: 'You are a helpful geography assistant.',

  // Optional: Temperature (0-1, lower = more deterministic)
  temperature: 0.7,

  // Optional: Stop sequences
  stopSequences: ['\n\n', 'END'],

  // Optional: Model preferences
  modelPreferences: {
    hints: [{ name: 'claude-3-sonnet' }],
    costPriority: 0.3,
    speedPriority: 0.5,
    intelligencePriority: 0.8,
  },

  // Optional: Context inclusion
  includeContext: 'thisServer', // 'none' | 'thisServer' | 'allServers'

  // Optional: Custom metadata
  metadata: {
    requestId: 'req-123',
    source: 'user-question',
  },
});

// Result structure
console.log(result.model);      // e.g., 'claude-3-sonnet'
console.log(result.role);       // 'assistant'
console.log(result.content);    // { type: 'text', text: '...' }
console.log(result.stopReason); // 'endTurn' | 'stopSequence' | 'maxTokens'
```

### React Hook: useSampling

```tsx
import { useSampling } from '@mcp-b/react-webmcp';

function AIAssistant() {
  const { state, createMessage, reset } = useSampling({
    onSuccess: (result) => {
      console.log('Got response:', result);
    },
    onError: (error) => {
      console.error('Request failed:', error);
    },
  });

  const handleAsk = async () => {
    const result = await createMessage({
      messages: [
        { role: 'user', content: { type: 'text', text: 'What is 2+2?' } }
      ],
      maxTokens: 100,
    });
    console.log(result.content);
  };

  return (
    <div>
      <button onClick={handleAsk} disabled={state.isLoading}>
        {state.isLoading ? 'Thinking...' : 'Ask AI'}
      </button>

      {state.error && (
        <p className="error">Error: {state.error.message}</p>
      )}

      {state.result && (
        <div className="response">
          <p>Model: {state.result.model}</p>
          <p>Response: {JSON.stringify(state.result.content)}</p>
        </div>
      )}

      <p>Total requests: {state.requestCount}</p>

      <button onClick={reset}>Reset State</button>
    </div>
  );
}
```

### Sending Images

```typescript
const result = await navigator.modelContext.createMessage({
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image',
          data: 'base64-encoded-image-data',
          mimeType: 'image/png'
        }
      ],
    }
  ],
  maxTokens: 500,
});
```

---

## Elicitation API

Elicitation allows your webpage to request user input from the connected client. There are two modes:

1. **Form mode**: For non-sensitive data using a schema-driven form
2. **URL mode**: For sensitive data collection via a web URL (OAuth, API keys, etc.)

### Form Elicitation

```typescript
// Request user input via a form
const result = await navigator.modelContext.elicitInput({
  // Optional: defaults to 'form'
  mode: 'form',

  // Message shown to the user
  message: 'Please provide your configuration settings',

  // JSON Schema for the form fields
  requestedSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        title: 'Username',
        description: 'Your preferred username',
        minLength: 3,
        maxLength: 20,
      },
      theme: {
        type: 'string',
        title: 'Theme',
        enum: ['light', 'dark', 'system'],
        enumNames: ['Light Mode', 'Dark Mode', 'System Default'],
        default: 'system',
      },
      notifications: {
        type: 'boolean',
        title: 'Enable Notifications',
        default: true,
      },
      itemCount: {
        type: 'integer',
        title: 'Items per Page',
        minimum: 10,
        maximum: 100,
        default: 25,
      },
    },
    required: ['username'],
  },
});

// Handle the response
switch (result.action) {
  case 'accept':
    console.log('User submitted:', result.content);
    // result.content = { username: 'john', theme: 'dark', ... }
    break;
  case 'decline':
    console.log('User declined to provide input');
    break;
  case 'cancel':
    console.log('User cancelled the request');
    break;
}
```

### URL Elicitation (OAuth, API Keys)

For sensitive data that shouldn't be transmitted through the MCP protocol, use URL elicitation:

```typescript
// Request user to complete OAuth flow
const result = await navigator.modelContext.elicitInput({
  mode: 'url',
  message: 'Please authenticate with GitHub to continue',
  elicitationId: 'github-oauth-' + Date.now(),
  url: 'https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=repo',
});

if (result.action === 'accept') {
  console.log('User completed authentication');
  // Your server should have received the OAuth callback
} else {
  console.log('User did not complete authentication');
}
```

### React Hook: useElicitation

```tsx
import { useElicitation } from '@mcp-b/react-webmcp';

function SettingsForm() {
  const { state, elicitInput, reset } = useElicitation({
    onSuccess: (result) => {
      if (result.action === 'accept') {
        saveSettings(result.content);
      }
    },
    onError: (error) => {
      console.error('Elicitation failed:', error);
    },
  });

  const handleConfigure = async () => {
    const result = await elicitInput({
      message: 'Configure your preferences',
      requestedSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'API Key',
            description: 'Your API key for external services',
          },
          region: {
            type: 'string',
            title: 'Region',
            enum: ['us-east', 'us-west', 'eu-west', 'ap-south'],
          },
        },
        required: ['apiKey'],
      },
    });

    if (result.action === 'accept') {
      console.log('Settings saved:', result.content);
    }
  };

  return (
    <div>
      <button onClick={handleConfigure} disabled={state.isLoading}>
        {state.isLoading ? 'Waiting for input...' : 'Configure Settings'}
      </button>

      {state.error && (
        <p className="error">Error: {state.error.message}</p>
      )}

      {state.result && (
        <p>
          Last action: {state.result.action}
          {state.result.action === 'accept' && (
            <span> - Data received</span>
          )}
        </p>
      )}
    </div>
  );
}
```

### Form Field Types

The `requestedSchema` supports these field types:

```typescript
requestedSchema: {
  type: 'object',
  properties: {
    // String field
    name: {
      type: 'string',
      title: 'Name',
      description: 'Your full name',
      default: 'John Doe',
      minLength: 1,
      maxLength: 100,
    },

    // String with enum (dropdown)
    country: {
      type: 'string',
      title: 'Country',
      enum: ['us', 'uk', 'ca', 'au'],
      enumNames: ['United States', 'United Kingdom', 'Canada', 'Australia'],
    },

    // Number field
    age: {
      type: 'number',
      title: 'Age',
      minimum: 0,
      maximum: 150,
    },

    // Integer field
    quantity: {
      type: 'integer',
      title: 'Quantity',
      minimum: 1,
      maximum: 100,
      default: 1,
    },

    // Boolean field (checkbox)
    subscribe: {
      type: 'boolean',
      title: 'Subscribe to newsletter',
      default: false,
    },

    // String with format
    email: {
      type: 'string',
      title: 'Email',
      format: 'email',
    },

    website: {
      type: 'string',
      title: 'Website',
      format: 'uri',
    },
  },
  required: ['name', 'email'],
}
```

---

## Complete Example: AI-Powered Form Assistant

Here's a complete example combining tools, sampling, and elicitation:

```tsx
import '@mcp-b/global';
import { useWebMCP, useSampling, useElicitation } from '@mcp-b/react-webmcp';
import { useState } from 'react';

function AIFormAssistant() {
  const [formData, setFormData] = useState({});

  // Register tools for the AI to use
  const { isReady } = useWebMCP({
    tools: [
      {
        name: 'getFormData',
        description: 'Get the current form data',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({
          content: [{ type: 'text', text: JSON.stringify(formData) }],
        }),
      },
      {
        name: 'updateFormField',
        description: 'Update a form field value',
        inputSchema: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['field', 'value'],
        },
        execute: async ({ field, value }) => {
          setFormData(prev => ({ ...prev, [field]: value }));
          return {
            content: [{ type: 'text', text: `Updated ${field} to ${value}` }],
          };
        },
      },
    ],
  });

  // Sampling for AI assistance
  const { createMessage, state: samplingState } = useSampling();

  // Elicitation for user input
  const { elicitInput, state: elicitState } = useElicitation();

  const handleAIAssist = async () => {
    // Ask AI for help with the form
    const result = await createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Help me fill out this form. What information do you need?',
          },
        },
      ],
      maxTokens: 500,
      includeContext: 'thisServer',
    });

    console.log('AI suggestion:', result.content);
  };

  const handleCollectInfo = async () => {
    // Request additional info from user
    const result = await elicitInput({
      message: 'Please provide additional details for the form',
      requestedSchema: {
        type: 'object',
        properties: {
          fullName: { type: 'string', title: 'Full Name' },
          email: { type: 'string', title: 'Email', format: 'email' },
          phone: { type: 'string', title: 'Phone Number' },
        },
        required: ['fullName', 'email'],
      },
    });

    if (result.action === 'accept') {
      setFormData(prev => ({ ...prev, ...result.content }));
    }
  };

  return (
    <div>
      <h1>AI-Powered Form</h1>

      {!isReady && <p>Initializing...</p>}

      <div className="form-data">
        <pre>{JSON.stringify(formData, null, 2)}</pre>
      </div>

      <div className="actions">
        <button
          onClick={handleAIAssist}
          disabled={samplingState.isLoading}
        >
          {samplingState.isLoading ? 'AI Thinking...' : 'Get AI Help'}
        </button>

        <button
          onClick={handleCollectInfo}
          disabled={elicitState.isLoading}
        >
          {elicitState.isLoading ? 'Waiting...' : 'Add More Info'}
        </button>
      </div>

      {samplingState.result && (
        <div className="ai-response">
          <h3>AI Response:</h3>
          <p>{JSON.stringify(samplingState.result.content)}</p>
        </div>
      )}
    </div>
  );
}

export default AIFormAssistant;
```

---

## Error Handling

Both `createMessage` and `elicitInput` will throw errors if no MCP client with the required capability is connected:

```typescript
try {
  const result = await navigator.modelContext.createMessage({
    messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
    maxTokens: 100,
  });
} catch (error) {
  if (error.message.includes('no connected client')) {
    console.log('No AI client connected. Please connect an MCP client.');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

With React hooks, use the `onError` callback or check `state.error`:

```tsx
const { state, createMessage } = useSampling({
  onError: (error) => {
    if (error.message.includes('no connected client')) {
      showNotification('Please connect an AI assistant first');
    }
  },
});

// Or check state
if (state.error) {
  return <ErrorMessage error={state.error} />;
}
```

---

## Type Definitions

### Sampling Types

```typescript
interface SamplingRequestParams {
  messages: Array<{
    role: 'user' | 'assistant';
    content:
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
      | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  }>;
  maxTokens: number;
  systemPrompt?: string;
  temperature?: number;
  stopSequences?: string[];
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  includeContext?: 'none' | 'thisServer' | 'allServers';
  metadata?: Record<string, unknown>;
}

interface SamplingResult {
  model: string;
  content: { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
  role: 'user' | 'assistant';
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
}
```

### Elicitation Types

```typescript
interface ElicitationFormParams {
  mode?: 'form';
  message: string;
  requestedSchema: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'integer' | 'boolean';
      title?: string;
      description?: string;
      default?: string | number | boolean;
      minLength?: number;
      maxLength?: number;
      minimum?: number;
      maximum?: number;
      enum?: Array<string | number>;
      enumNames?: string[];
      format?: string;
    }>;
    required?: string[];
  };
}

interface ElicitationUrlParams {
  mode: 'url';
  message: string;
  elicitationId: string;
  url: string;
}

type ElicitationParams = ElicitationFormParams | ElicitationUrlParams;

interface ElicitationResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
}
```

### React Hook Types

```typescript
// useSampling
interface SamplingState {
  isLoading: boolean;
  result: SamplingResult | null;
  error: Error | null;
  requestCount: number;
}

interface UseSamplingConfig {
  onSuccess?: (result: SamplingResult) => void;
  onError?: (error: Error) => void;
}

interface UseSamplingReturn {
  state: SamplingState;
  createMessage: (params: SamplingRequestParams) => Promise<SamplingResult>;
  reset: () => void;
}

// useElicitation
interface ElicitationState {
  isLoading: boolean;
  result: ElicitationResult | null;
  error: Error | null;
  requestCount: number;
}

interface UseElicitationConfig {
  onSuccess?: (result: ElicitationResult) => void;
  onError?: (error: Error) => void;
}

interface UseElicitationReturn {
  state: ElicitationState;
  elicitInput: (params: ElicitationParams) => Promise<ElicitationResult>;
  reset: () => void;
}
```

---

## Best Practices

1. **Always handle errors**: The client may not support sampling/elicitation, or may reject requests.

2. **Use appropriate modes**: Use form elicitation for non-sensitive data, URL elicitation for OAuth/API keys.

3. **Set reasonable token limits**: Don't request more tokens than you need to avoid unnecessary costs.

4. **Provide clear messages**: When using elicitation, provide clear instructions to the user.

5. **Use the includeContext option wisely**: Only include context when the AI needs it for the request.

6. **Consider loading states**: Use the `isLoading` state to show appropriate UI feedback.

7. **Validate elicitation responses**: Even though the schema validates input, always validate on your end too.
