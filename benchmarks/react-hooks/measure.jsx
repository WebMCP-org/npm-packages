import React, { act, Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useWebMCP } from 'usewebmcp';
import { useWebMCP as useExtendedWebMCP } from '@mcp-b/react-webmcp';
import { useWebMCP as useGoogleWebMCP } from 'use-webmcp-tool';
import { useMcpTool, WebMCPProvider } from 'webmcp-react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const libraries = [
  { name: 'usewebmcp', hook: useWebMCP },
  { name: '@mcp-b/react-webmcp', hook: useExtendedWebMCP },
  {
    name: 'webmcp-react',
    hook: (config) => useMcpTool({ ...config, handler: config.execute }),
    provider: WebMCPProvider,
  },
  { name: 'use-webmcp-tool', hook: useGoogleWebMCP },
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function measure(library, strict, trial) {
  const context = document.modelContext;
  check(
    context && !('__isWebMCPPolyfill' in context),
    'Run the benchmark in Chrome with native WebMCP enabled'
  );
  const register = context.registerTool;
  let registrations = 0;
  const registrationPromises = [];
  let tool;
  context.registerTool = function (descriptor, options) {
    registrations += 1;
    tool = descriptor;
    const registered = register.call(this, descriptor, options);
    // Observe native completion; StrictMode deliberately aborts its first setup.
    registrationPromises.push(
      Promise.resolve(registered).catch((error) => {
        if (error.name !== 'AbortError' || !options.signal.aborted) throw error;
      })
    );
    return registered;
  };
  const root = createRoot(document.getElementById('root'));
  let commits = 0;
  let controls;
  const pending = [];
  function Probe({ revision, description }) {
    controls = library.hook({
      name: 'benchmark_tool',
      description,
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'number' } },
        required: ['value'],
      },
      annotations: { readOnlyHint: true },
      execute: ({ value }) =>
        new Promise((resolve) =>
          pending.push({
            resolve,
            result: { content: [{ type: 'text', text: String(revision + value) }] },
          })
        ),
    });
    // Inside the component: a parent Profiler can report empty bailout commits.
    return (
      <Profiler
        id="tool"
        onRender={() => {
          commits += 1;
        }}
      >
        <output>{controls.state?.isExecuting ? 'pending' : 'ready'}</output>
      </Profiler>
    );
  }
  const render = async (revision, description = 'Benchmark tool') => {
    let element = <Probe revision={revision} description={description} />;
    if (library.provider)
      element = React.createElement(library.provider, { name: 'benchmark', version: '1' }, element);
    if (strict) element = <StrictMode>{element}</StrictMode>;
    await act(async () => {
      flushSync(() => root.render(element));
      await Promise.all(registrationPromises);
    });
  };
  try {
    await render(0);
    check(
      (await context.getTools()).length === 1,
      `${library.name}: expected one registered tool; ${controls.registrationError?.message ?? JSON.stringify(controls)}`
    );
    commits = 0;
    registrations = 0;
    for (let revision = 1; revision <= 10; revision += 1) await render(revision);
    const parent = { commits, registrations };
    commits = 0;
    registrations = 0;
    for (let revision = 11; revision <= 20; revision += 1)
      await render(revision, `Revision ${revision}`);
    const metadata = { commits, registrations };
    commits = 0;
    const calls = [];
    for (let value = 0; value < 10; value += 1) {
      await act(async () => {
        calls.push(tool.execute({ value }, { signal: new AbortController().signal }));
      });
    }
    const start = commits;
    const executionState = controls.state !== undefined;
    check(pending.length === 10, 'Expected ten pending handlers');
    if (executionState) check(controls.state.isExecuting, 'Pending calls must be observable');
    commits = 0;
    for (let index = 0; index < pending.length; index += 1) {
      await act(async () => {
        pending[index].resolve(pending[index].result);
        const result = await calls[index];
        check(
          result.content[0].text === String(20 + index),
          'Handler must use the latest committed props'
        );
      });
    }
    if (executionState) {
      check(!controls.state.isExecuting, 'Settled calls must clear pending state');
      check(controls.state.executionCount === 10, 'All ten calls must succeed');
    }
    return {
      library: library.name,
      strict,
      trial,
      parent,
      metadata,
      executionState,
      start,
      settle: commits,
    };
  } finally {
    await act(async () => root.unmount());
    context.registerTool = register;
    check((await context.getTools()).length === 0, 'Unmount must remove the tool');
  }
}

window.runBenchmarks = async () => {
  const results = [];
  for (const library of libraries) {
    for (const strict of [false, true]) {
      for (let trial = 1; trial <= 5; trial += 1)
        results.push(await measure(library, strict, trial));
    }
  }
  return results;
};
