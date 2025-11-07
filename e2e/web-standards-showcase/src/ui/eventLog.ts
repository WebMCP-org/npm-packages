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
    entry.className = 'log-entry';

    const timestamp = new Date().toLocaleTimeString();
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-timestamp';
    timestampSpan.textContent = timestamp;

    const eventSpan = document.createElement('span');
    eventSpan.className = 'log-event';
    eventSpan.textContent = event;

    entry.appendChild(timestampSpan);
    entry.appendChild(eventSpan);

    if (details) {
      const detailsSpan = document.createElement('span');
      detailsSpan.className = 'log-details';
      detailsSpan.textContent = details;
      entry.appendChild(detailsSpan);
    }

    this.container.insertBefore(entry, this.container.firstChild);

    // Limit entries
    while (this.container.children.length > this.maxEntries) {
      this.container.removeChild(this.container.lastChild!);
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }

  success(event: string, details?: string): void {
    this.log(`✅ ${event}`, details);
  }

  error(event: string, details?: string): void {
    this.log(`❌ ${event}`, details);
  }

  info(event: string, details?: string): void {
    this.log(`ℹ️ ${event}`, details);
  }

  warning(event: string, details?: string): void {
    this.log(`⚠️ ${event}`, details);
  }
}
