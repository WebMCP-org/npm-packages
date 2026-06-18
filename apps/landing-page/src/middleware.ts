import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // Redirect www to apex domain for SEO canonicalization
  if (url.hostname === 'www.mcp-b.ai') {
    url.hostname = 'mcp-b.ai';
    return Response.redirect(url.toString(), 301);
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
