import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  optimizeDeps: {
    include: ['@mcp-b/transports', '@modelcontextprotocol/sdk'],
  },
  plugins: [
    monkey({
      entry: 'src/index.ts',
      userscript: {
        name: 'Web Model Context API Polyfill',
        namespace: 'https://github.com/WebMCP-org/npm-packages',
        match: ['*://*/*'], // Match all websites
        version: '1.0.0',
        description:
          'Implements the Web Model Context API (window.agent) bridging to Model Context Protocol',
        author: 'MCP-B Team',
        license: 'MIT',
        homepageURL: 'https://github.com/WebMCP-org/npm-packages',
        supportURL: 'https://github.com/WebMCP-org/npm-packages/issues',
      },
      build: {
        fileName: 'index.js', // Simple output name for <script> tag usage
        metaFileName: false, // No metadata file needed
        autoGrant: false, // No GM grants needed
        externalGlobals: {}, // Bundle everything
      },
    }),
  ],
  build: {
    minify: true, // Minify for smaller bundle size
    rollupOptions: {
      output: {
        format: 'iife', // Self-contained IIFE for <script> tag
        inlineDynamicImports: true, // Bundle all dynamic imports
        name: 'WebMCP', // Global variable name (if needed)
      },
    },
    target: 'esnext', // Modern browsers
    sourcemap: false, // No sourcemaps in production
  },
});
