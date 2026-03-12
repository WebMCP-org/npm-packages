import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ModelContext, Tool, ToolRegistration } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type LegacyCompatTracker = {
  originalRegisterTool: ModelContext['registerTool'];
  originalUnregisterTool?: ModelContext['unregisterTool'];
  registrations: Map<string, ToolRegistration>;
  providedNames: Set<string>;
};

const legacyCompatTrackers = new WeakMap<ModelContext, LegacyCompatTracker>();

function setContextMethod<K extends keyof ModelContext>(
  context: ModelContext,
  key: K,
  value: ModelContext[K]
): void {
  try {
    Object.defineProperty(context, key, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    Reflect.set(context as object, key as string, value);
  }
}

function buildWrappedRegistration(
  tracker: LegacyCompatTracker,
  toolName: string,
  registration: ToolRegistration
): ToolRegistration {
  const wrappedRegistration: ToolRegistration = {
    unregister() {
      const current = tracker.registrations.get(toolName);
      if (current === wrappedRegistration) {
        tracker.registrations.delete(toolName);
      }
      tracker.providedNames.delete(toolName);
      registration.unregister();
    },
  };

  return wrappedRegistration;
}

function ensureLegacyCompatTracker(context: ModelContext): LegacyCompatTracker {
  const existing = legacyCompatTrackers.get(context);
  if (existing) {
    return existing;
  }

  const tracker: LegacyCompatTracker = {
    originalRegisterTool: context.registerTool.bind(context),
    originalUnregisterTool: context.unregisterTool?.bind(context),
    registrations: new Map(),
    providedNames: new Set(),
  };

  const wrappedRegisterTool: ModelContext['registerTool'] = (tool: Tool) => {
    const rawRegistration = tracker.originalRegisterTool(tool);
    const registration =
      rawRegistration && typeof rawRegistration.unregister === 'function'
        ? rawRegistration
        : {
            unregister() {
              tracker.originalUnregisterTool?.(tool.name);
            },
          };

    const wrapped = buildWrappedRegistration(tracker, tool.name, registration);
    tracker.registrations.set(tool.name, wrapped);
    return wrapped;
  };

  setContextMethod(context, 'registerTool', wrappedRegisterTool);
  legacyCompatTrackers.set(context, tracker);
  return tracker;
}

export function installLegacyContextCompat(context: ModelContext): void {
  const tracker = ensureLegacyCompatTracker(context);

  if (typeof context.provideContext !== 'function') {
    setContextMethod(context, 'provideContext', ({ tools }: { tools: Tool[] }) => {
      for (const name of [...tracker.providedNames]) {
        tracker.registrations.get(name)?.unregister();
      }

      tracker.providedNames.clear();

      for (const tool of tools) {
        context.registerTool(tool);
        tracker.providedNames.add(tool.name);
      }
    });
  }

  if (typeof context.unregisterTool !== 'function') {
    setContextMethod(context, 'unregisterTool', (toolName: string) => {
      tracker.registrations.get(toolName)?.unregister();
    });
  }

  if (typeof context.clearContext !== 'function') {
    setContextMethod(context, 'clearContext', () => {
      for (const registration of [...tracker.registrations.values()]) {
        registration.unregister();
      }
      tracker.providedNames.clear();
    });
  }
}
