import type { CallToolResult, RegistrationHandle, Resource, ToolResponse } from './common.js';
import type { Prompt, PromptDescriptor } from './prompt.js';
import type { ResourceDescriptor, ResourceTemplateInfo } from './resource.js';
import type { ToolDescriptor, ToolListItem } from './tool.js';

// Re-export all public types
export type {
  AudioContent,
  CallToolResult,
  ContentBlock,
  EmbeddedResource,
  ImageContent,
  InputSchema,
  RegistrationHandle,
  Resource,
  ResourceContents,
  ResourceLink,
  TextContent,
  ToolResponse,
} from './common.js';
export type { Prompt, PromptArgument, PromptDescriptor, PromptMessage } from './prompt.js';
export type { ResourceDescriptor, ResourceTemplateInfo } from './resource.js';
export type { ToolAnnotations, ToolDescriptor, ToolListItem } from './tool.js';

// ============================================================================
// Model Context Input
// ============================================================================

/**
 * Context provided to models via provideContext().
 */
export interface ModelContextInput {
  tools?: ToolDescriptor[];
  resources?: ResourceDescriptor[];
  prompts?: PromptDescriptor[];
}

// ============================================================================
// Tool Call Event
// ============================================================================

/**
 * Event dispatched when a tool is called.
 */
export interface ToolCallEvent extends Event {
  name: string;
  arguments: Record<string, unknown>;
  respondWith: (response: ToolResponse) => void;
}

// ============================================================================
// Model Context
// ============================================================================

/**
 * ModelContext interface on navigator.modelContext.
 * Implements the W3C Web Model Context API proposal.
 */
export interface ModelContext {
  // ==================== CONTEXT ====================

  provideContext(context: ModelContextInput): void;

  // ==================== TOOLS ====================

  registerTool(tool: ToolDescriptor): RegistrationHandle;
  unregisterTool(name: string): void;
  listTools(): ToolListItem[];
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult>;

  // ==================== RESOURCES ====================

  registerResource(resource: ResourceDescriptor): RegistrationHandle;
  unregisterResource(uri: string): void;
  listResources(): Resource[];
  listResourceTemplates(): ResourceTemplateInfo[];

  // ==================== PROMPTS ====================

  registerPrompt(prompt: PromptDescriptor): RegistrationHandle;
  unregisterPrompt(name: string): void;
  listPrompts(): Prompt[];

  // ==================== GENERAL ====================

  clearContext(): void;

  // ==================== EVENTS ====================

  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | EventListenerOptions
  ): void;

  dispatchEvent(event: Event): boolean;
}

// ============================================================================
// Global Augmentation
// ============================================================================

declare global {
  interface Navigator {
    readonly modelContext: ModelContext;
  }
}
