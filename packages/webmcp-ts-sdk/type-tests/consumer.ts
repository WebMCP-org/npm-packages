import '@mcp-b/webmcp-ts-sdk';

// The SDK's declarations carry the polyfill's SubmitEvent extensions, so a page
// that imports only the SDK can read the declarative submit hooks.
declare const event: SubmitEvent;
if (event.agentInvoked) event.respondWith?.(Promise.resolve({ ok: true }));
