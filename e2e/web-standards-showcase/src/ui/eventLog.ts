/**
 * Event Log UI Manager
 */

export class EventLog {
  private container: HTMLElement;
  private maxEntries = 100;

  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`Element with id "${containerId}" not found`);
    }
    this.container = element;
  }

  log(event: string, details?: string): void {
    const entry = document.createElement('div');
    entry.className = 'border-b border-white/10 py-1';

    const timestamp = new Date().toLocaleTimeString();
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'mr-4 text-gray-400';
    timestampSpan.textContent = timestamp;

    const eventSpan = document.createElement('span');
    eventSpan.className = 'mr-2 font-semibold text-blue-400';
    eventSpan.textContent = event;

    entry.appendChild(timestampSpan);
    entry.appendChild(eventSpan);

    if (details) {
      const detailsSpan = document.createElement('span');
      detailsSpan.className = 'text-gray-300';
      detailsSpan.textContent = details;
      entry.appendChild(detailsSpan);
    }

    this.container.insertBefore(entry, this.container.firstChild);

    // Limit entries
    while (this.container.children.length > this.maxEntries) {
      const lastChild = this.container.lastChild;
      if (lastChild) {
        this.container.removeChild(lastChild);
      }
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }

  success(event: string, details?: string): void {
    this.log(`[SUCCESS] ${event}`, details);
  }

  error(event: string, details?: string): void {
    this.log(`[ERROR] ${event}`, details);
  }

  info(event: string, details?: string): void {
    this.log(`[INFO] ${event}`, details);
  }

  warning(event: string, details?: string): void {
    this.log(`[WARNING] ${event}`, details);
  }
}
