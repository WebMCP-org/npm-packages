import { Component, type OnInit } from '@angular/core';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';

@Component({
  selector: 'app-root',
  template: '<p>WebMCP tool "get_status" registered.</p>',
})
export class App implements OnInit {
  async ngOnInit() {
    installWebMCP();

    await document.modelContext.registerTool({
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
