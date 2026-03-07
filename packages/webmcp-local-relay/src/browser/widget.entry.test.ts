import { afterEach, describe, expect, it, vi } from 'vitest';

describe('widget entrypoint', () => {
  afterEach(() => {
    vi.doUnmock('./widgetRuntime.js');
    vi.resetModules();
  });

  it('starts the widget runtime on import', async () => {
    const startWidgetRuntime = vi.fn();

    vi.doMock('./widgetRuntime.js', () => ({
      startWidgetRuntime,
    }));

    const specifier = new URL(`./widget.js?widget-entry-test=${Date.now()}`, import.meta.url).href;

    await import(/* @vite-ignore */ specifier);

    expect(startWidgetRuntime).toHaveBeenCalledTimes(1);
  });
});
