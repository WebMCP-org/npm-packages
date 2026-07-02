// Interactive Quickstart Component
// A tool builder that shows code being generated in real-time with syntax highlighting

export const InteractiveQuickstart = () => {
  const { useState, useEffect, useRef } = React;
  // Simple syntax highlighter for JavaScript/TypeScript - defined inside component for Mintlify compatibility
  const highlightCode = (code) => {
    const patterns = [
      { regex: /(\/\/.*$)/gm, cls: 'text-zinc-500' },
      { regex: /(`[^`]*`|'[^']*'|"[^"]*")/g, cls: 'text-green-400' },
      {
        regex:
          /\b(import|export|from|async|await|function|const|let|var|return|if|else|try|catch|throw|new|class|extends|type|interface)\b/g,
        cls: 'text-purple-400',
      },
      {
        regex:
          /\b(navigator|window|document|console|Promise|Object|Array|String|Number|Boolean)\b/g,
        cls: 'text-yellow-400',
      },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, cls: 'text-blue-400' },
      { regex: /\b(\d+)\b/g, cls: 'text-orange-400' },
    ];

    let result = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    patterns.forEach(({ regex, cls }) => {
      result = result.replace(regex, `<span class="${cls}">$1</span>`);
    });

    return result;
  };
  const [isPolyfillLoaded, setIsPolyfillLoaded] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [registrationError, setRegistrationError] = useState(null);
  const [activeTab, setActiveTab] = useState('react');
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);
  const registrationControllerRef = useRef(null);

  // Tool configuration state
  const [toolConfig, setToolConfig] = useState({
    name: 'greet_user',
    description: 'Greets the user by name',
    parameters: [{ name: 'name', type: 'string', description: 'Name to greet', required: true }],
  });

  // Test input state
  const [testInput, setTestInput] = useState({ name: 'World' });

  // Check polyfill status
  useEffect(() => {
    const checkPolyfill = () => {
      if (window.navigator?.modelContext) {
        setIsPolyfillLoaded(true);
      }
    };
    checkPolyfill();
    window.addEventListener('webmcp-loaded', checkPolyfill);
    return () => {
      window.removeEventListener('webmcp-loaded', checkPolyfill);
      registrationControllerRef.current?.abort();
    };
  }, []);

  // Generate code for different frameworks
  const generateCode = (framework) => {
    const paramName = toolConfig.parameters[0]?.name || 'input';

    if (framework === 'react') {
      const zodSchema = toolConfig.parameters
        .map((p) => `      ${p.name}: z.${p.type}()${p.required ? '' : '.optional()'}`)
        .join(',\n');

      return `import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function MyComponent() {
  useWebMCP({
    name: '${toolConfig.name}',
    description: '${toolConfig.description}',
    inputSchema: {
${zodSchema}
    },
    handler: async ({ ${paramName} }) => {
      return \`Hello, \${${paramName}}!\`;
    }
  });

  return <div>My Component</div>;
}`;
    }

    if (framework === 'vanilla') {
      const schemaProps = toolConfig.parameters
        .map((p) => `        ${p.name}: { type: '${p.type}', description: '${p.description}' }`)
        .join(',\n');
      const required = toolConfig.parameters
        .filter((p) => p.required)
        .map((p) => `'${p.name}'`)
        .join(', ');

      return `import '@mcp-b/global';

document.modelContext.registerTool({
  name: '${toolConfig.name}',
  description: '${toolConfig.description}',
  inputSchema: {
    type: 'object',
    properties: {
${schemaProps}
    },
    required: [${required}]
  },
  execute: async ({ ${paramName} }) => {
    return {
      content: [{ type: 'text', text: \`Hello, \${${paramName}}!\` }]
    };
  }
});`;
    }

    if (framework === 'script') {
      const schemaProps = toolConfig.parameters
        .map((p) => `        ${p.name}: { type: '${p.type}', description: '${p.description}' }`)
        .join(',\n');
      const required = toolConfig.parameters
        .filter((p) => p.required)
        .map((p) => `'${p.name}'`)
        .join(', ');

      return `<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
<script>
  document.modelContext.registerTool({
    name: '${toolConfig.name}',
    description: '${toolConfig.description}',
    inputSchema: {
      type: 'object',
      properties: {
${schemaProps}
      },
      required: [${required}]
    },
    execute: async ({ ${paramName} }) => {
      return {
        content: [{ type: 'text', text: \`Hello, \${${paramName}}!\` }]
      };
    }
  });
</script>`;
    }
  };

  // Register the tool
  const registerTool = async () => {
    if (!isPolyfillLoaded) {
      setRegistrationError('WebMCP polyfill not loaded');
      return;
    }

    // Abort previous registration if it exists.
    registrationControllerRef.current?.abort();
    registrationControllerRef.current = null;

    setRegistrationError(null);
    setIsRegistered(false);
    setTestResult(null);

    try {
      const schema = {
        type: 'object',
        properties: {},
        required: [],
      };

      toolConfig.parameters.forEach((p) => {
        schema.properties[p.name] = { type: p.type, description: p.description };
        if (p.required) schema.required.push(p.name);
      });

      const controller = new AbortController();
      registrationControllerRef.current = controller;
      await document.modelContext.registerTool(
        {
          name: toolConfig.name,
          description: toolConfig.description,
          inputSchema: schema,
          execute: async (args) => {
            // Show execution modal
            setIsExecuting(true);
            setShowSuccessModal(true);

            const paramName = toolConfig.parameters[0]?.name || 'input';
            const result = `Hello, ${args[paramName] || 'friend'}!`;
            setTestResult({ success: true, result, input: args[paramName] });

            setTimeout(() => {
              setIsExecuting(false);
              setShowSuccessModal(false);
            }, 3000);

            return { content: [{ type: 'text', text: result }] };
          },
        },
        { signal: controller.signal }
      );

      setIsRegistered(true);
    } catch (error) {
      setRegistrationError(error.message);
    }
  };

  // Test the tool
  const testTool = async () => {
    if (!isRegistered) return;

    setIsExecuting(true);
    setShowSuccessModal(true);
    setTestResult(null);

    const paramName = toolConfig.parameters[0]?.name || 'input';
    const inputValue = testInput[paramName] || 'friend';
    const result = `Hello, ${inputValue}!`;

    // Simulate execution delay for effect
    setTimeout(() => {
      setTestResult({ success: true, result, input: inputValue });
    }, 500);

    setTimeout(() => {
      setIsExecuting(false);
      setShowSuccessModal(false);
    }, 2500);
  };

  // Copy code
  const copyCode = () => {
    navigator.clipboard.writeText(generateCode(activeTab));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Update parameter
  const updateParameter = (index, field, value) => {
    setToolConfig((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
    // Update test input key if name changed
    if (field === 'name') {
      const oldName = toolConfig.parameters[index].name;
      setTestInput((prev) => {
        const newInput = { ...prev };
        if (oldName in newInput) {
          newInput[value] = newInput[oldName];
          delete newInput[oldName];
        }
        return newInput;
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`not-prose rounded-xl border overflow-hidden transition-all duration-300 relative ${
        isExecuting
          ? 'border-green-500 ring-2 ring-green-500/20'
          : 'border-zinc-200 dark:border-white/10'
      }`}
    >
      {/* Execution Success Modal Overlay */}
      {showSuccessModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform animate-bounce-in text-center">
            {/* Animated checkmark */}
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  className="animate-draw-check"
                  style={{
                    strokeDasharray: 24,
                    strokeDashoffset: 24,
                    animation: 'drawCheck 0.5s ease forwards 0.2s',
                  }}
                />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Tool Executed!</h3>

            {testResult ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-left">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Input:</p>
                  <p className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
                    {toolConfig.parameters[0]?.name}: "{testResult.input}"
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 text-left">
                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">Output:</p>
                  <p className="font-mono text-sm text-green-700 dark:text-green-300">
                    {testResult.result}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Processing...
              </div>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
              This is what happens when an AI calls your tool
            </p>
          </div>
        </div>
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes drawCheck {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes bounce-in {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.5s ease;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-white/10">
        {/* Left: Form */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-zinc-900 dark:text-white">Configure Your Tool</h4>
            {isPolyfillLoaded ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                WebMCP Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Loading...
              </span>
            )}
          </div>

          {/* Tool Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tool Name
            </label>
            <input
              type="text"
              value={toolConfig.name}
              onChange={(e) =>
                setToolConfig((prev) => ({
                  ...prev,
                  name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
                }))
              }
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="my_tool"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Use snake_case (letters, numbers, underscores)
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={toolConfig.description}
              onChange={(e) => setToolConfig((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What does your tool do?"
            />
            <p className="mt-1 text-xs text-zinc-500">
              AI uses this to decide when to call your tool
            </p>
          </div>

          {/* Parameter */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Input Parameter
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={toolConfig.parameters[0]?.name || ''}
                onChange={(e) =>
                  updateParameter(0, 'name', e.target.value.replace(/[^a-z0-9_]/gi, ''))
                }
                placeholder="param_name"
                className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={toolConfig.parameters[0]?.type || 'string'}
                onChange={(e) => updateParameter(0, 'type', e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
            </div>
          </div>

          {/* Register Button */}
          <button
            onClick={registerTool}
            disabled={!isPolyfillLoaded || !toolConfig.name}
            className={`w-full py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
              isRegistered
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed'
            }`}
          >
            {isRegistered ? '✓ Tool Registered' : 'Register Tool'}
          </button>

          {registrationError && (
            <p className="text-sm text-red-600 dark:text-red-400">{registrationError}</p>
          )}

          {/* Test Section */}
          {isRegistered && (
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
              <h5 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Test Your Tool
              </h5>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={testInput[toolConfig.parameters[0]?.name] || ''}
                  onChange={(e) =>
                    setTestInput({ [toolConfig.parameters[0]?.name]: e.target.value })
                  }
                  placeholder={`Enter ${toolConfig.parameters[0]?.name || 'value'}...`}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={testTool}
                  disabled={isExecuting}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-md bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isExecuting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Running
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Execute
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Try it with AI:</strong> Open the{' '}
                  <a
                    href="https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline font-medium"
                  >
                    MCP-B extension
                  </a>{' '}
                  and ask Claude to use your{' '}
                  <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-800 font-mono">
                    {toolConfig.name}
                  </code>{' '}
                  tool.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Code Preview */}
        <div className="flex flex-col bg-zinc-900 min-h-[300px] sm:min-h-[400px]">
          {/* Tabs */}
          <div className="flex flex-col sm:flex-row border-b border-zinc-700">
            <div className="flex overflow-x-auto scrollbar-hide">
              {[
                { id: 'react', label: 'React', icon: '⚛️' },
                { id: 'vanilla', label: 'Vanilla JS', icon: '📦' },
                { id: 'script', label: 'Script Tag', icon: '🏷️' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-white bg-zinc-800 border-b-2 border-blue-500'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="hidden sm:flex flex-1" />
            <button
              onClick={copyCode}
              className={`w-full sm:w-auto px-3 py-2 sm:py-1.5 sm:m-1.5 text-xs font-medium sm:rounded transition-all flex items-center justify-center gap-1.5 border-t sm:border-t-0 border-zinc-700 ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-800 sm:bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              }`}
            >
              {copied ? (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>

          {/* Code with syntax highlighting */}
          <div className="flex-1 overflow-auto">
            <pre className="p-4 text-sm leading-relaxed font-mono">
              <code
                className="text-zinc-100"
                dangerouslySetInnerHTML={{ __html: highlightCode(generateCode(activeTab)) }}
              />
            </pre>
          </div>

          {/* Code footer */}
          <div className="px-4 py-2 border-t border-zinc-700 bg-zinc-800/50">
            <p className="text-xs text-zinc-500">
              {activeTab === 'react' && 'Requires: @mcp-b/global, @mcp-b/react-webmcp, zod'}
              {activeTab === 'vanilla' && 'Requires: @mcp-b/global (npm install)'}
              {activeTab === 'script' && 'No build tools required - just paste into HTML'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
