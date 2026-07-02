import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { z } from 'zod';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  USER_SCRIPTS_TOOL_CONTRACTS,
  type UserScriptsExecuteInput,
  type UserScriptsGetScriptsInput,
  type UserScriptsRegisterInput,
  type UserScriptsUnregisterInput,
  type UserScriptsUpdateInput,
} from '../contracts/user-scripts';

export interface UserScriptsApiToolsOptions {
  register?: boolean;
  getScripts?: boolean;
  update?: boolean;
  unregister?: boolean;
  configureWorld?: boolean;
  getWorldConfigurations?: boolean;
  resetWorldConfiguration?: boolean;
  execute?: boolean;
}

export class UserScriptsApiTools extends BaseApiTools<UserScriptsApiToolsOptions> {
  protected apiName = 'UserScripts';

  constructor(server: McpServer, options: UserScriptsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    try {
      // Check if API exists
      if (!chrome.userScripts) {
        return {
          available: false,
          message: 'chrome.userScripts API is not defined',
          details:
            'This extension needs the "userScripts" permission in its manifest.json and users must enable the appropriate toggle (Developer mode for Chrome <138 or Allow User Scripts for Chrome 138+)',
        };
      }

      // The docs-recommended version-proof check: this call throws when the
      // permission or user toggle is not enabled.
      chrome.userScripts.getScripts();

      return {
        available: true,
        message: 'UserScripts API is fully available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to access chrome.userScripts API',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('register')) {
      this.registerExtensionTool(USER_SCRIPTS_TOOL_CONTRACTS.register, (params) =>
        this.handleRegister(params)
      );
    }

    if (this.shouldRegisterTool('getScripts')) {
      this.registerExtensionTool(USER_SCRIPTS_TOOL_CONTRACTS.getScripts, (params) =>
        this.handleGetScripts(params)
      );
    }

    if (this.shouldRegisterTool('update')) {
      this.registerExtensionTool(USER_SCRIPTS_TOOL_CONTRACTS.update, (params) =>
        this.handleUpdate(params)
      );
    }

    if (this.shouldRegisterTool('unregister')) {
      this.registerExtensionTool(USER_SCRIPTS_TOOL_CONTRACTS.unregister, (params) =>
        this.handleUnregister(params)
      );
    }

    if (this.shouldRegisterTool('execute')) {
      this.registerExtensionTool(USER_SCRIPTS_TOOL_CONTRACTS.execute, (params) =>
        this.handleExecute(params)
      );
    }

    if (this.shouldRegisterTool('configureWorld')) {
      this.registerConfigureWorld();
    }

    if (this.shouldRegisterTool('getWorldConfigurations')) {
      this.registerGetWorldConfigurations();
    }

    if (this.shouldRegisterTool('resetWorldConfiguration')) {
      this.registerResetWorldConfiguration();
    }
  }

  // ===== Contract-backed action handlers =====

  private async handleRegister({ scripts }: UserScriptsRegisterInput) {
    await chrome.userScripts.register(scripts as chrome.userScripts.RegisteredUserScript[]);

    return this.formatSuccess('User scripts registered successfully', {
      scriptIds: scripts.map((script) => script.id),
    });
  }

  private async handleGetScripts({ ids }: UserScriptsGetScriptsInput) {
    const filter: chrome.userScripts.UserScriptFilter = {};
    if (ids !== undefined) {
      filter.ids = ids;
    }

    const scripts = await chrome.userScripts.getScripts(filter);

    return this.formatJson({
      count: scripts.length,
      scripts: scripts.map((script) => ({
        id: script.id,
        matches: script.matches,
        allFrames: script.allFrames,
        excludeMatches: script.excludeMatches,
        includeGlobs: script.includeGlobs,
        excludeGlobs: script.excludeGlobs,
        runAt: script.runAt,
        world: script.world,
        worldId: script.worldId,
        jsSourcesCount: script.js?.length || 0,
      })),
    });
  }

  private async handleUpdate({ scripts }: UserScriptsUpdateInput) {
    await chrome.userScripts.update(scripts as chrome.userScripts.RegisteredUserScript[]);

    return this.formatSuccess('User scripts updated successfully', {
      scriptIds: scripts.map((script) => script.id),
    });
  }

  private async handleUnregister({ ids }: UserScriptsUnregisterInput) {
    const filter: chrome.userScripts.UserScriptFilter = {};
    if (ids !== undefined) {
      filter.ids = ids;
    }

    // Read the matching ids before unregistering so the result names what was removed.
    const scriptsBefore = await chrome.userScripts.getScripts(filter);
    await chrome.userScripts.unregister(filter);

    return this.formatSuccess('User scripts unregistered successfully', {
      scriptIds: scriptsBefore.map((script) => script.id),
    });
  }

  private async handleExecute(input: UserScriptsExecuteInput) {
    const injection: chrome.userScripts.UserScriptInjection = {
      target: input.target as chrome.userScripts.InjectionTarget,
      // Zod enforces min(1); the tuple cast satisfies chrome's non-empty type.
      js: input.js as [chrome.userScripts.ScriptSource, ...chrome.userScripts.ScriptSource[]],
    };
    if (input.world !== undefined) injection.world = input.world;
    if (input.worldId !== undefined) injection.worldId = input.worldId;
    if (input.injectImmediately !== undefined) {
      injection.injectImmediately = input.injectImmediately;
    }

    const results = await chrome.userScripts.execute(injection);

    return this.formatJson({
      injectionCount: results.length,
      results: results.map((result) => ({
        frameId: result.frameId,
        documentId: result.documentId,
        error: result.error,
        result: result.result,
      })),
    });
  }

  // ===== Legacy world-configuration tools (no chrome-methods contract) =====

  private registerConfigureWorld(): void {
    const inputSchema = z.object({
      csp: z.string().optional().describe('Content Security Policy for the world'),
      messaging: z
        .boolean()
        .optional()
        .describe('Whether messaging APIs are exposed (default: false)'),
      worldId: z.string().optional().describe('ID of the specific user script world to update'),
    });

    this.server.registerTool({
      name: 'extension_tool_configure_user_script_world',
      description: 'Configure the USER_SCRIPT execution environment',
      inputSchema: { type: 'object' },
      execute: async (args: Record<string, unknown>) => {
        try {
          const { csp, messaging, worldId } = inputSchema.parse(args);
          const properties: chrome.userScripts.WorldProperties = {};
          if (csp !== undefined) properties.csp = csp;
          if (messaging !== undefined) properties.messaging = messaging;
          if (worldId !== undefined) properties.worldId = worldId;

          await chrome.userScripts.configureWorld(properties);

          return this.formatSuccess('User script world configured successfully', {
            worldId: worldId || 'default',
            csp: csp,
            messaging: messaging,
          });
        } catch (error) {
          return this.formatError(error);
        }
      },
    });
  }

  private registerGetWorldConfigurations(): void {
    this.server.registerTool({
      name: 'extension_tool_get_world_configurations',
      description: 'Retrieve all registered world configurations',
      inputSchema: { type: 'object' },
      execute: async () => {
        try {
          const worlds = await chrome.userScripts.getWorldConfigurations();

          return this.formatJson({
            count: worlds.length,
            worlds: worlds.map((world) => ({
              worldId: world.worldId,
              csp: world.csp,
              messaging: world.messaging,
            })),
          });
        } catch (error) {
          return this.formatError(error);
        }
      },
    });
  }

  private registerResetWorldConfiguration(): void {
    const inputSchema = z.object({
      worldId: z
        .string()
        .optional()
        .describe('ID of the user script world to reset. If omitted, resets the default world'),
    });

    this.server.registerTool({
      name: 'extension_tool_reset_world_configuration',
      description: 'Reset the configuration for a user script world to defaults',
      inputSchema: { type: 'object' },
      execute: async (args: Record<string, unknown>) => {
        try {
          const { worldId = 'default' } = inputSchema.parse(args);
          await chrome.userScripts.resetWorldConfiguration(worldId);

          return this.formatSuccess('World configuration reset successfully', {
            worldId: worldId || 'default',
          });
        } catch (error) {
          return this.formatError(error);
        }
      },
    });
  }
}
