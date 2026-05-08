# @mcp-b/extension-tools

> 62+ Chrome Extension API tools for Model Context Protocol - Let Claude, ChatGPT, and Gemini control your browser

[![npm version](https://img.shields.io/npm/v/@mcp-b/extension-tools?style=flat-square)](https://www.npmjs.com/package/@mcp-b/extension-tools)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/extension-tools?style=flat-square)](https://www.npmjs.com/package/@mcp-b/extension-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Chrome APIs](https://img.shields.io/badge/Chrome_APIs-62+-4285F4?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/reference/)

**[Full Documentation](https://docs.mcp-b.ai/packages/extension-tools)** | **[Quick Start](https://docs.mcp-b.ai/quickstart)**

**@mcp-b/extension-tools** exposes Chrome Extension APIs as MCP tools, enabling AI agents like Claude, ChatGPT, Gemini, Cursor, and Copilot to control browser tabs, manage bookmarks, access history, execute scripts, and more.

## Why Use @mcp-b/extension-tools?

| Feature              | Benefit                                                |
| -------------------- | ------------------------------------------------------ |
| **62+ Chrome APIs**  | Comprehensive coverage of Chrome Extension APIs        |
| **AI-Ready**         | Built for MCP, the standard for AI tool integration    |
| **Granular Control** | Enable only the APIs your extension needs              |
| **Permission Aware** | Automatic permission checking and clear error messages |
| **Manifest V3**      | Full support for Chrome's latest extension platform    |
| **TypeScript**       | Complete type definitions for all 62+ APIs             |

## Use Cases

- **AI Browser Assistants**: Let AI agents manage tabs, bookmarks, and browsing history
- **Automated Testing**: AI-driven browser automation and testing
- **Research Tools**: AI can search history, manage reading lists, and organize bookmarks
- **Productivity Extensions**: AI helps with tab management, session saving, and workflow automation
- **Enterprise Tools**: AI-powered browser management and policy enforcement

## Overview

This package provides a comprehensive set of tool classes that expose Chrome Extension APIs through the Model Context Protocol (MCP). Each API is wrapped in a dedicated class that handles permission checking, error handling, and tool registration.

Currently, **62 out of 74** Chrome Extension APIs have been implemented and are ready to use. See the [API Implementation Status](#api-implementation-status) section below for a complete list of available and pending APIs.

## Installation

```bash
npm install @mcp-b/extension-tools @modelcontextprotocol/sdk
# or
pnpm add @mcp-b/extension-tools @modelcontextprotocol/sdk
# or
yarn add @mcp-b/extension-tools @modelcontextprotocol/sdk
```

## Contract-Only Imports

The direct-action Chrome tool groups also expose side-effect-free contracts for cloud runtimes, setup UIs, policy code, and tests. These exports do not read `chrome`, touch DOM globals, register tools, or start extension listeners at import time.

```typescript
import {
  EXTENSION_TOOL_CONTRACTS,
  EXTENSION_TOOL_CONTRACTS_BY_NAME,
  type ExtensionToolName,
} from '@mcp-b/extension-tools/contracts';
import { TAB_TOOL_CONTRACTS } from '@mcp-b/extension-tools/contracts/tabs';

const enabledToolNames: ExtensionToolName[] = ['extension_tool_create_tab'];
const enabledContracts = enabledToolNames.map((name) => EXTENSION_TOOL_CONTRACTS_BY_NAME[name]);

const mcpTools = enabledContracts.map((contract) => ({
  name: contract.name,
  title: contract.title,
  description: contract.description,
  inputSchema: contract.inputSchema,
  outputSchema: contract.outputSchema,
  annotations: contract.annotations,
  _meta: contract._meta,
}));

console.log(TAB_TOOL_CONTRACTS.createTab.inputSchema);
```

Each contract includes the stable MCP tool name, title, description, input schema, output schema when the runtime returns structured output, MCP annotations, and serializable extension metadata.

### Contract Authoring Target

Extension tool modules should treat the MCP tool descriptor as the public contract and keep execution separate from that contract.

The target shape is:

- tool contract: MCP `Tool` descriptor fields, without an execution handler
- schemas: exported Zod input and output schemas
- types: exported `z.infer` input and output types
- annotations: MCP `ToolAnnotations`
- metadata: a small `_meta.extension` payload that serializes through MCP
- handler: a runtime-only function that accepts the inferred input type and returns the inferred output type

The contract should stay portable. Consumers can adapt it into MCP SDK tools, Vercel AI SDK tools, Mastra tools, setup UIs, policy screens, or docs without importing Chrome execution code.

```typescript
import { z } from 'zod';
import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export type ExtensionToolMeta = {
  groupId: string;
  actionId: string;
  chromeApi: string;
  permissions?: string[];
  hostPermissions?: string[];
  requiresActiveTab?: boolean;
};

export type ExtensionToolContract = Omit<Tool, 'inputSchema' | 'outputSchema'> & {
  inputSchema: z.ZodObject;
  outputSchema?: z.ZodType;
  annotations?: ToolAnnotations;
  _meta?: {
    extension?: ExtensionToolMeta;
  };
};
```

Example module shape:

```typescript
export const STORAGE_AREA_SCHEMA = z.enum(['sync', 'local', 'session']);

export const STORAGE_SET_INPUT_SCHEMA = z.object({
  area: STORAGE_AREA_SCHEMA.default('local'),
  data: z.record(z.string(), z.unknown()),
});

export const STORAGE_SET_OUTPUT_SCHEMA = z.object({
  keys: z.array(z.string()),
});

export type StorageSetInput = z.infer<typeof STORAGE_SET_INPUT_SCHEMA>;
export type StorageSetOutput = z.infer<typeof STORAGE_SET_OUTPUT_SCHEMA>;

export const STORAGE_SET_TOOL = {
  name: 'extension_tool_set_storage',
  title: 'Set Storage',
  description: 'Set data in extension storage',
  inputSchema: STORAGE_SET_INPUT_SCHEMA,
  outputSchema: STORAGE_SET_OUTPUT_SCHEMA,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    extension: {
      groupId: 'storage',
      actionId: 'setStorage',
      chromeApi: 'storage',
      permissions: ['storage'],
    },
  },
} satisfies ExtensionToolContract;
```

The handler should use the schema-derived types directly. It should not own names, descriptions, annotations, or metadata.

```typescript
export async function handleSetStorage(input: StorageSetInput): Promise<StorageSetOutput> {
  await chrome.storage[input.area].set(input.data);

  return {
    keys: Object.keys(input.data),
  };
}
```

The runtime adapter owns edge validation and MCP result formatting:

```typescript
registerExtensionTool({
  contract: STORAGE_SET_TOOL,
  inputSchema: STORAGE_SET_INPUT_SCHEMA,
  outputSchema: STORAGE_SET_OUTPUT_SCHEMA,
  handler: handleSetStorage,
});
```

The adapter validates input once at the tool-call boundary, validates output when an output schema exists, and returns `structuredContent` for successful structured tools. Errors should be returned as MCP errors or `CallToolResult` values with `isError: true`.

## Browser Agent Tooling Target

The package should support two layers:

1. **Raw Chrome API contracts and runtimes** for package maintainers, tests, conformance, and customers that want explicit Chrome API access.
2. **Curated browser-agent tools** for model-facing use, where the tool surface is organized around browser jobs instead of Chrome namespaces.

The raw layer remains useful. It gives the package exact coverage for `tabs`, `windows`, `tabGroups`, `scripting`, `userScripts`, `cookies`, `downloads`, `alarms`, `runtime`, and other Chrome APIs. It is also the best place to keep real Chromium conformance tests because each raw group maps closely to a browser API.

The model-facing layer should not mirror that raw layer. Agents generally perform better with a small number of clear, task-shaped tools than with dozens of overlapping method-shaped tools. The package should therefore provide a browser-agent facade that consumes the raw contracts and handlers but exposes fewer, higher-level tools.

Relevant design references:

- Anthropic recommends designing tools for agent workflows rather than wrapping existing APIs one-for-one, then improving them with evals against realistic tasks: [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents).
- MCP client guidance recommends progressive discovery once tool definitions become a meaningful part of the context window, using catalog, inspect, and execute phases instead of loading every schema up front: [MCP client best practices](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices).
- OpenAI guidance notes that large toolsets can work, but ambiguity and overlapping tool purposes degrade reliability; descriptions and decision boundaries matter: [Function calling guide](https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide).
- MCP annotations are risk vocabulary, not enforcement. They should inform clients and approval UX, while runtime authorization remains deterministic: [MCP tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/).
- Chrome recommends least-privilege extension design, optional permissions, runtime host access, and `activeTab` where possible: [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

### Design Principles

The model-facing tools should be organized by what the agent is trying to accomplish:

- Manage browser workspace.
- Inspect and act on pages.
- Understand or change browser session state.
- Work with downloads.
- Install or manage durable browser automations.

They should not be organized by Chrome API namespace:

- `tabs`
- `windows`
- `scripting`
- `userScripts`
- `cookies`
- `downloads`
- `alarms`
- `permissions`

The namespace list is still important internally. It should not be the default mental model exposed to the agent.

The package should avoid both extremes:

- Too many atomic tools, such as `get_cookie`, `set_cookie`, `execute_script`, `insert_css`, `create_alarm`, and `download_url` all visible at once.
- One untyped escape hatch, such as `execute_chrome_action({ api, method, args })`.

The target is a small set of tools with discriminated actions and strict schemas. Each action remains independently typed, validated, annotated, permission-gated, and tested.

### Proposed Model-Facing Tools

The first browser-agent facade should expose five model-facing tools:

- `browser_workspace`
- `browser_page`
- `browser_session`
- `browser_downloads`
- `browser_automation`

These names are intentionally product-level. They describe the capability the agent needs, not the Chrome API that implements it.

#### `browser_workspace`

Use `browser_workspace` for browser shell state: tabs, windows, tab groups, focus, navigation, and workspace cleanup.

Backed by:

- `TabsApiTools`
- `WindowsApiTools`
- `TabGroupsApiTools`
- selected `SessionsApiTools` later, if restoring closed tabs/windows becomes part of the product

Representative actions:

```typescript
type BrowserWorkspaceAction =
  | 'list'
  | 'open_tab'
  | 'update_tab'
  | 'close_tabs'
  | 'focus_tab'
  | 'move_tabs'
  | 'group_tabs'
  | 'ungroup_tabs'
  | 'list_windows'
  | 'update_window'
  | 'close_window'
  | 'reload_tab'
  | 'navigate_tab_history';
```

This tool should return concise structured state by default. Large tab/window lists should support filters and limits so routine calls do not flood the model context.

Example input shape:

```typescript
export const BROWSER_WORKSPACE_INPUT_SCHEMA = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
    currentWindow: z.boolean().optional(),
    includeUrls: z.boolean().default(true),
    includeGroups: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('open_tab'),
    url: z.string().optional(),
    active: z.boolean().optional(),
    pinned: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('close_tabs'),
    tabIds: z.array(z.number().int().min(0)).min(1),
  }),
]);
```

Action-level policy examples:

- `list`: read-only, open-world, no approval by default.
- `open_tab`: navigation/write effect, approval depends on caller policy.
- `close_tabs`: destructive, approval by default.
- `update_tab` with `url`: navigation/write effect.
- `group_tabs` and `move_tabs`: write effect, usually no destructive approval.

#### `browser_page`

Use `browser_page` for the contents of a page: observation, extraction, screenshots, DOM-grounded actions, content-script messaging, and carefully gated one-shot script execution.

Backed by:

- `DomExtractionTools`
- `TabsApiTools.captureVisibleTab`
- `ScriptingApiTools`
- content-script bridge code
- optional `WebNavigationApiTools` later for frame/navigation context

Representative actions:

```typescript
type BrowserPageAction =
  | 'snapshot'
  | 'extract'
  | 'screenshot'
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'wait_for'
  | 'send_message'
  | 'run_script'
  | 'insert_css'
  | 'remove_css';
```

The default page actions should be DOM-grounded. `run_script` is intentionally present but should be treated as a higher-risk action than `click`, `type`, or `extract`.

Example target schema:

```typescript
export const PAGE_TARGET_SCHEMA = z.object({
  tabId: z.number().int().min(0).optional(),
  frameId: z.number().int().min(0).optional(),
  documentId: z.string().optional(),
});
```

Example input shape:

```typescript
export const BROWSER_PAGE_INPUT_SCHEMA = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('snapshot'),
    target: PAGE_TARGET_SCHEMA.optional(),
    includeText: z.boolean().default(true),
    includeInteractiveElements: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('screenshot'),
    target: PAGE_TARGET_SCHEMA.optional(),
  }),
  z.object({
    action: z.literal('run_script'),
    target: PAGE_TARGET_SCHEMA,
    code: z.string(),
    args: z.array(z.unknown()).optional(),
  }),
]);
```

Action-level policy examples:

- `snapshot` and `extract`: read-only, open-world, may require host access.
- `screenshot`: read-only but privacy-sensitive, may require `activeTab`.
- `click`, `type`, `select`, `scroll`: page mutation/user action effects.
- `run_script`: high-risk execution, requires `scripting` plus host permission or `activeTab`.
- `insert_css` and `remove_css`: page mutation, requires `scripting` plus host permission or `activeTab`.

The facade should prefer page-specific structured results over raw script results. For example, `snapshot` should return elements and text regions, not a stringified DOM dump.

#### `browser_session`

Use `browser_session` for login/session state and cookies. This tool is separate because cookies are both useful and sensitive.

Backed by:

- `CookiesApiTools`

Representative actions:

```typescript
type BrowserSessionAction =
  | 'list_cookies'
  | 'get_cookie'
  | 'set_cookie'
  | 'remove_cookie'
  | 'list_cookie_stores';
```

Chrome cookie access requires the `cookies` permission and host permissions for the relevant URL. The schemas should model modern cookie fields, including partitioning where Chrome exposes it.

Example input shape:

```typescript
export const BROWSER_SESSION_INPUT_SCHEMA = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_cookies'),
    url: z.string().url().optional(),
    domain: z.string().optional(),
    name: z.string().optional(),
    storeId: z.string().optional(),
  }),
  z.object({
    action: z.literal('set_cookie'),
    url: z.string().url(),
    name: z.string().min(1),
    value: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    sameSite: z.enum(['no_restriction', 'lax', 'strict', 'unspecified']).optional(),
    expirationDate: z.number().optional(),
  }),
]);
```

Action-level policy examples:

- `list_cookies`: read-only but sensitive/exfiltration risk.
- `set_cookie`: write effect, high risk.
- `remove_cookie`: destructive session effect.
- `list_cookie_stores`: read-only.

By default, `browser_session` should not be part of the lowest-risk tool profile. It should require an explicit package consumer or product policy decision.

#### `browser_downloads`

Use `browser_downloads` for file transfer workflows.

Backed by:

- `DownloadsApiTools`

Representative actions:

```typescript
type BrowserDownloadsAction =
  | 'search'
  | 'download'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'open'
  | 'show'
  | 'erase'
  | 'remove_file';
```

The download surface needs separate policy from tabs and page actions because it can create files, reveal local paths, open files, or delete files.

Example input shape:

```typescript
export const BROWSER_DOWNLOADS_INPUT_SCHEMA = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    query: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    startedAfter: z.string().optional(),
    exists: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('download'),
    url: z.string().url(),
    filename: z.string().optional(),
    saveAs: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('remove_file'),
    downloadId: z.number().int().min(0),
  }),
]);
```

Action-level policy examples:

- `search`: read-only, may expose local download history.
- `download`: external network/file write.
- `open`: externally visible local action.
- `erase`: destructive to download history, not necessarily file contents.
- `remove_file`: destructive to local file contents.

#### `browser_automation`

Use `browser_automation` for durable browser-side behavior: alarms, user scripts, content-script registrations, and page/event triggers that can call back into the agent runtime.

Backed by:

- `AlarmsApiTools`
- `UserScriptsApiTools`
- selected `ScriptingApiTools` content-script registration actions
- extension page/content-script bridge code
- optional `DeclarativeContentApiTools` and `WebNavigationApiTools` later for trigger sources

Representative actions:

```typescript
type BrowserAutomationAction =
  | 'list_tasks'
  | 'schedule_task'
  | 'clear_task'
  | 'run_task_now'
  | 'list_user_scripts'
  | 'register_user_script'
  | 'update_user_script'
  | 'remove_user_script'
  | 'list_page_triggers'
  | 'register_page_trigger'
  | 'remove_page_trigger';
```

This is the main product-specific tool. It should model persistent browser behavior as named, inspectable registrations. It should not hide durable scripts behind opaque one-off calls.

Example input shape:

```typescript
export const BROWSER_AUTOMATION_INPUT_SCHEMA = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('schedule_task'),
    id: z.string().min(1),
    title: z.string().min(1),
    schedule: z.object({
      kind: z.enum(['once', 'interval']),
      when: z.number().optional(),
      periodInMinutes: z.number().min(0.5).optional(),
    }),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('register_user_script'),
    id: z.string().min(1),
    matches: z.array(z.string()).min(1),
    js: z.string(),
    runAt: z.enum(['document_start', 'document_end', 'document_idle']).optional(),
  }),
  z.object({
    action: z.literal('register_page_trigger'),
    id: z.string().min(1),
    matches: z.array(z.string()).min(1),
    event: z.enum(['navigation', 'dom_event', 'selector_match']),
    selector: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
]);
```

Action-level policy examples:

- `list_tasks`, `list_user_scripts`, `list_page_triggers`: read-only.
- `schedule_task`: write effect, not usually high risk by itself.
- `register_user_script`: high-risk durable code execution, requires user approval and host permission.
- `register_page_trigger`: durable open-world trigger, requires approval and clear audit metadata.
- `remove_user_script` and `remove_page_trigger`: destructive to configured automation state.

Chrome `alarms` are not exact background daemons. The runtime should treat scheduled browser-side work as best-effort and idempotent. Automations should be rehydratable from extension storage or product state when the service worker restarts.

### Permission And Approval Middleware

Permissions should be enforced by runtime middleware, not exposed as ordinary model-facing actions.

The model should call the capability it wants:

```typescript
browser_page({
  action: 'run_script',
  target: { tabId: 123 },
  code: 'document.title',
});
```

The runtime should then:

1. Parse and validate input using the action schema.
2. Resolve action-level policy.
3. Derive required Chrome API permissions from the action contract.
4. Derive required host origins from the validated input and current tab state.
5. Check granted permissions with `chrome.permissions.contains`.
6. Prefer `activeTab` or tab-scoped host access where that is sufficient.
7. If access is missing, return a structured permission result instead of executing.
8. Let extension UI, sidepanel, popup, or a browser action request the permission from a user gesture.
9. Re-check permissions and revalidate arguments before retrying execution.
10. Apply approval policy for high-risk actions even when permissions are already granted.

The model can see the permission outcome, but it should not be the authority that grants itself more capability.

Example permission-required result:

```typescript
export const PERMISSION_REQUIRED_OUTPUT_SCHEMA = z.object({
  status: z.literal('permission_required'),
  reason: z.string(),
  missing: z.object({
    permissions: z.array(z.string()).optional(),
    origins: z.array(z.string()).optional(),
  }),
  canRequest: z.boolean(),
  requestId: z.string().optional(),
});
```

The host can use `requestId` to show a permission UI and retry the original validated call after the user grants access. This keeps permission prompts tied to user gestures and prevents the model from treating permissions as just another tool to call.

The package may still expose read-only diagnostic permission contracts for setup screens:

```typescript
permissions_check;
permissions_list;
capabilities_list;
```

The package should not expose permission escalation as a default model-facing tool:

```typescript
permissions_request;
permissions_remove;
add_host_access_request;
remove_host_access_request;
```

Those operations belong in extension UI or host-controlled orchestration.

### Action Policy Metadata

Tool-level MCP annotations are not enough for action-router tools. A router like `browser_workspace` can contain read-only actions and destructive actions at the same time.

The public MCP annotations for a mixed router should be conservative. The runtime should use action-level policy for real decisions.

Example policy type:

```typescript
export type BrowserAgentEffect =
  | 'read'
  | 'write'
  | 'destructive'
  | 'navigation'
  | 'execution'
  | 'download'
  | 'exfiltration'
  | 'persistent_automation';

export type BrowserAgentApproval = 'never' | 'on_missing_permission' | 'on_policy' | 'always';

export interface BrowserAgentActionPolicy<TInput> {
  risk: 'low' | 'medium' | 'high';
  effects: readonly BrowserAgentEffect[];
  permissions?: readonly string[];
  hostPermissions?: readonly string[];
  deriveHostPermissions?: (input: TInput) => readonly string[];
  requiresActiveTab?: boolean;
  approval: BrowserAgentApproval;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}
```

Action policy should be plain data where possible. `deriveHostPermissions` is runtime-only and should not be part of contract-only Worker imports unless represented symbolically.

Contract-only metadata should use symbolic derivation:

```typescript
_meta: {
  extension: {
    groupId: 'browser_page',
    actionId: 'run_script',
    chromeApi: 'scripting',
    permissions: ['scripting'],
    hostPermission: {
      source: 'targetTabOrigin',
      pattern: 'originWildcard',
    },
    requiresActiveTab: true,
  },
}
```

Runtime code can turn that into a concrete origin such as:

```typescript
https://example.com/*
```

### Progressive Discovery

The five browser-agent tools can be the always-on model surface for most sessions.

If the package later exposes many raw Chrome API contracts to the model, it should not load all of them at once. Use progressive discovery:

1. Catalog: return concise capability names and descriptions.
2. Inspect: return the full schema and policy for one selected capability or action.
3. Execute: run the selected action with strict validation.

This lets customers keep access to the long-tail raw Chrome APIs without turning every session into a large ambiguous tool list.

Potential discovery tools:

```typescript
browser_capabilities_search;
browser_capability_inspect;
browser_capability_execute;
```

These should be optional. The primary product surface should remain the five curated tools.

### Relationship To Existing Contracts

The current direct Chrome contracts should not be deleted. They should become the raw building blocks for the facade.

Initial raw groups:

- `bookmarks`
- `history`
- `storage`
- `tabGroups`
- `tabs`
- `windows`

Next useful raw groups:

- `scripting`
- `userScripts`
- `cookies`
- `downloads`
- `alarms`
- `runtime`
- `permissions`, read-only diagnostics only by default

The facade should compose these raw contracts and handlers instead of duplicating browser behavior.

For example, `browser_workspace` can call the same underlying functions currently used by:

- `extension_tool_create_tab`
- `extension_tool_close_tabs`
- `extension_tool_get_all_windows`
- `extension_tool_update_tab_group`

The facade contract should have its own model-facing name, schema, output schema, annotations, and policy. The raw contracts remain exportable for tests, advanced customers, setup UI, and conformance.

### Implementation Sequence

Implement the facade in vertical slices.

1. **Document the target architecture.**
   This section is the target. Keep it updated as the implementation teaches us where the shape is wrong.

2. **Build `browser_workspace` first.**
   It can reuse the already-migrated `tabs`, `windows`, and `tabGroups` contracts. It proves the facade pattern without adding new Chrome permissions.

3. **Add action-level policy metadata and middleware.**
   Start with workspace actions. Return structured `permission_required` and `approval_required` results, even if most workspace actions do not yet need optional permissions.

4. **Build `browser_page` with low-risk observation first.**
   Add snapshot, extract, and screenshot before raw script execution. Then add `run_script`, `insert_css`, and `remove_css` behind the permission gate.

5. **Migrate `scripting` and `userScripts` raw contracts.**
   Use real Chromium e2e tests to capture successful outputs and permission failures. Treat user scripts as durable, inspectable registrations.

6. **Build `browser_automation`.**
   Add alarms and named automation records. Then add page triggers and user-script-backed hooks.

7. **Build `browser_session` and `browser_downloads`.**
   These are high-value but sensitive. Add them after the permission gate and approval path are real.

8. **Add evals.**
   Measure wrong-tool calls, schema validation failures, permission-required flows, number of tool calls, and task success across realistic browser-agent tasks.

### Acceptance Criteria

The facade is ready when:

- The model-facing default surface is five or fewer browser-agent tools.
- Each facade tool uses a Zod discriminated union for actions.
- Every action has an exported input schema, output schema, inferred input type, inferred output type, and action policy.
- Runtime handlers accept schema-derived types directly.
- Permission checks run before handlers touch Chrome APIs.
- Missing permissions return structured output rather than generic text errors.
- Permission requests are performed by UI or host-controlled code from user gestures, not by autonomous model tool calls.
- Mixed-risk routers use conservative MCP annotations and action-level policy for enforcement.
- The raw Chrome API contract catalog remains side-effect free and importable without `chrome`.
- The facade has real Chromium e2e coverage for success, missing permission, and error paths.
- Docs and generated tables derive from contracts, not duplicated strings.

## API Implementation Status

### Available API Tools (62 APIs)

The following Chrome Extension APIs have been fully implemented and are ready to use:

- `AlarmsApiTools` - Set and manage alarms
- `AudioApiTools` - Audio device management
- `BookmarksApiTools` - Manage browser bookmarks
- `BrowsingDataApiTools` - Clear browsing data
- `CertificateProviderApiTools` - Provide certificates for TLS authentication
- `CommandsApiTools` - Manage keyboard shortcuts
- `ContentSettingsApiTools` - Manage content settings
- `ContextMenusApiTools` - Create context menu items
- `CookiesApiTools` - Manage browser cookies
- `DebuggerApiTools` - Debug network and JavaScript
- `DeclarativeContentApiTools` - Take actions based on content
- `DeclarativeNetRequestApiTools` - Modify network requests
- `DesktopCaptureApiTools` - Capture desktop content
- `DevtoolsInspectedWindowApiTools` - Interact with inspected window
- `DevtoolsNetworkApiTools` - Retrieve network information
- `DevtoolsPanelsApiTools` - Create DevTools panels
- `DocumentScanApiTools` - Scan documents
- `DomApiTools` - Access DOM from extensions
- `DownloadsApiTools` - Control file downloads
- `EnterpriseDeviceAttributesApiTools` - Access enterprise device attributes
- `EnterpriseHardwarePlatformApiTools` - Access enterprise hardware info
- `EnterpriseNetworkingAttributesApiTools` - Access enterprise network attributes
- `EnterprisePlatformKeysApiTools` - Enterprise platform keys
- `ExtensionApiTools` - Extension utilities
- `FileBrowserHandlerApiTools` - Handle file browser events
- `FileSystemProviderApiTools` - Provide file systems
- `FontSettingsApiTools` - Manage font settings
- `GcmApiTools` - Google Cloud Messaging
- `HistoryApiTools` - Search and manage browsing history
- `I18nApiTools` - Internationalization utilities
- `IdentityApiTools` - OAuth2 authentication
- `IdleApiTools` - Detect idle state
- `InputImeApiTools` - Input method editor
- `InstanceIDApiTools` - Instance ID operations
- `LoginStateApiTools` - Read login state
- `ManagementApiTools` - Manage extensions
- `NotificationsApiTools` - Create system notifications
- `OffscreenApiTools` - Manage offscreen documents
- `OmniboxApiTools` - Customize address bar
- `PageCaptureApiTools` - Save pages as MHTML
- `PermissionsApiTools` - Request optional permissions
- `PlatformKeysApiTools` - Platform-specific keys
- `PowerApiTools` - Power management
- `PrintingApiTools` - Print documents
- `PrintingMetricsApiTools` - Printing metrics
- `ProxyApiTools` - Manage proxy settings
- `ReadingListApiTools` - Access reading list
- `RuntimeApiTools` - Access extension runtime information
- `ScriptingApiTools` - Execute scripts and inject CSS
- `SearchApiTools` - Search via default provider
- `SessionsApiTools` - Query and restore browser sessions
- `SidePanelApiTools` - Control side panel
- `StorageApiTools` - Access extension storage (local, sync, session)
- `SystemCpuApiTools` - Query CPU information
- `SystemLogApiTools` - Add system log entries
- `SystemMemoryApiTools` - Get memory information
- `SystemStorageApiTools` - Query storage devices
- `TabCaptureApiTools` - Capture tab media streams
- `TabGroupsApiTools` - Manage tab groups
- `TabsApiTools` - Create, update, query, and manage browser tabs
- `TopSitesApiTools` - Access top sites
- `TtsApiTools` - Text-to-speech functionality
- `TtsEngineApiTools` - Implement TTS engine
- `UserScriptsApiTools` - Execute user scripts
- `VpnProviderApiTools` - Implement VPN client
- `WallpaperApiTools` - Set wallpaper
- `WebAuthenticationProxyApiTools` - Web authentication proxy
- `WebNavigationApiTools` - Monitor web navigation
- `WebRequestApiTools` - Intercept and modify requests
- `WindowsApiTools` - Control browser windows

### APIs Under Development (12 APIs)

The following Chrome Extension APIs are not yet implemented or need additional work:

- `AccessibilityFeaturesApiTools` - Manage accessibility features
- `ActionApiTools` - Control extension's action button
- `DevtoolsPerformanceApiTools` - Access performance data
- `DevtoolsRecorderApiTools` - DevTools recorder panel
- `DnsApiTools` - DNS resolution
- `EventsApiTools` - Common event handling
- `ExtensionTypesApiTools` - Extension type definitions
- `PrinterProviderApiTools` - Provide printers
- `PrivacyApiTools` - Control privacy features
- `ProcessesApiTools` - Interact with browser processes
- `SystemDisplayApiTools` - Query display information
- `TypesApiTools` - Chrome type definitions

## Usage

### Server Setup

Create an MCP server in your Chrome extension's background script:

```typescript
import { BookmarksApiTools, StorageApiTools, TabsApiTools } from '@mcp-b/extension-tools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebsocketServerTransport } from '@modelcontextprotocol/sdk/server/websocket.js';

// Create MCP server
const server = new McpServer({
  name: 'chrome-extension-server',
  version: '1.0.0',
});

// Register individual API tools with specific methods enabled
const tabsTools = new TabsApiTools(server, {
  listActiveTabs: true,
  createTab: true,
  updateTab: true,
  closeTabs: true,
  getAllTabs: true,
  navigateHistory: true,
  reloadTab: true,
});
tabsTools.register();

const bookmarksTools = new BookmarksApiTools(server, {
  get: true,
  create: true,
  update: true,
  remove: true,
});
bookmarksTools.register();

const storageTools = new StorageApiTools(server, {
  getStorage: true,
  setStorage: true,
  removeStorage: true,
  clearStorage: true,
});
storageTools.register();

// Connect to transport
const transport = new WebsocketServerTransport({
  port: 3000,
});
await server.connect(transport);
```

### Client Usage

Connect to the server and call the registered tools:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebsocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

// Create and connect client
const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0',
});

const transport = new WebsocketClientTransport(new URL('ws://localhost:3000'));
await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Call extension tools
// Create a new tab
const createResult = await client.callTool({
  name: 'extension_tool_create_tab',
  arguments: {
    url: 'https://example.com',
    active: true,
    pinned: false,
  },
});

// Get all tabs
const tabsResult = await client.callTool({
  name: 'extension_tool_get_all_tabs',
  arguments: {
    currentWindow: true,
  },
});

// Search bookmarks
const bookmarksResult = await client.callTool({
  name: 'extension_tool_search_bookmarks',
  arguments: {
    query: 'example',
  },
});

// Store data
const storageResult = await client.callTool({
  name: 'extension_tool_set_storage',
  arguments: {
    area: 'local',
    data: {
      key1: 'value1',
      key2: { nested: 'object' },
    },
  },
});

// Execute script in active tab
const scriptResult = await client.callTool({
  name: 'extension_tool_execute_script',
  arguments: {
    target: { tabId: undefined }, // defaults to active tab
    func: '() => document.title',
  },
});
```

## Tool Configuration

Each API tool class accepts configuration options for specific methods. Methods are enabled by default; set an option to `false` to omit that action from tool discovery:

```typescript
// TabsApiTools options
interface TabsOptions {
  listActiveTabs?: boolean;
  createTab?: boolean;
  updateTab?: boolean;
  closeTabs?: boolean;
  getAllTabs?: boolean;
  navigateHistory?: boolean;
  reloadTab?: boolean;
  captureVisibleTab?: boolean;
  detectLanguage?: boolean;
  discardTab?: boolean;
  duplicateTab?: boolean;
  getTab?: boolean;
  getZoom?: boolean;
  getZoomSettings?: boolean;
  setZoom?: boolean;
  setZoomSettings?: boolean;
  groupTabs?: boolean;
  ungroupTabs?: boolean;
  highlightTabs?: boolean;
  moveTabs?: boolean;
  sendMessage?: boolean;
}

// Similar options exist for other API tools
```

## Permission Requirements

Each Chrome API requires specific permissions in your extension's manifest.json. Here are some common permissions:

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "alarms",
    "audio",
    "bookmarks",
    "browsingData",
    "certificateProvider",
    "contentSettings",
    "contextMenus",
    "cookies",
    "debugger",
    "declarativeContent",
    "declarativeNetRequest",
    "desktopCapture",
    "downloads",
    "fontSettings",
    "gcm",
    "history",
    "identity",
    "idle",
    "management",
    "notifications",
    "offscreen",
    "pageCapture",
    "permissions",
    "platformKeys",
    "power",
    "printing",
    "printingMetrics",
    "proxy",
    "readingList",
    "scripting",
    "search",
    "sessions",
    "sidePanel",
    "storage",
    "system.cpu",
    "system.memory",
    "system.storage",
    "tabCapture",
    "tabGroups",
    "tabs",
    "topSites",
    "tts",
    "ttsEngine",
    "unlimitedStorage",
    "vpnProvider",
    "wallpaper",
    "webAuthenticationProxy",
    "webNavigation",
    "webRequest"
  ],
  "host_permissions": [
    "<all_urls>" // Required for scripting API and some other APIs
  ],
  "optional_permissions": [
    // Add any permissions you want to request at runtime
  ]
}
```

**Note:** Not all APIs require permissions. Some APIs like `i18n`, `runtime`, and `extension` are available without explicit permissions. Enterprise APIs require the extension to be force-installed via enterprise policy.

## Tool Examples

### Tab Management

```typescript
// List tabs grouped by domain
const result = await client.callTool({
  name: 'extension_tool_list_active_tabs',
  arguments: {},
});

// Update the active tab's URL
const updateResult = await client.callTool({
  name: 'extension_tool_update_tab',
  arguments: {
    url: 'https://new-url.com',
    active: true,
  },
});

// Group multiple tabs
const groupResult = await client.callTool({
  name: 'extension_tool_group_tabs',
  arguments: {
    tabIds: [1, 2, 3],
  },
});
```

### Storage Operations

```typescript
// Get storage data
const data = await client.callTool({
  name: 'extension_tool_get_storage',
  arguments: {
    area: 'local',
    keys: ['setting1', 'setting2'],
  },
});

// Clear all storage
const clearResult = await client.callTool({
  name: 'extension_tool_clear_storage',
  arguments: {
    area: 'local',
    confirm: true,
  },
});
```

### History Search

```typescript
// Search browsing history
const historyResult = await client.callTool({
  name: 'extension_tool_search_history',
  arguments: {
    text: 'github',
    maxResults: 20,
    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last week
  },
});
```

## Architecture

Each API tool class extends `BaseApiTools` which provides:

- **Automatic permission checking** - Verifies API availability before registering tools
- **Consistent error handling** - Standardized error responses
- **Tool registration helpers** - Simplified tool registration process
- **Response formatting** - Consistent response format across all tools

```typescript
export abstract class BaseApiTools {
  protected abstract apiName: string;

  abstract checkAvailability(): ApiAvailability;
  abstract registerTools(): void;

  register(): void {
    const availability = this.checkAvailability();
    if (availability.available) {
      console.log(`Registering ${this.apiName} API tools...`);
      this.registerTools();
    } else {
      console.warn(`${this.apiName} API not available:`, availability.message);
    }
  }
}
```

## Error Handling

All tools include comprehensive error handling and return structured error responses:

```typescript
try {
  const result = await client.callTool({
    name: 'extension_tool_create_tab',
    arguments: { url: 'invalid-url' },
  });
} catch (error) {
  // Error response will include:
  // - error: true
  // - content: [{ type: 'text', text: 'Error message' }]
}
```

## Complete Example

Here's a complete example of setting up a Chrome extension with MCP tools:

```typescript
// background.js - Extension background script
import {
  BookmarksApiTools,
  HistoryApiTools,
  ScriptingApiTools,
  StorageApiTools,
  TabsApiTools,
} from '@mcp-b/extension-tools';
import { ExtensionServerTransport } from '@mcp-b/transports';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

async function setupMcpServer() {
  const server = new McpServer({
    name: 'my-chrome-extension',
    version: '1.0.0',
  });

  // Register multiple API tools
  const apis = [
    new TabsApiTools(server, {
      listActiveTabs: true,
      createTab: true,
      updateTab: true,
      closeTabs: true,
      getAllTabs: true,
    }),
    new BookmarksApiTools(server, {
      get: true,
      create: true,
    }),
    new StorageApiTools(server, {
      getStorage: true,
      setStorage: true,
    }),
    new HistoryApiTools(server, {
      search: true,
    }),
    new ScriptingApiTools(server, {
      executeScript: true,
      insertCSS: true,
    }),
  ];

  // Register all tools
  apis.forEach((api) => api.register());

  // Connect transport
  const transport = new ExtensionServerTransport();
  await server.connect(transport);

  console.log('MCP server ready with Chrome extension tools');
}

setupMcpServer();
```

## TypeScript Support

This package is written in TypeScript and includes full type definitions for all APIs and tool parameters.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Frequently Asked Questions

### Which AI agents can use these tools?

Any MCP-compatible client, including:

- **Claude Desktop** and Claude.ai
- **Cursor** IDE
- **VS Code Copilot**
- **Gemini** applications
- **Windsurf**, **Cline**, and other MCP clients

### Do I need to enable all 62 APIs?

No! Each API tool class accepts configuration options. Enable only what you need:

```typescript
new TabsApiTools(server, {
  listActiveTabs: true, // Only enable tab listing
  createTab: false, // Disable tab creation
});
```

### Is Manifest V3 supported?

Yes! All tools are compatible with Chrome's Manifest V3 extension platform.

### How do AI agents connect to my extension?

Use `@mcp-b/transports` for in-browser communication, or expose a WebSocket server for desktop AI agents.

### What about Firefox and Edge?

The APIs target Chrome, but many also work in Firefox (via WebExtensions) and Edge (Chromium-based). Check browser compatibility for specific APIs.

## Comparison with Alternatives

| Feature              | @mcp-b/extension-tools | Raw Chrome APIs | Puppeteer |
| -------------------- | ---------------------- | --------------- | --------- |
| MCP Protocol Support | Yes                    | No              | No        |
| Type Safety          | Full TypeScript        | Partial         | Full      |
| Permission Handling  | Automatic              | Manual          | N/A       |
| Error Formatting     | Structured             | Raw             | Varies    |
| AI Agent Ready       | Yes                    | Manual          | Manual    |

## Related Packages

- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - Browser-specific MCP transports
- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol)

## License

MIT - see [LICENSE](../../LICENSE) for details

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
- [Discord Community](https://discord.gg/a9fBR6Bw)
