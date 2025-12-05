/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridge script that gets injected into the page via CDP.
 *
 * This script acts as a ferry between Chrome DevTools Protocol (CDP) and
 * the page's TabServerTransport. It does NOT understand MCP - it simply
 * forwards JSON-RPC messages between the two transport layers.
 *
 * Communication flow:
 *
 * CDP → Page (requests):
 *   1. CDP calls Runtime.evaluate with __mcpBridge.toServer(messageJson)
 *   2. Bridge parses the message and posts it via window.postMessage
 *   3. TabServerTransport receives it and processes the MCP request
 *
 * Page → CDP (responses/notifications):
 *   1. TabServerTransport sends response via window.postMessage
 *   2. Bridge's message listener catches it
 *   3. Bridge calls window.__mcpBridgeToClient(messageJson)
 *   4. CDP receives it via Runtime.bindingCalled event
 *
 * The bridge uses the same message format as TabServerTransport:
 * {
 *   channel: 'mcp-default',
 *   type: 'mcp',
 *   direction: 'client-to-server' | 'server-to-client',
 *   payload: JSONRPCMessage | 'mcp-check-ready' | 'mcp-server-ready' | 'mcp-server-stopped'
 * }
 */
export const WEB_MCP_BRIDGE_SCRIPT = `
(function() {
  'use strict';

  var CHANNEL_ID = 'mcp-default';
  var BRIDGE_VERSION = '1.1.0';

  // Prevent double injection
  if (window.__mcpBridge && window.__mcpBridge.version === BRIDGE_VERSION) {
    return { alreadyInjected: true };
  }

  // Track if we've seen the server ready signal
  var serverReady = false;
  var webMCPDetected = false;

  // Listen for messages FROM TabServerTransport (server-to-client direction)
  // These are responses and notifications from the MCP server
  function handleServerMessage(event) {
    // Only handle messages from the same window (posted by TabServerTransport)
    if (event.source !== window) return;

    var data = event.data;

    // Validate message format
    if (!data || data.channel !== CHANNEL_ID || data.type !== 'mcp') return;
    if (data.direction !== 'server-to-client') return;

    var payload = data.payload;

    // Track server ready state
    if (payload === 'mcp-server-ready') {
      serverReady = true;
    } else if (payload === 'mcp-server-stopped') {
      serverReady = false;
    }

    // Forward to CDP client via the binding
    // The binding '__mcpBridgeToClient' is set up by CDPClientTransport before injection
    if (typeof window.__mcpBridgeToClient === 'function') {
      try {
        var messageJson = typeof payload === 'string' ? JSON.stringify(payload) : JSON.stringify(payload);
        window.__mcpBridgeToClient(messageJson);
      } catch (err) {
        console.error('[WebMCP Bridge] Failed to forward message to CDP:', err);
      }
    }
  }

  window.addEventListener('message', handleServerMessage);

  // Check if WebMCP (navigator.modelContext) is available
  function checkWebMCPAvailable() {
    if (typeof navigator !== 'undefined' && navigator.modelContext) {
      webMCPDetected = true;
      return true;
    }
    if (window.__MCP_BRIDGE__) {
      webMCPDetected = true;
      return true;
    }
    return false;
  }

  // Initial check
  checkWebMCPAvailable();

  // Expose the bridge API for CDP to call
  window.__mcpBridge = {
    version: BRIDGE_VERSION,

    /**
     * Send a message to the TabServerTransport (client-to-server direction)
     * Called by CDP via Runtime.evaluate
     *
     * @param {string} payloadJson - JSON string of the payload to send
     * @returns {boolean} true if message was sent
     */
    toServer: function(payloadJson) {
      try {
        var payload = JSON.parse(payloadJson);

        window.postMessage({
          channel: CHANNEL_ID,
          type: 'mcp',
          direction: 'client-to-server',
          payload: payload
        }, window.location.origin);

        return true;
      } catch (err) {
        console.error('[WebMCP Bridge] Failed to send to server:', err);
        return false;
      }
    },

    /**
     * Check if the bridge is ready and functional
     * @returns {boolean}
     */
    isReady: function() {
      return true;
    },

    /**
     * Check if WebMCP is available on this page
     * Re-checks each time in case polyfill loaded after bridge injection
     * @returns {boolean}
     */
    hasWebMCP: function() {
      return checkWebMCPAvailable();
    },

    /**
     * Check if the MCP server has signaled ready
     * @returns {boolean}
     */
    isServerReady: function() {
      return serverReady;
    },

    /**
     * Send the check-ready signal to TabServerTransport
     * This triggers the server to respond with 'mcp-server-ready'
     */
    checkReady: function() {
      window.postMessage({
        channel: CHANNEL_ID,
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready'
      }, window.location.origin);
    },

    /**
     * Get the channel ID being used
     * @returns {string}
     */
    getChannelId: function() {
      return CHANNEL_ID;
    },

    /**
     * Clean up the bridge (remove listeners)
     */
    dispose: function() {
      window.removeEventListener('message', handleServerMessage);
      delete window.__mcpBridge;
    }
  };

  return { success: true, version: BRIDGE_VERSION, webMCPDetected: webMCPDetected };
})();
`;

/**
 * Check if WebMCP (@mcp-b/global) is available on the page.
 * This script is evaluated before injecting the bridge.
 */
export const CHECK_WEBMCP_AVAILABLE_SCRIPT = `
(function() {
  // Check for navigator.modelContext (WebMCP polyfill or native)
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return { available: true, type: 'modelContext' };
  }

  // Check for internal bridge (set by @mcp-b/global)
  if (window.__MCP_BRIDGE__) {
    return { available: true, type: 'bridge' };
  }

  // Check for TabServerTransport markers
  // The TabServerTransport broadcasts 'mcp-server-ready' on start
  // We can't detect this without listening, so we check for common indicators

  return { available: false };
})();
`;
