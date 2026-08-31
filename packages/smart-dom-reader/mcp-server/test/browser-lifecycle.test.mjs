import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import test from 'node:test';

test(
  'concurrent browser connections share one owner and close before reconnecting',
  { timeout: 30000 },
  async (t) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: new URL('..', import.meta.url),
      // Run the CLI as a standalone process rather than another node:test child.
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    t.after(async () => {
      child.stdin.end();
      child.kill('SIGTERM');
      await exited;
      lines.close();
    });
    const responses = new Map();
    let requestId = 0;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      const message = JSON.parse(line);
      responses.get(message.id)?.(message);
      responses.delete(message.id);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    const request = (method, params) =>
      new Promise((resolve) => {
        const id = ++requestId;
        responses.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    const call = async (name, args = {}) => {
      const response = await request('tools/call', { name, arguments: args });
      assert.equal(response.error, undefined);
      assert.notEqual(response.result.isError, true);
      return response.result.content[0].text;
    };
    const connectArgs = {
      headless: true,
      ...(process.env.CHROME_BIN && { executablePath: process.env.CHROME_BIN }),
    };

    const initialized = await request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'lifecycle-test', version: '1' },
    });
    assert.equal(initialized.error, undefined);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
    );
    const connected = await Promise.all([
      call('browser_connect', connectArgs),
      call('browser_connect', connectArgs),
    ]);
    assert.equal(connected.filter((text) => text.startsWith('Browser connected')).length, 1);
    assert.equal(connected.filter((text) => text === 'Browser already connected').length, 1);
    await call('browser_navigate', {
      url: 'data:text/html,<title>Scope test</title><main><button>Outside scope</button></main>',
    });
    for (const name of ['dom_extract_structure', 'dom_extract_interactive']) {
      const response = await request('tools/call', {
        name,
        arguments: { selector: '#missing' },
      });
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0].text, /No matching element/);
      assert.equal(response.result.content[0].text.includes('Outside scope'), false);
      assert.equal(typeof (await call(name)), 'string');
    }
    const [closed, reconnected] = await Promise.all([
      call('browser_close'),
      call('browser_connect', connectArgs),
    ]);
    assert.equal(closed, 'Browser closed');
    assert.match(reconnected, /^Browser connected/);
    assert.equal(await call('browser_close'), 'Browser closed');
    assert.equal(await call('browser_close'), 'Browser already closed');
    await call('browser_connect', connectArgs);
    child.stdin.end();
    const [exitCode] = await once(child, 'exit', { signal: AbortSignal.timeout(5000) });
    assert.equal(exitCode, 0);
  }
);
