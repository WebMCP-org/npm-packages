import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  downloadContracts,
  type DownloadFileInput,
  type DownloadIdInput,
  type EraseDownloadsInput,
  type GetFileIconInput,
  type SearchDownloadsInput,
  type SetUiOptionsInput,
} from '../contracts/downloads';

export interface DownloadsApiToolsOptions {
  download?: boolean;
  search?: boolean;
  pause?: boolean;
  resume?: boolean;
  cancel?: boolean;
  getFileIcon?: boolean;
  open?: boolean;
  show?: boolean;
  showDefaultFolder?: boolean;
  erase?: boolean;
  removeFile?: boolean;
  acceptDanger?: boolean;
  setUiOptions?: boolean;
}

export class DownloadsApiTools extends BaseApiTools<DownloadsApiToolsOptions> {
  protected apiName = 'Downloads';

  constructor(server: McpServer, options: DownloadsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.downloads?.search) {
      return {
        available: false,
        message: 'chrome.downloads API is not defined',
        details: 'This extension needs the "downloads" permission',
      };
    }
    return { available: true, message: 'Downloads API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('download'))
      this.registerContractTool(downloadContracts.download, (input) => this.download(input));
    if (this.shouldRegisterTool('search'))
      this.registerContractTool(downloadContracts.search, (input) => this.search(input));
    if (this.shouldRegisterTool('pause'))
      this.registerContractTool(downloadContracts.pause, ({ downloadId }) =>
        this.pause(downloadId)
      );
    if (this.shouldRegisterTool('resume'))
      this.registerContractTool(downloadContracts.resume, ({ downloadId }) =>
        this.resume(downloadId)
      );
    if (this.shouldRegisterTool('cancel'))
      this.registerContractTool(downloadContracts.cancel, ({ downloadId }) =>
        this.cancel(downloadId)
      );
    if (this.shouldRegisterTool('getFileIcon'))
      this.registerContractTool(downloadContracts.getFileIcon, (input) => this.getFileIcon(input));
    if (this.shouldRegisterTool('open'))
      this.registerContractTool(downloadContracts.open, (input) => this.open(input));
    if (this.shouldRegisterTool('show'))
      this.registerContractTool(downloadContracts.show, (input) => this.show(input));
    if (this.shouldRegisterTool('showDefaultFolder'))
      this.registerContractTool(downloadContracts.showDefaultFolder, () =>
        this.showDefaultFolder()
      );
    if (this.shouldRegisterTool('erase'))
      this.registerContractTool(downloadContracts.erase, (input) => this.erase(input));
    if (this.shouldRegisterTool('removeFile'))
      this.registerContractTool(downloadContracts.removeFile, ({ downloadId }) =>
        this.removeFile(downloadId)
      );
    if (this.shouldRegisterTool('acceptDanger'))
      this.registerContractTool(downloadContracts.acceptDanger, ({ downloadId }) =>
        this.acceptDanger(downloadId)
      );
    if (this.shouldRegisterTool('setUiOptions'))
      this.registerContractTool(downloadContracts.setUiOptions, (input) =>
        this.setUiOptions(input)
      );
  }

  private toDownload(download: chrome.downloads.DownloadItem) {
    return {
      id: download.id,
      url: download.url,
      finalUrl: download.finalUrl,
      filename: download.filename,
      incognito: download.incognito,
      danger: download.danger,
      mime: download.mime,
      startTime: download.startTime,
      endTime: download.endTime,
      estimatedEndTime: download.estimatedEndTime,
      state: download.state,
      paused: download.paused,
      canResume: download.canResume,
      error: download.error,
      bytesReceived: download.bytesReceived,
      totalBytes: download.totalBytes,
      fileSize: download.fileSize,
      exists: download.exists,
      byExtensionId: download.byExtensionId,
      byExtensionName: download.byExtensionName,
    };
  }

  public async download(input: DownloadFileInput) {
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(input, (id) =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(id)
      );
    });
    return { downloadId, url: input.url, filename: input.filename ?? 'auto-generated' };
  }

  public async search(input: SearchDownloadsInput) {
    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve, reject) => {
      chrome.downloads.search(input, (items) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(items)
      );
    });
    return {
      count: downloads.length,
      downloads: downloads.map((download) => this.toDownload(download)),
    };
  }

  private async downloadVoid(
    action: string,
    downloadId: number,
    fn: (downloadId: number, callback?: () => void) => void
  ) {
    await new Promise<void>((resolve, reject) => {
      fn(downloadId, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: `Download ${action}` };
  }

  public async pause(downloadId: number) {
    return this.downloadVoid('paused', downloadId, chrome.downloads.pause);
  }

  public async resume(downloadId: number) {
    return this.downloadVoid('resumed', downloadId, chrome.downloads.resume);
  }

  public async cancel(downloadId: number) {
    return this.downloadVoid('cancelled', downloadId, chrome.downloads.cancel);
  }

  public async removeFile(downloadId: number) {
    return this.downloadVoid('file removed', downloadId, chrome.downloads.removeFile);
  }

  public async acceptDanger(downloadId: number) {
    return this.downloadVoid('danger accepted', downloadId, chrome.downloads.acceptDanger);
  }

  public async getFileIcon({ downloadId, size }: GetFileIconInput) {
    const iconURL = await new Promise<string | undefined>((resolve, reject) => {
      chrome.downloads.getFileIcon(downloadId, size ? { size } : {}, (url) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(url)
      );
    });
    return { downloadId, iconURL: iconURL ?? null, size: size ?? 32 };
  }

  public async open({ downloadId }: DownloadIdInput) {
    chrome.downloads.open(downloadId);
    return { ok: true, message: 'Download opened' };
  }

  public async show({ downloadId }: DownloadIdInput) {
    chrome.downloads.show(downloadId);
    return { ok: true, message: 'Download shown' };
  }

  public async showDefaultFolder() {
    chrome.downloads.showDefaultFolder();
    return { ok: true, message: 'Default downloads folder shown' };
  }

  public async erase(input: EraseDownloadsInput) {
    const erasedIds = await new Promise<number[]>((resolve, reject) => {
      chrome.downloads.erase(input, (ids) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(ids)
      );
    });
    return { erasedCount: erasedIds.length, erasedIds, filesDeleted: false as const };
  }

  public async setUiOptions({ enabled }: SetUiOptionsInput) {
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.setUiOptions({ enabled }, () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
      );
    });
    return { ok: true, message: `Download UI ${enabled ? 'enabled' : 'disabled'}` };
  }
}
