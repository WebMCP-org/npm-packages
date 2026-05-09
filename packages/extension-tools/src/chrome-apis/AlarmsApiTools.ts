import type { McpServer } from '@mcp-b/webmcp-ts-sdk';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';
import {
  alarmContracts,
  type CreateAlarmInput,
  type GetAlarmInput,
  type ClearAlarmInput,
} from '../contracts/alarms';

export interface AlarmsApiToolsOptions {
  createAlarm?: boolean;
  getAlarm?: boolean;
  getAllAlarms?: boolean;
  clearAlarm?: boolean;
  clearAllAlarms?: boolean;
}

export class AlarmsApiTools extends BaseApiTools<AlarmsApiToolsOptions> {
  protected apiName = 'Alarms';

  constructor(server: McpServer, options: AlarmsApiToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    if (!chrome.alarms?.getAll) {
      return {
        available: false,
        message: 'chrome.alarms API is not defined',
        details: 'This extension needs the "alarms" permission in its manifest.json',
      };
    }
    return { available: true, message: 'Alarms API is fully available' };
  }

  registerTools(): void {
    if (this.shouldRegisterTool('createAlarm'))
      this.registerContractTool(alarmContracts.createAlarm, (input) => this.createAlarm(input));
    if (this.shouldRegisterTool('getAlarm'))
      this.registerContractTool(alarmContracts.getAlarm, (input) => this.getAlarm(input));
    if (this.shouldRegisterTool('getAllAlarms'))
      this.registerContractTool(alarmContracts.getAllAlarms, () => this.getAllAlarms());
    if (this.shouldRegisterTool('clearAlarm'))
      this.registerContractTool(alarmContracts.clearAlarm, (input) => this.clearAlarm(input));
    if (this.shouldRegisterTool('clearAllAlarms'))
      this.registerContractTool(alarmContracts.clearAllAlarms, () => this.clearAllAlarms());
  }

  private toAlarm(alarm: chrome.alarms.Alarm) {
    return {
      name: alarm.name,
      scheduledTime: alarm.scheduledTime,
      scheduledTimeFormatted: new Date(alarm.scheduledTime).toISOString(),
      periodInMinutes: alarm.periodInMinutes,
    };
  }

  private async getAlarmRaw(name?: string): Promise<chrome.alarms.Alarm | undefined> {
    return new Promise((resolve, reject) => {
      const callback = (alarm?: chrome.alarms.Alarm) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(alarm);
      if (name) chrome.alarms.get(name, callback);
      else chrome.alarms.get(callback);
    });
  }

  private async createAlarm({ name, delayInMinutes, periodInMinutes, when }: CreateAlarmInput) {
    const alarmInfo: chrome.alarms.AlarmCreateInfo = {};
    if (delayInMinutes !== undefined) alarmInfo.delayInMinutes = delayInMinutes;
    if (periodInMinutes !== undefined) alarmInfo.periodInMinutes = periodInMinutes;
    if (when !== undefined) alarmInfo.when = when;
    await new Promise<void>((resolve, reject) => {
      const callback = () =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
      if (name) chrome.alarms.create(name, alarmInfo, callback);
      else chrome.alarms.create(alarmInfo, callback);
    });
    const alarm = await this.getAlarmRaw(name);
    if (!alarm) throw new Error('Alarm was created but could not be read back');
    return { alarm: this.toAlarm(alarm) };
  }

  private async getAlarm({ name }: GetAlarmInput) {
    const alarm = await this.getAlarmRaw(name);
    return { alarm: alarm ? this.toAlarm(alarm) : null };
  }

  private async getAllAlarms() {
    const alarms = await new Promise<chrome.alarms.Alarm[]>((resolve, reject) => {
      chrome.alarms.getAll((items) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(items)
      );
    });
    return { count: alarms.length, alarms: alarms.map((alarm) => this.toAlarm(alarm)) };
  }

  private async clearAlarm({ name }: ClearAlarmInput) {
    const cleared = await new Promise<boolean>((resolve, reject) => {
      const callback = (value: boolean) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value);
      if (name) chrome.alarms.clear(name, callback);
      else chrome.alarms.clear(callback);
    });
    return { name: name ?? '', cleared };
  }

  private async clearAllAlarms() {
    const before = await this.getAllAlarms();
    const cleared = await new Promise<boolean>((resolve, reject) => {
      chrome.alarms.clearAll((value) =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(value)
      );
    });
    return {
      cleared,
      clearedCount: cleared ? before.count : 0,
      clearedAlarms: cleared ? before.alarms.map((alarm) => alarm.name) : [],
    };
  }
}
