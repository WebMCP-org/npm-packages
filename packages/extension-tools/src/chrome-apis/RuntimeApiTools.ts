import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  runtimeContracts,
  type RuntimeConnectInput,
  type RuntimeConnectNativeInput,
  type RuntimeGetContextsInput,
  type RuntimeGetUrlInput,
  type RuntimeRestartAfterDelayInput,
  type RuntimeSendMessageInput,
  type RuntimeSendNativeMessageInput,
  type RuntimeSetUninstallUrlInput,
} from '../contracts/runtime';

export interface RuntimeApiToolsOptions {
  connect?: boolean;
  connectNative?: boolean;
  getContexts?: boolean;
  getManifest?: boolean;
  getPackageDirectoryEntry?: boolean;
  getPlatformInfo?: boolean;
  getURL?: boolean;
  openOptionsPage?: boolean;
  reload?: boolean;
  requestUpdateCheck?: boolean;
  restart?: boolean;
  restartAfterDelay?: boolean;
  sendMessage?: boolean;
  sendNativeMessage?: boolean;
  setUninstallURL?: boolean;
}

export class RuntimeApiTools extends BaseApiTools<RuntimeApiToolsOptions> {
  protected apiName = 'Runtime';

  constructor(server: McpServer, options: RuntimeApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.runtime?.getManifest)
      return { available: false, message: 'chrome.runtime API is not defined' };
    return { available: true, message: 'Runtime API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('connect'))
      this.registerContractTool(runtimeContracts.connect, (input) => this.connect(input));
    if (this.shouldRegisterTool('connectNative'))
      this.registerContractTool(runtimeContracts.connectNative, (input) =>
        this.connectNative(input)
      );
    if (this.shouldRegisterTool('getContexts'))
      this.registerContractTool(runtimeContracts.getContexts, (input) => this.getContexts(input));
    if (this.shouldRegisterTool('getManifest'))
      this.registerContractTool(runtimeContracts.getManifest, () => this.getManifest());
    if (this.shouldRegisterTool('getPackageDirectoryEntry'))
      this.registerContractTool(runtimeContracts.getPackageDirectoryEntry, () =>
        this.getPackageDirectoryEntry()
      );
    if (this.shouldRegisterTool('getPlatformInfo'))
      this.registerContractTool(runtimeContracts.getPlatformInfo, () => this.getPlatformInfo());
    if (this.shouldRegisterTool('getURL'))
      this.registerContractTool(runtimeContracts.getURL, (input) => this.getURL(input));
    if (this.shouldRegisterTool('openOptionsPage'))
      this.registerContractTool(runtimeContracts.openOptionsPage, () => this.openOptionsPage());
    if (this.shouldRegisterTool('reload'))
      this.registerContractTool(runtimeContracts.reload, () => this.reload());
    if (this.shouldRegisterTool('requestUpdateCheck'))
      this.registerContractTool(runtimeContracts.requestUpdateCheck, () =>
        this.requestUpdateCheck()
      );
    if (this.shouldRegisterTool('restart'))
      this.registerContractTool(runtimeContracts.restart, () => this.restart());
    if (this.shouldRegisterTool('restartAfterDelay'))
      this.registerContractTool(runtimeContracts.restartAfterDelay, (input) =>
        this.restartAfterDelay(input)
      );
    if (this.shouldRegisterTool('sendMessage'))
      this.registerContractTool(runtimeContracts.sendMessage, (input) => this.sendMessage(input));
    if (this.shouldRegisterTool('sendNativeMessage'))
      this.registerContractTool(runtimeContracts.sendNativeMessage, (input) =>
        this.sendNativeMessage(input)
      );
    if (this.shouldRegisterTool('setUninstallURL'))
      this.registerContractTool(runtimeContracts.setUninstallURL, (input) =>
        this.setUninstallURL(input)
      );
  }

  public connect({ extensionId, name, includeTlsChannelId }: RuntimeConnectInput) {
    const connectInfo = {
      ...(name !== undefined ? { name } : {}),
      ...(includeTlsChannelId !== undefined ? { includeTlsChannelId } : {}),
    };
    const port = extensionId
      ? chrome.runtime.connect(extensionId, connectInfo)
      : chrome.runtime.connect(connectInfo);
    return Promise.resolve({ portName: port.name, extensionId: extensionId ?? 'own extension' });
  }

  public connectNative({ application }: RuntimeConnectNativeInput) {
    const port = chrome.runtime.connectNative(application);
    return Promise.resolve({ portName: port.name, extensionId: application });
  }

  public async getContexts(input: RuntimeGetContextsInput) {
    const contexts = await new Promise<chrome.runtime.ExtensionContext[]>((resolve, reject) => {
      chrome.runtime.getContexts(input, (items) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(items)
      );
    });
    return {
      count: contexts.length,
      contexts: contexts.map((context) => ({
        contextId: context.contextId,
        contextType: context.contextType,
        documentId: context.documentId,
        documentOrigin: context.documentOrigin,
        documentUrl: context.documentUrl,
        frameId: context.frameId,
        incognito: context.incognito,
        tabId: context.tabId,
        windowId: context.windowId,
      })),
    };
  }

  public getManifest() {
    const manifest = chrome.runtime.getManifest();
    return Promise.resolve({
      manifest,
      name: manifest.name,
      version: manifest.version,
      manifestVersion: manifest.manifest_version,
      description: manifest.description,
      permissions: manifest.permissions ?? [],
      hostPermissions: manifest.host_permissions ?? [],
    });
  }

  public async getPackageDirectoryEntry() {
    const entry = await new Promise<DirectoryEntry>((resolve, reject) => {
      chrome.runtime.getPackageDirectoryEntry((value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return {
      name: entry.name,
      fullPath: entry.fullPath,
      isDirectory: entry.isDirectory,
      isFile: entry.isFile,
    };
  }

  public async getPlatformInfo() {
    const info = await new Promise<chrome.runtime.PlatformInfo>((resolve, reject) => {
      chrome.runtime.getPlatformInfo((value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return { os: info.os, arch: info.arch, nacl_arch: info.nacl_arch };
  }

  public getURL({ path }: RuntimeGetUrlInput) {
    return Promise.resolve({ relativePath: path, fullUrl: chrome.runtime.getURL(path) });
  }

  public async openOptionsPage() {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.openOptionsPage(() =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: 'Options page opened' };
  }

  public reload() {
    chrome.runtime.reload();
    return Promise.resolve({ ok: true, message: 'Extension reload initiated' });
  }

  public async requestUpdateCheck() {
    const result = await new Promise<chrome.runtime.RequestUpdateCheckStatus>((resolve, reject) => {
      chrome.runtime.requestUpdateCheck((status, details) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve({ status, version: details?.version })
      );
    });
    return result;
  }

  public restart() {
    chrome.runtime.restart();
    return Promise.resolve({ ok: true, message: 'Device restart initiated' });
  }

  public async restartAfterDelay({ seconds }: RuntimeRestartAfterDelayInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.restartAfterDelay(seconds, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return {
      ok: true,
      message: seconds === -1 ? 'Scheduled restart cancelled' : 'Device restart scheduled',
    };
  }

  public async sendMessage({ message, extensionId, includeTlsChannelId }: RuntimeSendMessageInput) {
    const response = await new Promise<unknown>((resolve, reject) => {
      const options = includeTlsChannelId === undefined ? undefined : { includeTlsChannelId };
      const callback = (value: unknown) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value);
      if (extensionId) chrome.runtime.sendMessage(extensionId, message, options, callback);
      else chrome.runtime.sendMessage(message, options, callback);
    });
    return { messageSent: message, response, extensionId: extensionId ?? 'own extension' };
  }

  public async sendNativeMessage({ application, message }: RuntimeSendNativeMessageInput) {
    const response = await new Promise<unknown>((resolve, reject) => {
      chrome.runtime.sendNativeMessage(application, message, (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return { application, messageSent: message, response };
  }

  public async setUninstallURL({ url }: RuntimeSetUninstallUrlInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.setUninstallURL(url, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: 'Uninstall URL set' };
  }
}
