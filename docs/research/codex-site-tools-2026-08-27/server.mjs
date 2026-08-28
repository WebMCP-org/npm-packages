import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const filename = pathname === '/' ? 'imperative.html' : pathname.slice(1);

  if (filename.includes('/') || filename.includes('..')) {
    response.writeHead(404).end();
    return;
  }

  try {
    const body = await readFile(join(root, filename));
    if (filename === 'policy-disabled.html') {
      response.setHeader('Permissions-Policy', 'tools=()');
    }
    response.setHeader(
      'Content-Type',
      filename.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'
    );
    response.writeHead(200).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(41739, '127.0.0.1');
