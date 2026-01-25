/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants for WebMCP CDP bridge communication.
 * These names are used to coordinate between the bridge script injected into the page
 * and the WebMCPClientTransport running in Node.js via CDP.
 */

/**
 * Window property name for the CDP bridge object.
 * Renamed from `__mcpBridge` to `__mcpCdpBridge` to avoid collision with
 * the polyfill's internal `__mcpBridge` property.
 */
export const CDP_BRIDGE_WINDOW_PROPERTY = '__mcpCdpBridge' as const;

/**
 * CDP binding name for receiving messages from the bridge.
 * This is the function name registered via Runtime.addBinding that the
 * bridge calls to send messages back to the CDP transport.
 */
export const CDP_BRIDGE_BINDING = '__mcpBridgeToClient' as const;
