/**
 * Pre-built tool templates for the live code editor
 */

export const templates: Record<string, string> = {
  counter: `// Counter Tool
let counter = 0;

const tool = {
  name: 'counter_increment',
  description: 'Increment the counter by a specified amount',
  inputSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount to increment by'
      }
    },
    required: ['amount']
  },
  async execute(input) {
    counter += input.amount || 1;
    return {
      content: [{
        type: 'text',
        text: \`Counter incremented to: \${counter}\`
      }]
    };
  }
};

// Register the tool
navigator.modelContext.provideContext({ tools: [tool] });`,

  calculator: `// Calculator Tools
const calculatorTools = [
  {
    name: 'calc_add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    },
    async execute(input) {
      const result = input.a + input.b;
      return {
        content: [{
          type: 'text',
          text: \`\${input.a} + \${input.b} = \${result}\`
        }]
      };
    }
  },
  {
    name: 'calc_multiply',
    description: 'Multiply two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    },
    async execute(input) {
      const result = input.a * input.b;
      return {
        content: [{
          type: 'text',
          text: \`\${input.a} × \${input.b} = \${result}\`
        }]
      };
    }
  }
];

navigator.modelContext.provideContext({ tools: calculatorTools });`,

  todo: `// Todo List Manager
const todos = [];
let nextId = 1;

const todoTools = [
  {
    name: 'todo_add',
    description: 'Add a new todo item',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Todo title' },
        description: { type: 'string', description: 'Optional description' }
      },
      required: ['title']
    },
    async execute(input) {
      const todo = {
        id: nextId++,
        title: input.title,
        description: input.description || '',
        completed: false,
        createdAt: new Date().toISOString()
      };
      todos.push(todo);
      return {
        content: [{
          type: 'text',
          text: \`Added todo: \${todo.title} (ID: \${todo.id})\`
        }]
      };
    }
  },
  {
    name: 'todo_list',
    description: 'List all todos',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    async execute() {
      if (todos.length === 0) {
        return {
          content: [{ type: 'text', text: 'No todos yet!' }]
        };
      }
      const list = todos.map(t =>
        \`[\${t.completed ? '✓' : ' '}] \${t.id}. \${t.title}\`
      ).join('\\n');
      return {
        content: [{ type: 'text', text: list }]
      };
    }
  },
  {
    name: 'todo_complete',
    description: 'Mark a todo as complete',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Todo ID' }
      },
      required: ['id']
    },
    async execute(input) {
      const todo = todos.find(t => t.id === input.id);
      if (!todo) {
        return {
          content: [{ type: 'text', text: \`Todo \${input.id} not found\` }],
          isError: true
        };
      }
      todo.completed = true;
      return {
        content: [{
          type: 'text',
          text: \`Marked '\${todo.title}' as complete\`
        }]
      };
    }
  }
];

navigator.modelContext.provideContext({ tools: todoTools });`,

  timer: `// Timer Tool (demonstrates registerTool for persistent tools)
let startTime = null;
let timerRunning = false;

const timerTool = {
  name: 'timer_control',
  description: 'Control a timer (start/stop/check)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'check'],
        description: 'Timer action'
      }
    },
    required: ['action']
  },
  async execute(input) {
    switch (input.action) {
      case 'start':
        if (timerRunning) {
          return {
            content: [{ type: 'text', text: 'Timer already running!' }]
          };
        }
        startTime = Date.now();
        timerRunning = true;
        return {
          content: [{ type: 'text', text: 'Timer started!' }]
        };

      case 'stop':
        if (!timerRunning) {
          return {
            content: [{ type: 'text', text: 'Timer not running!' }]
          };
        }
        const elapsed = Date.now() - startTime;
        timerRunning = false;
        return {
          content: [{
            type: 'text',
            text: \`Timer stopped. Elapsed: \${(elapsed / 1000).toFixed(2)}s\`
          }]
        };

      case 'check':
        if (!timerRunning) {
          return {
            content: [{ type: 'text', text: 'Timer not running!' }]
          };
        }
        const current = Date.now() - startTime;
        return {
          content: [{
            type: 'text',
            text: \`Timer running: \${(current / 1000).toFixed(2)}s\`
          }]
        };

      default:
        return {
          content: [{ type: 'text', text: 'Invalid action!' }],
          isError: true
        };
    }
  }
};

// Use registerTool for persistent registration
navigator.modelContext.registerTool(timerTool);`,

  'state-machine': `// State Machine Tool
const states = ['idle', 'processing', 'completed', 'error'];
let currentState = 'idle';
const stateHistory = [{ state: 'idle', timestamp: Date.now() }];

const stateMachineTool = {
  name: 'state_machine',
  description: 'Manage a state machine',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['transition', 'get', 'history', 'reset'],
        description: 'State machine action'
      },
      targetState: {
        type: 'string',
        enum: states,
        description: 'Target state for transition'
      }
    },
    required: ['action']
  },
  async execute(input) {
    switch (input.action) {
      case 'transition':
        if (!input.targetState) {
          return {
            content: [{ type: 'text', text: 'Target state required!' }],
            isError: true
          };
        }
        if (!states.includes(input.targetState)) {
          return {
            content: [{ type: 'text', text: 'Invalid state!' }],
            isError: true
          };
        }
        const oldState = currentState;
        currentState = input.targetState;
        stateHistory.push({ state: currentState, timestamp: Date.now() });
        return {
          content: [{
            type: 'text',
            text: \`Transitioned: \${oldState} → \${currentState}\`
          }]
        };

      case 'get':
        return {
          content: [{
            type: 'text',
            text: \`Current state: \${currentState}\`
          }]
        };

      case 'history':
        const historyText = stateHistory
          .map((h, i) => \`\${i + 1}. \${h.state} (\${new Date(h.timestamp).toLocaleTimeString()})\`)
          .join('\\n');
        return {
          content: [{
            type: 'text',
            text: \`State History:\\n\${historyText}\`
          }]
        };

      case 'reset':
        currentState = 'idle';
        stateHistory.length = 0;
        stateHistory.push({ state: 'idle', timestamp: Date.now() });
        return {
          content: [{ type: 'text', text: 'State machine reset to idle' }]
        };

      default:
        return {
          content: [{ type: 'text', text: 'Invalid action!' }],
          isError: true
        };
    }
  }
};

navigator.modelContext.registerTool(stateMachineTool);`,
};
