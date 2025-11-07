import type { Tool } from '../types';

/**
 * Tool Display UI Manager
 */

interface ToolWithBucket extends Tool {
  bucket?: 'A' | 'B';
}

export class ToolDisplay {
  private container: HTMLElement;
  private countElement: HTMLElement;
  private toolsMap = new Map<string, ToolWithBucket>();

  constructor(containerId: string, countElementId: string) {
    const container = document.getElementById(containerId);
    const countElement = document.getElementById(countElementId);

    if (!container) {
      throw new Error(`Element with id "${containerId}" not found`);
    }
    if (!countElement) {
      throw new Error(`Element with id "${countElementId}" not found`);
    }

    this.container = container;
    this.countElement = countElement;
  }

  setTools(tools: Tool[], bucket?: 'A' | 'B'): void {
    // If bucket is specified, only update that bucket's tools
    if (bucket) {
      // Remove existing tools from this bucket
      for (const [name, tool] of this.toolsMap.entries()) {
        if (tool.bucket === bucket) {
          this.toolsMap.delete(name);
        }
      }

      // Add new tools to this bucket
      for (const tool of tools) {
        this.toolsMap.set(tool.name, { ...tool, bucket });
      }
    } else {
      // No bucket specified - replace all
      this.toolsMap.clear();
      for (const tool of tools) {
        this.toolsMap.set(tool.name, tool);
      }
    }

    this.render();
  }

  addTool(tool: Tool, bucket?: 'A' | 'B'): void {
    this.toolsMap.set(tool.name, { ...tool, bucket });
    this.render();
  }

  removeTool(name: string): void {
    this.toolsMap.delete(name);
    this.render();
  }

  clear(): void {
    this.toolsMap.clear();
    this.render();
  }

  private render(): void {
    const tools = Array.from(this.toolsMap.values());

    // Update count
    this.countElement.textContent =
      tools.length === 0 ? '0 tools' : tools.length === 1 ? '1 tool' : `${tools.length} tools`;

    // Clear container
    this.container.innerHTML = '';

    if (tools.length === 0) {
      this.container.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <div class="mb-4 text-5xl opacity-50">⚙</div>
          <p class="text-base">No tools registered yet</p>
          <p class="mt-1 text-sm">Use the editor to define and register tools</p>
        </div>
      `;
      return;
    }

    // Sort: Bucket A first, then Bucket B, then no bucket
    const sortedTools = tools.sort((a, b) => {
      if (a.bucket === 'A' && b.bucket !== 'A') return -1;
      if (a.bucket !== 'A' && b.bucket === 'A') return 1;
      if (a.bucket === 'B' && b.bucket !== 'B') return -1;
      if (a.bucket !== 'B' && b.bucket === 'B') return 1;
      return a.name.localeCompare(b.name);
    });

    for (const tool of sortedTools) {
      const item = document.createElement('div');
      item.className = 'mb-4 rounded-lg border border-border bg-muted p-4 last:mb-0';

      const header = document.createElement('div');
      header.className = 'mb-2 flex items-start justify-between';

      const name = document.createElement('div');
      name.className = 'font-mono text-sm font-semibold text-primary';
      name.textContent = tool.name;

      const badge = document.createElement('span');
      const bucketClass =
        tool.bucket === 'A'
          ? 'bg-[var(--color-bucket-a-light)] text-[var(--color-bucket-a)]'
          : tool.bucket === 'B'
            ? 'bg-[var(--color-bucket-b-light)] text-[var(--color-bucket-b)]'
            : 'bg-secondary text-secondary-foreground';
      badge.className = `rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${bucketClass}`;
      badge.textContent = tool.bucket ? `Bucket ${tool.bucket}` : 'Tool';

      header.appendChild(name);
      header.appendChild(badge);

      const description = document.createElement('div');
      description.className = 'mb-2 text-sm text-muted-foreground';
      description.textContent = tool.description;

      const schema = document.createElement('div');
      schema.className =
        'overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-card p-2 font-mono text-xs text-foreground';
      schema.textContent = JSON.stringify(tool.inputSchema, null, 2);

      item.appendChild(header);
      item.appendChild(description);
      item.appendChild(schema);

      this.container.appendChild(item);
    }
  }

  getToolNames(): string[] {
    return Array.from(this.toolsMap.keys());
  }
}
