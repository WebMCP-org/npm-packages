/**
 * Maximum tool name length supported across MCP clients.
 */
const MAX_MCP_TOOL_NAME_LENGTH = 128;

/**
 * Number of tab-id characters appended when disambiguation is required.
 */
const TAB_ID_DISAMBIGUATION_LENGTH = 4;

/**
 * Converts arbitrary text into MCP-safe identifier characters.
 */
export function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Extracts and sanitizes a domain label from an origin or URL.
 */
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

/**
 * Builds a public tool name for MCP registration.
 *
 * Names can include a short tab-id suffix when multiple tabs publish the same
 * original tool name.
 */
export function buildPublicToolName(options: {
  originalToolName: string;
  tabId?: string;
  disambiguate?: boolean;
}): string {
  const safeName = sanitizeName(options.originalToolName);

  if (!options.disambiguate || !options.tabId) {
    return safeName.slice(0, MAX_MCP_TOOL_NAME_LENGTH);
  }

  const shortTab = sanitizeName(options.tabId).slice(0, TAB_ID_DISAMBIGUATION_LENGTH);
  const suffix = `_${shortTab}`;
  const base = `${safeName}${suffix}`;

  if (base.length <= MAX_MCP_TOOL_NAME_LENGTH) {
    return base;
  }

  const available = MAX_MCP_TOOL_NAME_LENGTH - suffix.length;
  return `${safeName.slice(0, Math.max(1, available))}${suffix}`;
}
