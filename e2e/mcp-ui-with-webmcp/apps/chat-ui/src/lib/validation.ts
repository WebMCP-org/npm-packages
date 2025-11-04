/**
 * Zod validation schemas for application settings
 */

import { z } from 'zod';

/**
 * Settings form validation schema
 */
export const settingsFormSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required').startsWith('sk-ant-', {
    message: "Invalid API key format. Anthropic API keys start with 'sk-ant-'",
  }),
  serverUrl: z
    .string()
    .trim()
    .min(1, 'Server URL is required')
    .url('Invalid URL format')
    .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
      message: 'URL must start with http:// or https://',
    })
    .default(import.meta.env.VITE_MCP_SERVER_URL ?? 'http://localhost:8888/mcp'),
});

/**
 * TypeScript type inferred from the schema
 */
export type SettingsFormData = z.infer<typeof settingsFormSchema>;
