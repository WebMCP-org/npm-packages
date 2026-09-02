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

test('documentation aliases redirect to canonical URLs', async () => {
  const config = JSON.parse(await readFile(new URL('docs.json', appRoot), 'utf8'));
  const redirects = new Map(
    config.redirects.map(({ source, destination }) => [source, destination])
  );

  assert.equal(redirects.get('/index'), '/');
  assert.equal(redirects.get('/packages/index'), '/packages');
  assert.equal(redirects.get('/tutorials/index'), '/tutorials');
  assert.equal(redirects.get('/how-to/index'), '/how-to');
  assert.equal(redirects.get('/explanation/index'), '/explanation');
  assert.equal(redirects.get('/skill'), '/start-here/choose-your-path');
});

test('documentation link hubs point to canonical section URLs', async () => {
  const linkHubs = [
    'index.mdx',
    'explanation/index.mdx',
    'how-to/index.mdx',
    'packages/index.mdx',
    'reference/webmcp/codex-site-tools.mdx',
    'start-here/choose-your-path.mdx',
    'start-here/metadata.mdx',
    'tutorials/index.mdx',
  ];
  const contents = await Promise.all(
    linkHubs.map((path) => readFile(new URL(path, appRoot), 'utf8'))
  );

  for (const content of contents) {
    assert.doesNotMatch(content, /\/(?:packages|tutorials|how-to|explanation)\/index\b/);
  }
});
