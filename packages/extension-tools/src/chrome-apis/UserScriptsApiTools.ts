import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  userScriptContracts,
  type ConfigureWorldInput,
  type GetUserScriptsInput,
  type RegisterUserScriptsInput,
  type ResetWorldConfigurationInput,
  type UnregisterUserScriptsInput,
  type UpdateUserScriptsInput,
  type UserScriptExecuteInput,
} from '../contracts/userScripts';

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
    if (!chrome.userScripts?.getScripts) {
      return {
        available: false,
        message: 'chrome.userScripts API is not defined',
        details:
          'This extension needs "userScripts" permission and the browser user-scripts toggle',
      };
    }
    return { available: true, message: 'UserScripts API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('register'))
      this.registerContractTool(userScriptContracts.register, (input) =>
        this.registerScripts(input)
      );
    if (this.shouldRegisterTool('getScripts'))
      this.registerContractTool(userScriptContracts.getScripts, (input) => this.getScripts(input));
    if (this.shouldRegisterTool('update'))
      this.registerContractTool(userScriptContracts.update, (input) => this.updateScripts(input));
    if (this.shouldRegisterTool('unregister'))
      this.registerContractTool(userScriptContracts.unregister, (input) =>
        this.unregisterScripts(input)
      );
    if (this.shouldRegisterTool('configureWorld'))
      this.registerContractTool(userScriptContracts.configureWorld, (input) =>
        this.configureWorld(input)
      );
    if (this.shouldRegisterTool('getWorldConfigurations'))
      this.registerContractTool(userScriptContracts.getWorldConfigurations, () =>
        this.getWorldConfigurations()
      );
    if (this.shouldRegisterTool('resetWorldConfiguration'))
      this.registerContractTool(userScriptContracts.resetWorldConfiguration, (input) =>
        this.resetWorldConfiguration(input)
      );
    if (this.shouldRegisterTool('execute'))
      this.registerContractTool(userScriptContracts.execute, (input) => this.execute(input));
  }

  public async getScriptsRaw(input: GetUserScriptsInput) {
    return chrome.userScripts.getScripts(input);
  }

  private toScript(script: chrome.userScripts.RegisteredUserScript) {
    return {
      id: script.id,
      matches: script.matches,
      allFrames: script.allFrames,
      excludeMatches: script.excludeMatches,
      includeGlobs: script.includeGlobs,
      excludeGlobs: script.excludeGlobs,
      runAt: script.runAt,
      world: script.world,
      worldId: script.worldId,
      jsSourcesCount: script.js?.length ?? 0,
    };
  }

  public async registerScripts({ scripts }: RegisterUserScriptsInput) {
    await chrome.userScripts.register(scripts);
    return { count: scripts.length, scriptIds: scripts.map((script) => script.id) };
  }

  public async getScripts(input: GetUserScriptsInput) {
    const scripts = await this.getScriptsRaw(input);
    return { count: scripts.length, scripts: scripts.map((script) => this.toScript(script)) };
  }

  public async updateScripts({ scripts }: UpdateUserScriptsInput) {
    await chrome.userScripts.update(scripts);
    return { count: scripts.length, scriptIds: scripts.map((script) => script.id) };
  }

  public async unregisterScripts(input: UnregisterUserScriptsInput) {
    const before = await this.getScriptsRaw(input);
    await chrome.userScripts.unregister(input);
    return { count: before.length, scriptIds: before.map((script) => script.id) };
  }

  public async configureWorld(input: ConfigureWorldInput) {
    await chrome.userScripts.configureWorld(input);
    return { worldId: input.worldId, csp: input.csp, messaging: input.messaging };
  }

  public async getWorldConfigurations() {
    const worlds = await chrome.userScripts.getWorldConfigurations();
    return {
      count: worlds.length,
      worlds: worlds.map((world) => ({
        worldId: world.worldId,
        csp: world.csp,
        messaging: world.messaging,
      })),
    };
  }

  public async resetWorldConfiguration({ worldId }: ResetWorldConfigurationInput) {
    await chrome.userScripts.resetWorldConfiguration(worldId);
    return { ok: true, message: `World configuration reset for ${worldId || 'default'}` };
  }

  public async execute(input: UserScriptExecuteInput) {
    const results = await chrome.userScripts.execute(input);
    return {
      injectionCount: results.length,
      results: results.map((result) => ({
        frameId: result.frameId,
        documentId: result.documentId,
        result: result.result,
        error: result.error,
      })),
    };
  }
}
