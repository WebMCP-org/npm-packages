import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWebMCP } from 'usewebmcp';
import { useWebMCP as useExtendedWebMCP } from '@mcp-b/react-webmcp';
import { useWebMCP as useGoogleWebMCP } from 'use-webmcp-tool';
import { useMcpTool, WebMCPProvider } from 'webmcp-react';

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
const tasks = [];
const channel = new MessageChannel();
channel.port1.onmessage = () => tasks.shift()();
const nextTask = () =>
  new Promise((resolve) => {
    tasks.push(resolve);
    channel.port2.postMessage(null);
  });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const makeSchema = (fields) => ({
  type: 'object',
  properties: Object.fromEntries(
    Array.from({ length: fields }, (_, index) => [
      index === 0 ? 'value' : `field_${index}`,
      { type: 'number', description: `Numeric field ${index}` },
    ])
  ),
  required: ['value'],
});

window.runProductionCase = async ({ library: name, toolCount, fields, schemaMode }) => {
  check(import.meta.env.PROD, 'Use a production build');
  const library = libraries.find((item) => item.name === name);
  check(library, 'Unknown hook');
  const context = document.modelContext;
  check(context && !('__isWebMCPPolyfill' in context), 'Native WebMCP is required');
  check((await context.getTools()).length === 0, 'Registry must start empty');
  const originalRegister = context.registerTool;
  const tools = new Map();
  const pending = new Set();
  const active = new Set();
  const failures = [];
  let registrations = 0;
  let abortedRegistrations = 0;
  let renders = 0;
  let passiveRenders = 0;
  let version = 0;
  let lastRender = 0;
  let lastEffect = 0;
  let lastRegistration = 0;
  context.registerTool = function (tool, options) {
    registrations += 1;
    tools.set(tool.name, tool);
    active.add(options.signal);
    options.signal.addEventListener('abort', () => active.delete(options.signal), { once: true });
    const promise = originalRegister.call(this, tool, options);
    pending.add(promise);
    Promise.resolve(promise)
      .then(
        () => {
          lastRegistration = performance.now();
        },
        (error) => {
          if (error.name === 'AbortError' && options.signal.aborted) abortedRegistrations += 1;
          else failures.push(String(error));
        }
      )
      .finally(() => {
        pending.delete(promise);
        version += 1;
      });
    return promise;
  };
  const schemas = Array.from({ length: toolCount }, () => makeSchema(fields));
  const controls = [];
  const committed = [];
  let update;
  function Tool({ index, revision, metadataRevision }) {
    const control = library.hook({
      name: `production_tool_${index}`,
      description: `Tool ${index}, description ${metadataRevision}`,
      inputSchema: schemaMode === 'inline' ? makeSchema(fields) : schemas[index],
      annotations: { readOnlyHint: true },
      execute: async ({ value }) => {
        // Identical asynchronous work lets a running-state update reach React naturally.
        await nextTask();
        return { content: [{ type: 'text', text: String(revision + value) }] };
      },
    });
    useLayoutEffect(() => {
      controls[index] = control;
      committed[index] = revision;
      renders += 1;
      version += 1;
      lastRender = performance.now();
    });
    useEffect(() => {
      passiveRenders += 1;
      version += 1;
      lastEffect = performance.now();
    });
    return <output>{control.state?.isExecuting ? 'running' : 'idle'}</output>;
  }
  function App() {
    const [props, setProps] = useState({ revision: 0, metadataRevision: 0 });
    update = setProps;
    const children = Array.from({ length: toolCount }, (_, index) => (
      <Tool key={index} index={index} {...props} />
    ));
    return library.provider
      ? React.createElement(library.provider, { name: 'benchmark', version: '1' }, children)
      : children;
  }
  const root = createRoot(document.getElementById('root'));
  const settle = async (revision, executions = 0) => {
    const deadline = performance.now() + 10000;
    let quiet = 0;
    while (quiet < 2) {
      const previous = version;
      await nextTask();
      check(failures.length === 0, failures.join('; '));
      for (const control of controls) {
        const error = control.registrationError || control.error;
        check(!error, String(error));
      }
      check(performance.now() < deadline, `${name}: timed out settling revision ${revision}`);
      // Native promise completion determines readiness; hook success flags are optional.
      const ready =
        pending.size === 0 &&
        controls.length === toolCount &&
        committed.length === toolCount &&
        committed.every((value) => value === revision) &&
        passiveRenders === renders &&
        controls.every(
          (control) =>
            control.isSupported !== false &&
            control.registered !== false &&
            !control.state?.isExecuting
        ) &&
        (!controls[0]?.state || controls[0].state.executionCount === executions);
      quiet = ready && previous === version ? quiet + 1 : 0;
    }
  };
  const phase = async (trigger, revision, executions = 0) => {
    const previousRenders = renders;
    const previousRegistrations = registrations;
    const start = performance.now();
    trigger();
    await settle(revision, executions);
    return {
      ms: Math.max(start, lastRender, lastEffect, lastRegistration) - start,
      renders: renders - previousRenders,
      registrations: registrations - previousRegistrations,
    };
  };
  try {
    const mount = await phase(() => root.render(<App />), 0);
    check(
      mount.registrations >= toolCount,
      `${name}: mount registered ${mount.registrations}/${toolCount} tools`
    );
    check((await context.getTools()).length === toolCount, 'Every tool must be discoverable');
    const updates = [];
    for (let revision = 1; revision <= 10; revision += 1) {
      const measurement = await phase(() => update({ revision, metadataRevision: 0 }), revision);
      updates.push(measurement);
    }
    const metadata = await phase(() => update({ revision: 11, metadataRevision: 1 }), 11);
    check(metadata.registrations >= toolCount, 'Metadata changes must update every tool');
    if (name === 'usewebmcp' || name === '@mcp-b/react-webmcp') {
      check(
        metadata.registrations === toolCount,
        `${name}: metadata changes must register each tool exactly once`
      );
      check(
        metadata.renders === toolCount,
        `${name}: metadata refresh committed ${metadata.renders}/${toolCount} consumer renders; successful registration must add no renders`
      );
    }
    const inventory = await context.getTools();
    check(
      inventory.length === toolCount &&
        inventory.every((tool) => tool.description.endsWith('description 1')),
      'Tool descriptions must be current'
    );
    const calls = [];
    for (let value = 0; value < 10; value += 1) {
      const previousRenders = renders;
      const start = performance.now();
      const result = await tools
        .get('production_tool_0')
        .execute({ value }, { signal: new AbortController().signal });
      const callbackEnd = performance.now();
      await settle(11, value + 1);
      const end = Math.max(callbackEnd, lastRender, lastEffect);
      check(result.content[0].text === String(11 + value), 'Execution must use current props');
      calls.push({
        ms: end - start,
        callbackMs: callbackEnd - start,
        renders: controls[0].state ? renders - previousRenders : null,
      });
    }
    root.unmount();
    check(active.size === 0, 'Unmount must abort every registration');
    check((await context.getTools()).length === 0, 'Unmount must remove every tool');
    return {
      library: name,
      toolCount,
      fields,
      schemaMode,
      mount,
      updates,
      metadata,
      calls,
      abortedRegistrations,
    };
  } finally {
    root.unmount();
    context.registerTool = originalRegister;
  }
};
