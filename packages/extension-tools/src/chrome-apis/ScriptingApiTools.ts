import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  scriptingContracts,
  type CssInjectionInput,
  type ExecuteScriptInput,
  type ExecuteUserScriptInput,
} from '../contracts/scripting';

export interface ScriptingApiToolsOptions {
  executeScript?: boolean;
  executeUserScript?: boolean;
  insertCSS?: boolean;
  removeCSS?: boolean;
}

export class ScriptingApiTools extends BaseApiTools<ScriptingApiToolsOptions> {
  protected apiName = 'Scripting';

  constructor(server: McpServer, options: ScriptingApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.scripting?.executeScript) {
      return {
        available: false,
        message: 'chrome.scripting API is not defined',
        details: 'This extension needs the "scripting" permission',
      };
    }
    return { available: true, message: 'Scripting API is available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('executeScript'))
      this.registerContractTool(scriptingContracts.executeScript, (input) =>
        this.executeScript(input)
      );
    if (this.shouldRegisterTool('executeUserScript'))
      this.registerContractTool(scriptingContracts.executeUserScript, (input) =>
        this.executeUserScript(input)
      );
    if (this.shouldRegisterTool('insertCSS'))
      this.registerContractTool(scriptingContracts.insertCSS, (input) => this.insertCSS(input));
    if (this.shouldRegisterTool('removeCSS'))
      this.registerContractTool(scriptingContracts.removeCSS, (input) => this.removeCSS(input));
  }

  private async activeTabId(tabId?: number): Promise<number> {
    if (tabId !== undefined) return tabId;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) throw new Error('No active tab found');
    return activeTab.id;
  }

  private toInjectionResults(results: chrome.scripting.InjectionResult[]) {
    return {
      injectionCount: results.length,
      results: results.map((result) => ({
        frameId: result.frameId,
        documentId: result.documentId,
        result: result.result,
      })),
    };
  }

  public async executeScript({
    tabId,
    code,
    allFrames = false,
    world = 'MAIN',
  }: ExecuteScriptInput) {
    const resolvedTabId = await this.activeTabId(tabId);
    const run = (source: string) => {
      try {
        return (globalThis.Function(`"use strict"; return (${source});`) as () => unknown)();
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };
    const results = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId, allFrames },
      func: run,
      args: [code],
      world,
    });
    return this.toInjectionResults(results);
  }

  public async executeUserScript({
    tabId,
    code,
    allFrames = false,
    world = 'USER_SCRIPT',
  }: ExecuteUserScriptInput) {
    if (!chrome.userScripts?.execute) {
      throw new Error(
        'chrome.userScripts.execute API is not available. Enable Allow User Scripts for this extension.'
      );
    }
    const resolvedTabId = await this.activeTabId(tabId);
    const results = await chrome.userScripts.execute({
      target: { tabId: resolvedTabId, allFrames },
      js: [{ code }],
      world,
      injectImmediately: true,
    });
    return this.toInjectionResults(results);
  }

  public async insertCSS({ tabId, css, allFrames = false }: CssInjectionInput) {
    const resolvedTabId = await this.activeTabId(tabId);
    await chrome.scripting.insertCSS({ target: { tabId: resolvedTabId, allFrames }, css });
    return { ok: true, message: `CSS inserted into tab ${resolvedTabId}` };
  }

  public async removeCSS({ tabId, css, allFrames = false }: CssInjectionInput) {
    const resolvedTabId = await this.activeTabId(tabId);
    await chrome.scripting.removeCSS({ target: { tabId: resolvedTabId, allFrames }, css });
    return { ok: true, message: `CSS removed from tab ${resolvedTabId}` };
  }
}
