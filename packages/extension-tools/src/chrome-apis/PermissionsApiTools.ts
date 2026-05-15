import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  permissionContracts,
  type HostAccessRequestInput,
  type PermissionsObjectInput,
} from '../contracts/permissions';

export interface PermissionsApiToolsOptions {
  request?: boolean;
  contains?: boolean;
  getAll?: boolean;
  remove?: boolean;
  addHostAccessRequest?: boolean;
  removeHostAccessRequest?: boolean;
}

export class PermissionsApiTools extends BaseApiTools<PermissionsApiToolsOptions> {
  protected apiName = 'Permissions';

  constructor(
    server: McpServer,
    options: PermissionsApiToolsOptions = {
      request: false,
      remove: false,
      addHostAccessRequest: false,
      removeHostAccessRequest: false,
    }
  ) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.permissions?.getAll) {
      return {
        available: false,
        message: 'chrome.permissions API is not defined',
        details: 'This extension needs the "permissions" permission',
      };
    }
    return { available: true, message: 'Permissions API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('request'))
      this.registerContractTool(permissionContracts.request, (input) => this.request(input));
    if (this.shouldRegisterTool('contains'))
      this.registerContractTool(permissionContracts.contains, (input) => this.contains(input));
    if (this.shouldRegisterTool('getAll'))
      this.registerContractTool(permissionContracts.getAll, () => this.getAll());
    if (this.shouldRegisterTool('remove'))
      this.registerContractTool(permissionContracts.remove, (input) => this.remove(input));
    if (this.shouldRegisterTool('addHostAccessRequest'))
      this.registerContractTool(permissionContracts.addHostAccessRequest, (input) =>
        this.addHostAccessRequest(input)
      );
    if (this.shouldRegisterTool('removeHostAccessRequest'))
      this.registerContractTool(permissionContracts.removeHostAccessRequest, (input) =>
        this.removeHostAccessRequest(input)
      );
  }

  private toPermissions(input: PermissionsObjectInput): chrome.permissions.Permissions {
    return {
      ...(input.permissions?.length
        ? { permissions: input.permissions as chrome.runtime.ManifestPermissions[] }
        : {}),
      ...(input.origins?.length ? { origins: input.origins } : {}),
    };
  }

  public async request(input: PermissionsObjectInput) {
    const granted = await new Promise<boolean>((resolve, reject) => {
      chrome.permissions.request(this.toPermissions(input), (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return { ok: granted, message: granted ? 'Permissions granted' : 'Permissions denied' };
  }

  public async contains(input: PermissionsObjectInput) {
    const hasPermissions = await new Promise<boolean>((resolve, reject) => {
      chrome.permissions.contains(this.toPermissions(input), (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return {
      hasPermissions,
      checkedPermissions: input.permissions ?? [],
      checkedOrigins: input.origins ?? [],
    };
  }

  public async getAll() {
    const permissions = await new Promise<chrome.permissions.Permissions>((resolve, reject) => {
      chrome.permissions.getAll((value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return {
      permissions: permissions.permissions ?? [],
      origins: permissions.origins ?? [],
      permissionsCount: permissions.permissions?.length ?? 0,
      originsCount: permissions.origins?.length ?? 0,
    };
  }

  public async remove(input: PermissionsObjectInput) {
    const removed = await new Promise<boolean>((resolve, reject) => {
      chrome.permissions.remove(this.toPermissions(input), (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return { ok: removed, message: removed ? 'Permissions removed' : 'Permissions not removed' };
  }

  public async addHostAccessRequest(input: HostAccessRequestInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.permissions.addHostAccessRequest(input, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: 'Host access request added' };
  }

  public async removeHostAccessRequest(input: HostAccessRequestInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.permissions.removeHostAccessRequest(input, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: 'Host access request removed' };
  }
}
