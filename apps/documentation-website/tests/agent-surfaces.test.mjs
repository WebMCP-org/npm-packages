import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appRoot = new URL('../', import.meta.url);

test('agent-facing docs use the current proposal and omit component source', async () => {
  const [homepage, llms] = await Promise.all([
    readFile(new URL('index.mdx', appRoot), 'utf8'),
    readFile(new URL('llms.txt', appRoot), 'utf8'),
  ]);

  assert.doesNotMatch(homepage, /LiveLandingTool|snippets-jsx\/live-landing-tool/);
  assert.match(homepage, /id="live-landing-tool"/);
  assert.match(llms, /document\.modelContext/);
  assert.match(llms, /not a W3C Standard/);
  assert.doesNotMatch(llms, /navigator\.modelContext|WebMCP is a W3C standard/i);
});
