import { ExtensionClientTransport, ExtensionServerTransport } from '@mcp-b/transports';

new ExtensionClientTransport();
chrome.runtime.onConnect.addListener((port) => {
  new ExtensionServerTransport(port);
});

// Importing transports must not change the consumer's Chrome event and enum types.
chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
  void tab.url;
});
void chrome.windows.create({ type: 'popup' });
