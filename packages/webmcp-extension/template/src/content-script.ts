import { connectWebMCPClient } from '@mcp-b/webmcp-extension/content-script';

async function waitForDocument(): Promise<void> {
  if (document.readyState !== 'loading') return;
  await new Promise<void>((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

async function main(): Promise<void> {
  const client = await connectWebMCPClient(
    {
      name: 'webmcp-extension-template',
      version: '1.0.0',
    },
    {
      listChanged: {
        tools: {
          onChanged(error, tools) {
            if (error || !tools) {
              console.error('[WebMCP] Failed to refresh page tools:', error);
              return;
            }
            console.info(
              '[WebMCP] Page tools updated:',
              tools.map(({ name }) => name)
            );
          },
        },
      },
    }
  );

  // Keep this connection alive across BFCache restores; document teardown owns final cleanup.
  await waitForDocument();
  const { tools } = await client.listTools();
  console.info(
    '[WebMCP] Page tools:',
    tools.map(({ name }) => name)
  );
}

void main().catch((error) => {
  console.error('[WebMCP] Content-script connection failed:', error);
});
