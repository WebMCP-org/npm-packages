import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  cookieContracts,
  type GetAllCookiesInput,
  type GetCookieInput,
  type GetPartitionKeyInput,
  type RemoveCookieInput,
  type SetCookieInput,
} from '../contracts/cookies';

export interface CookiesApiToolsOptions {
  getCookie?: boolean;
  getAllCookies?: boolean;
  getAllCookieStores?: boolean;
  getPartitionKey?: boolean;
  setCookie?: boolean;
  removeCookie?: boolean;
}

export class CookiesApiTools extends BaseApiTools<CookiesApiToolsOptions> {
  protected apiName = 'Cookies';

  constructor(server: McpServer, options: CookiesApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.cookies?.getAllCookieStores) {
      return {
        available: false,
        message: 'chrome.cookies API is not defined',
        details: 'This extension needs the "cookies" permission and host permissions',
      };
    }
    return { available: true, message: 'Cookies API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('getCookie'))
      this.registerContractTool(cookieContracts.getCookie, (input) => this.getCookie(input));
    if (this.shouldRegisterTool('getAllCookies'))
      this.registerContractTool(cookieContracts.getAllCookies, (input) =>
        this.getAllCookies(input)
      );
    if (this.shouldRegisterTool('getAllCookieStores'))
      this.registerContractTool(cookieContracts.getAllCookieStores, () =>
        this.getAllCookieStores()
      );
    if (this.shouldRegisterTool('getPartitionKey') && chrome.cookies.getPartitionKey)
      this.registerContractTool(cookieContracts.getPartitionKey, (input) =>
        this.getPartitionKey(input)
      );
    if (this.shouldRegisterTool('setCookie'))
      this.registerContractTool(cookieContracts.setCookie, (input) => this.setCookie(input));
    if (this.shouldRegisterTool('removeCookie'))
      this.registerContractTool(cookieContracts.removeCookie, (input) => this.removeCookie(input));
  }

  private toCookie(cookie: chrome.cookies.Cookie) {
    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session: cookie.session,
      expirationDate: cookie.expirationDate,
      hostOnly: cookie.hostOnly,
      storeId: cookie.storeId,
      partitionKey: cookie.partitionKey,
    };
  }

  private async getCookie(input: GetCookieInput) {
    const cookie = await new Promise<chrome.cookies.Cookie | undefined>((resolve, reject) => {
      chrome.cookies.get(input, (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value ?? undefined)
      );
    });
    return { cookie: cookie ? this.toCookie(cookie) : null, name: input.name, url: input.url };
  }

  private async getAllCookies(input: GetAllCookiesInput) {
    const cookies = await new Promise<chrome.cookies.Cookie[]>((resolve, reject) => {
      chrome.cookies.getAll(input, (items) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(items)
      );
    });
    return { count: cookies.length, cookies: cookies.map((cookie) => this.toCookie(cookie)) };
  }

  private async getAllCookieStores() {
    const cookieStores = await new Promise<chrome.cookies.CookieStore[]>((resolve, reject) => {
      chrome.cookies.getAllCookieStores((stores) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(stores)
      );
    });
    return {
      count: cookieStores.length,
      cookieStores: cookieStores.map((store) => ({ id: store.id, tabIds: store.tabIds })),
    };
  }

  private async getPartitionKey(input: GetPartitionKeyInput) {
    const result = await new Promise<{ partitionKey: chrome.cookies.CookiePartitionKey }>(
      (resolve, reject) => {
        chrome.cookies.getPartitionKey(input, (value) =>
          chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message))
            : resolve(value)
        );
      }
    );
    return { partitionKey: result.partitionKey };
  }

  private async setCookie(input: SetCookieInput) {
    const cookie = await new Promise<chrome.cookies.Cookie | undefined>((resolve, reject) => {
      chrome.cookies.set(input, (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value ?? undefined)
      );
    });
    if (!cookie) throw new Error('Failed to set cookie');
    return { cookie: this.toCookie(cookie) };
  }

  private async removeCookie(input: RemoveCookieInput) {
    const result = await new Promise<chrome.cookies.Details | undefined>((resolve, reject) => {
      chrome.cookies.remove(input, (value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value ?? undefined)
      );
    });
    return {
      removed: Boolean(result),
      name: result?.name ?? input.name,
      url: result?.url ?? input.url,
      storeId: result?.storeId ?? input.storeId,
      partitionKey: result?.partitionKey ?? input.partitionKey,
    };
  }
}
