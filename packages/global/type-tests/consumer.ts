import '@mcp-b/global';

// Optional because no browser ships WebMCP unflagged; consumers feature-detect.
// This asserts the global augmentation is in scope, not that the API is present.
void document.modelContext?.registerTool;
