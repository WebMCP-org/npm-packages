import { Component, type OnInit } from '@angular/core';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

@Component({
  selector: 'app-root',
  template: '<p>WebMCP tool "get_status" registered.</p>',
})
export class App implements OnInit {
  ngOnInit() {
    initializeWebMCPPolyfill();

    navigator.modelContext.registerTool({
      name: 'get_status',
      description: 'Returns app status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => ({
        content: [{ type: 'text', text: 'Angular app is running' }],
      }),
    });
  }
}
