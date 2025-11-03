/**
 * Centralized localStorage utilities for application settings
 */

// Storage keys
export const API_KEY_STORAGE_KEY = 'anthropic_api_key';
export const SERVER_URL_STORAGE_KEY = 'mcp_server_url';

/**
 * Get the stored API key from localStorage or environment variable
 * @returns The API key string (may be empty)
 */
export const getStoredApiKey = (): string => {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? import.meta.env.VITE_ANTHROPIC_API_KEY ?? '';
};

/**
 * Save the API key to localStorage
 * @param key The API key to store
 */
export const setStoredApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

/**
 * Get the stored server URL from localStorage or environment variable
 * @returns The server URL string (may be empty)
 */
export const getStoredServerUrl = (): string => {
  return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? import.meta.env.VITE_MCP_SERVER_URL ?? '';
};

/**
 * Save the server URL to localStorage
 * @param url The server URL to store
 */
export const setStoredServerUrl = (url: string): void => {
  localStorage.setItem(SERVER_URL_STORAGE_KEY, url);
};

/**
 * Remove the server URL from localStorage
 * Used when disconnecting from the server
 */
export const clearStoredServerUrl = (): void => {
  localStorage.removeItem(SERVER_URL_STORAGE_KEY);
};
