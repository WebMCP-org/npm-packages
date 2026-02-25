import { createHash } from 'node:crypto';

// MCP tool names are limited to 128 characters by convention across MCP clients
const MAX_MCP_TOOL_NAME_LENGTH = 128;

export function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function extractSanitizedDomain(originOrUrl?: string): string {
  if (!originOrUrl) {
    return 'unknown';
  }

  try {
    const parsed = new URL(originOrUrl);
    if (!parsed.hostname) {
      return 'unknown';
    }

    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';

    const domain = isLocalhost ? `localhost_${parsed.port || '80'}` : parsed.hostname;
    return sanitizeName(domain);
  } catch {
    return 'unknown';
  }
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

export function buildPublicToolName(options: {
  domain: string;
  tabId: string;
  originalToolName: string;
}): string {
  const safeDomain = sanitizeName(options.domain);
  const safeTabId = sanitizeName(options.tabId);
  const safeToolName = sanitizeName(options.originalToolName);

  const base = `webmcp_${safeDomain}_tab${safeTabId}_${safeToolName}`;
  if (base.length <= MAX_MCP_TOOL_NAME_LENGTH) {
    return base;
  }

  const hash = shortHash(base);
  const prefix = 'webmcp_';
  const suffix = `_${hash}`;
  const available = MAX_MCP_TOOL_NAME_LENGTH - prefix.length - suffix.length;
  const compressed = `${safeDomain}_tab${safeTabId}_${safeToolName}`.slice(
    0,
    Math.max(8, available)
  );

  return `${prefix}${compressed}${suffix}`;
}
