// Run against the built site: pnpm exec astro preview --host 127.0.0.1 --port 4329
import assert from 'node:assert/strict';
import test from 'node:test';

const origin = process.env.SEO_TEST_ORIGIN ?? 'http://127.0.0.1:4329';

test('rendered pages expose canonical URLs and matching article metadata', async () => {
  for (const path of [
    '/',
    '/about/',
    '/contact/',
    '/blog/',
    '/blog/webmcp-challenge/',
    '/blog/mcp-b-introduction/',
  ]) {
    const response = await fetch(`${origin}${path}?from=search`, { redirect: 'manual' });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const canonical = `https://mcp-b.ai${path}`;
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), path);
    assert.doesNotMatch(html, /href="\/blog(?:\/[^"/#?]+)?"/);

    const scripts = [
      ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
    ];
    assert.equal(scripts.length, 1, path);
    const data = JSON.parse(scripts[0][1]);
    const article = data['@graph']?.find((item) => item['@type'] === 'BlogPosting');

    if (path.startsWith('/blog/') && path !== '/blog/') {
      assert.ok(article, path);
      assert.equal(article.mainEntityOfPage, canonical);
      assert.equal(article['@id'], `${canonical}#article`);
      assert.equal(html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1], article.headline, path);
      assert.deepEqual(article.author, [{ '@type': 'Person', name: 'Alex Nahas' }]);
      assert.ok(Number.isFinite(Date.parse(article.datePublished)), path);
      assert.deepEqual(article.publisher, { '@id': 'https://mcp-b.ai/#organization' });
      if (path === '/blog/mcp-b-introduction/') {
        assert.equal(article.dateModified, '2026-08-30T00:00:00.000Z');
        assert.match(html, /Updated August 30, 2026/);
      } else {
        assert.equal(article.dateModified, undefined);
      }
    } else {
      assert.equal(article, undefined, path);
      assert.equal(data['@type'], 'Organization');
      assert.deepEqual(data.alternateName, ['MCPB', 'MCP B']);
    }
  }
});
