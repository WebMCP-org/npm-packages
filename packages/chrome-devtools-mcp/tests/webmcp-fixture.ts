/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TestServer} from './server.js';
import {html} from './utils.js';

export const WEBMCP_FIXTURE_ENTITIES = [
  {id: '1', name: 'Ada'},
  {id: '2', name: 'Linus'},
  {id: '3', name: 'Grace'},
] as const;

export function buildRouteAwareWebMCPPage(): string {
  return html`
    <main>
      <h1 id="route"></h1>
    </main>
    <script>
      const ENTITIES = ${JSON.stringify(WEBMCP_FIXTURE_ENTITIES)};

      function renderRoute() {
        document.querySelector('#route').textContent =
          'Route: ' + window.location.pathname;
        console.info('webmcp route', window.location.pathname);
      }

      function toolsForPath(pathname) {
        if (pathname === '/entities') {
          return [
            {
              name: 'navigate',
              description: 'Navigate to a route in the test app.',
              inputSchema: {
                type: 'object',
                properties: {
                  to: {type: 'string'},
                },
                required: ['to'],
              },
            },
            {
              name: 'get_current_context',
              description: 'Return the current route path.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'list_entities',
              description: 'List entities visible on the entities route.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
          ];
        }

        return [
          {
            name: 'navigate',
            description: 'Navigate to a route in the test app.',
            inputSchema: {
              type: 'object',
              properties: {
                to: {type: 'string'},
              },
              required: ['to'],
            },
          },
          {
            name: 'get_current_context',
            description: 'Return the current route path.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'list_all_routes',
            description: 'List routes in the test app.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ];
      }

      async function fetchEntities() {
        const response = await fetch('/api/entities');
        return await response.json();
      }

      navigator.modelContext = {
        async listTools() {
          return toolsForPath(window.location.pathname);
        },
        async callTool(request) {
          switch (request.name) {
            case 'navigate': {
              const to = request.arguments?.to || '/';
              history.pushState({}, '', to);
              renderRoute();
              return {
                content: [{type: 'text', text: 'Navigated to ' + window.location.pathname}],
              };
            }
            case 'get_current_context':
              return {
                content: [{type: 'text', text: window.location.pathname}],
              };
            case 'list_all_routes':
              return {
                content: [{type: 'text', text: '/,/entities'}],
              };
            case 'list_entities': {
              const entities = await fetchEntities();
              console.info('webmcp entities loaded', entities.length);
              return {
                content: [
                  {
                    type: 'text',
                    text:
                      entities.length +
                      ' entities: ' +
                      entities.map(entity => entity.name).join(', '),
                  },
                ],
              };
            }
            default:
              throw new Error('Unknown tool: ' + request.name);
          }
        },
      };

      window.addEventListener('popstate', renderRoute);
      renderRoute();
    </script>
  `;
}

export function registerRouteAwareWebMCPFixture(server: TestServer) {
  const page = buildRouteAwareWebMCPPage();
  server.addHtmlRoute('/', page);
  server.addHtmlRoute('/entities', page);
  server.addRoute('/api/entities', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(JSON.stringify(WEBMCP_FIXTURE_ENTITIES));
  });
}
