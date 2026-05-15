import { z } from 'zod';
import { contract, emptyInputSchema } from './shared';

export const alarmSchema = z.object({
  name: z.string(),
  scheduledTime: z.number(),
  scheduledTimeFormatted: z.string(),
  periodInMinutes: z.number().optional(),
});

export const createAlarmInputSchema = z
  .object({
    name: z.string().optional(),
    delayInMinutes: z.number().min(0.5).optional(),
    periodInMinutes: z.number().min(0.5).optional(),
    when: z.number().optional(),
  })
  .refine((input) => input.delayInMinutes !== undefined || input.when !== undefined, {
    message: 'Either delayInMinutes or when must be specified to create an alarm',
  });
export const createAlarmOutputSchema = z.object({ alarm: alarmSchema });
export type CreateAlarmInput = z.infer<typeof createAlarmInputSchema>;
export type CreateAlarmOutput = z.infer<typeof createAlarmOutputSchema>;

export const getAlarmInputSchema = z.object({ name: z.string().optional() });
export const getAlarmOutputSchema = z.object({ alarm: alarmSchema.nullable() });
export type GetAlarmInput = z.infer<typeof getAlarmInputSchema>;
export type GetAlarmOutput = z.infer<typeof getAlarmOutputSchema>;

export const getAllAlarmsInputSchema = emptyInputSchema;
export const getAllAlarmsOutputSchema = z.object({
  count: z.number(),
  alarms: z.array(alarmSchema),
});
export type GetAllAlarmsInput = z.infer<typeof getAllAlarmsInputSchema>;
export type GetAllAlarmsOutput = z.infer<typeof getAllAlarmsOutputSchema>;

export const clearAlarmInputSchema = z.object({ name: z.string().optional() });
export const clearAlarmOutputSchema = z.object({ name: z.string(), cleared: z.boolean() });
export type ClearAlarmInput = z.infer<typeof clearAlarmInputSchema>;
export type ClearAlarmOutput = z.infer<typeof clearAlarmOutputSchema>;

export const clearAllAlarmsInputSchema = emptyInputSchema;
export const clearAllAlarmsOutputSchema = z.object({
  cleared: z.boolean(),
  clearedCount: z.number(),
  clearedAlarms: z.array(z.string()),
});
export type ClearAllAlarmsInput = z.infer<typeof clearAllAlarmsInputSchema>;
export type ClearAllAlarmsOutput = z.infer<typeof clearAllAlarmsOutputSchema>;

const meta = (actionId: string, chromeApi: string) => ({
  extension: { groupId: 'alarms', actionId, chromeApi, permissions: ['alarms'] },
});

export const alarmContracts = {
  createAlarm: contract({
    name: 'extension_tool_create_alarm',
    title: 'Create alarm',
    description: 'Create or replace a Chrome alarm.',
    inputSchema: createAlarmInputSchema,
    outputSchema: createAlarmOutputSchema,
    annotations: { idempotentHint: true },
    _meta: meta('createAlarm', 'chrome.alarms.create'),
  }),
  getAlarm: contract({
    name: 'extension_tool_get_alarm',
    title: 'Get alarm',
    description: 'Get one Chrome alarm by name, or the default alarm when no name is provided.',
    inputSchema: getAlarmInputSchema,
    outputSchema: getAlarmOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getAlarm', 'chrome.alarms.get'),
  }),
  getAllAlarms: contract({
    name: 'extension_tool_get_all_alarms',
    title: 'Get all alarms',
    description: 'List active Chrome alarms.',
    inputSchema: getAllAlarmsInputSchema,
    outputSchema: getAllAlarmsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getAllAlarms', 'chrome.alarms.getAll'),
  }),
  clearAlarm: contract({
    name: 'extension_tool_clear_alarm',
    title: 'Clear alarm',
    description: 'Clear one Chrome alarm by name, or the default alarm when no name is provided.',
    inputSchema: clearAlarmInputSchema,
    outputSchema: clearAlarmOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('clearAlarm', 'chrome.alarms.clear'),
  }),
  clearAllAlarms: contract({
    name: 'extension_tool_clear_all_alarms',
    title: 'Clear all alarms',
    description: 'Clear all Chrome alarms for this extension.',
    inputSchema: clearAllAlarmsInputSchema,
    outputSchema: clearAllAlarmsOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('clearAllAlarms', 'chrome.alarms.clearAll'),
  }),
} as const;

export const alarmsContracts = Object.values(alarmContracts);
