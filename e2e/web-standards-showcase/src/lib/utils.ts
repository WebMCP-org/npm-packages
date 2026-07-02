import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ModelContextRegisterToolOptions } from '@mcp-b/webmcp-types';
import type {
  ModelContext,
  ModelContextTesting,
  Tool,
  ToolInfo,
  ToolInputSchema,
  ToolRegistration,
} from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type LegacyCompatTracker = {
  originalRegisterTool: (
    tool: Tool,
    options?: ModelContextRegisterToolOptions
  ) => Promise<void> | ToolRegistration;
  originalUnregisterTool?: ModelContext['unregisterTool'];
  registrations: Map<string, ToolRegistration>;
  listeners: Map<EventListenerOrEventListenerObject, () => void>;
};

const legacyCompatTrackers = new WeakMap<ModelContext, LegacyCompatTracker>();

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    Boolean(value) &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function isToolRegistration(value: unknown): value is ToolRegistration {
  return (
    Boolean(value) &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { unregister?: unknown }).unregister === 'function'
  );
}

function isAbortError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

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
      registration.unregister();
    },
  };

  return wrappedRegistration;
}

function parseInputSchema(inputSchema: ToolInfo['inputSchema']): ToolInputSchema {
  if (!inputSchema) {
    return { type: 'object', properties: {} };
  }

  if (typeof inputSchema !== 'string') {
    return inputSchema;
  }

  try {
    const parsed = JSON.parse(inputSchema) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as ToolInputSchema;
    }
  } catch {
    // Fall through to the default empty object schema.
  }

  return { type: 'object', properties: {} };
}

function ensureLegacyCompatTracker(context: ModelContext): LegacyCompatTracker {
  const existing = legacyCompatTrackers.get(context);
  if (existing) {
    return existing;
  }

  const tracker: LegacyCompatTracker = {
    originalRegisterTool: context.registerTool.bind(
      context
    ) as LegacyCompatTracker['originalRegisterTool'],
    originalUnregisterTool: context.unregisterTool?.bind(context),
    registrations: new Map(),
    listeners: new Map(),
  };

  const wrappedRegisterTool: ModelContext['registerTool'] = (
    tool: Tool,
    options?: ModelContextRegisterToolOptions
  ) => {
    const rawRegistration = tracker.originalRegisterTool(tool, options);
    if (isPromiseLike(rawRegistration)) {
      rawRegistration.then(undefined, (error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        console.warn(`[WebMCP Showcase] registerTool("${tool.name}") rejected:`, error);
      });
    }
    const registration = isToolRegistration(rawRegistration)
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
  const testing = navigator.modelContextTesting as ModelContextTesting | undefined;

  if (typeof context.listTools !== 'function') {
    setContextMethod(context, 'listTools', () => {
      return (
        testing?.listTools().map((tool: ToolInfo) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: parseInputSchema(tool.inputSchema),
        })) ?? []
      );
    });
  }

  if (typeof context.unregisterTool !== 'function') {
    setContextMethod(context, 'unregisterTool', (toolName: string) => {
      tracker.registrations.get(toolName)?.unregister();
    });
  }

  if (typeof context.addEventListener !== 'function') {
    setContextMethod(context, 'addEventListener', (type, listener) => {
      if (type !== 'toolchange' && type !== 'toolschange') {
        return;
      }

      if (typeof testing?.addEventListener === 'function') {
        const callback = () => {
          if (typeof listener === 'function') {
            listener(new Event('toolchange'));
          } else {
            listener.handleEvent(new Event('toolchange'));
          }
        };
        tracker.listeners.set(listener, callback);
        testing.addEventListener('toolchange', callback);
        return;
      }

      if (typeof testing?.registerToolsChangedCallback === 'function') {
        const callback = () => {
          if (typeof listener === 'function') {
            listener(new Event('toolchange'));
          } else {
            listener.handleEvent(new Event('toolchange'));
          }
        };
        tracker.listeners.set(listener, callback);
        testing.registerToolsChangedCallback(callback);
      }
    });
  }

  if (typeof context.removeEventListener !== 'function') {
    setContextMethod(context, 'removeEventListener', (type, listener) => {
      if (type !== 'toolchange' && type !== 'toolschange') {
        return;
      }

      const callback = tracker.listeners.get(listener);
      if (!callback) {
        return;
      }

      testing?.removeEventListener?.('toolchange', callback);
      tracker.listeners.delete(listener);
    });
  }
}
