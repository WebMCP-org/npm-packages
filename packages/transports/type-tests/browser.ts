import { TabClientTransport } from '@mcp-b/transports';

new TabClientTransport({ targetOrigin: location.origin });

// @ts-expect-error Importing a page transport must not introduce Chrome extension globals.
void chrome.runtime;
