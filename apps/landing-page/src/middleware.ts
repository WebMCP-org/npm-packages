import { defineMiddleware } from 'astro:middleware';

const canonicalPathRedirects = new Map([
  ['/blog', '/blog/'],
  ['/contact', '/contact/'],
  ['/privacy', '/privacy/'],
  ['/terms', '/terms/'],
  ['/blog/mcp-b-introduction', '/blog/mcp-b-introduction/'],
  ['/blog/webmcp-challenge', '/blog/webmcp-challenge/'],
  ['/blogs', '/blog/'],
  ['/blogs/', '/blog/'],
  ['/blogs/mcp-b-introduction', '/blog/mcp-b-introduction/'],
  ['/blogs/mcp-b-introduction/', '/blog/mcp-b-introduction/'],
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  let shouldRedirect = false;

  if (url.hostname === 'www.mcp-b.ai') {
    url.hostname = 'mcp-b.ai';
    shouldRedirect = true;
  }

  const canonicalPath = canonicalPathRedirects.get(url.pathname);
  if (canonicalPath) {
    url.pathname = canonicalPath;
    shouldRedirect = true;
  }

  if (shouldRedirect) {
    return Response.redirect(url.toString(), 308);
  }

  const response = await next();

  // Security headers for all SSR responses
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return response;
});
