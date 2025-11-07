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
        <div class="empty-state">
          <div class="empty-icon">🔧</div>
          <p>No tools registered yet</p>
          <p class="hint">Use the editor to define and register tools</p>
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
      item.className = 'tool-item';

      const header = document.createElement('div');
      header.className = 'tool-header';

      const name = document.createElement('div');
      name.className = 'tool-name';
      name.textContent = tool.name;

      const badge = document.createElement('span');
      badge.className = `tool-badge ${tool.bucket ? `bucket-${tool.bucket.toLowerCase()}` : ''}`;
      badge.textContent = tool.bucket ? `Bucket ${tool.bucket}` : 'Tool';

      header.appendChild(name);
      header.appendChild(badge);

      const description = document.createElement('div');
      description.className = 'tool-description';
      description.textContent = tool.description;

      const schema = document.createElement('div');
      schema.className = 'tool-schema';
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
