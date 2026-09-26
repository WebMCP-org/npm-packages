import '@mcp-b/global';
import type { ModelContextTesting } from '@mcp-b/global';

// Optional because no browser ships WebMCP unflagged; consumers feature-detect.
// This asserts the global augmentation is in scope, not that the API is present.
void document.modelContext?.registerTool;

const testingContext: ModelContextTesting | undefined = navigator.modelContextTesting;
if (testingContext) {
  void testingContext.listTools()[0]?.inputSchema;
  void testingContext.executeTool('name', '{}');
}

if (typeof ModelContext !== 'undefined') {
  void (document.modelContext instanceof ModelContext);
}
