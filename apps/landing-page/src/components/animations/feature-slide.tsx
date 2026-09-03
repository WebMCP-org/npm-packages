'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tokenPattern =
  /(`[^`]*`|'[^']*'|"[^"]*"|\b(?:import|from|export|function|const|return|async|await|type|interface|extends)\b|\b(?:document|modelContext|registerTool|useWebMCP|useState)\b|\b(?:string|object|number|boolean|void|Promise|Record)\b|[{}()[\].,:<>=;|?&]|\/\/.*|[A-Za-z_]\w*|\s+|.)/g;

function getTokenClassName(token: string): string {
  if (/^\s+$/.test(token)) return '';
  if (token.startsWith('//')) return 'text-muted-foreground';
  if (/^['"`].*['"`]$/.test(token)) return 'text-emerald-700 dark:text-emerald-300';
  if (/^(import|from|export|function|const|return|async|await|type|interface|extends)$/.test(token))
    return 'text-sky-700 dark:text-sky-300';
  if (/^(document|modelContext|registerTool|useWebMCP|useState)$/.test(token))
    return 'text-violet-700 dark:text-violet-300';
  if (/^(string|object|number|boolean|void|Promise|Record)$/.test(token))
    return 'text-amber-700 dark:text-amber-300';
  if (/^[{}()[\].,:<>=;|?&]$/.test(token)) return 'text-muted-foreground';
  return 'text-foreground';
}

function renderHighlightedLine(line: string): ReactNode[] {
  const parts = line.match(tokenPattern) ?? [line];
  return parts.map((part, index) => (
    <span key={`${part}-${index}`} className={getTokenClassName(part)}>
      {part}
    </span>
  ));
}

const codeTabs = [
  {
    label: 'Polyfill',
    fileName: 'registerTool.ts',
    lines: [
      '// Register a tool for AI agents',
      'document.modelContext.registerTool({',
      "  name: 'search_products',",
      "  description: 'Search the catalog',",
      '  inputSchema: {',
      "    type: 'object',",
      '    properties: {',
      "      query: { type: 'string' }",
      '    }',
      '  },',
      '  execute: (params) =>',
      '    catalog.search(params.query),',
      '});',
    ],
  },
  {
    label: 'React',
    fileName: 'ProductSearch.tsx',
    lines: [
      'import { useWebMCP } from',
      "  '@mcp-b/react-webmcp';",
      '',
      'export function ProductSearch() {',
      '  useWebMCP({',
      "    name: 'search_products',",
      '    inputSchema: {',
      '      query: z.string()',
      '    },',
      '    execute: async ({ query }) => {',
      '      return catalog.search(query);',
      '    },',
      '  });',
      '}',
    ],
  },
  {
    label: 'Types',
    fileName: 'webmcp-types.d.ts',
    lines: [
      'interface ToolDescriptor {',
      '  name: string;',
      '  description: string;',
      '  inputSchema: Record<string, unknown>;',
      '  execute: (params: unknown)',
      '    => Promise<unknown>;',
      '  annotations?: {',
      '    readOnlyHint?: boolean;',
      '    idempotentHint?: boolean;',
      '  };',
      '}',
      '',
      'interface ModelContext {',
      '  registerTool(tool: ToolDescriptor)',
      '    : Promise<void>;',
      '  getTools(): Promise<RegisteredTool[]>;',
      '}',
    ],
  },
];

const productLinks = [
  { label: 'Documentation', href: 'https://docs.mcp-b.ai', icon: '→' },
  {
    label: 'npm-packages on GitHub',
    href: 'https://github.com/WebMCP-org/npm-packages',
    icon: '→',
  },
  { label: 'npm organization', href: 'https://www.npmjs.com/org/mcp-b', icon: 'npm' },
];

const packageGroups = [
  {
    label: 'Core runtime',
    packages: [
      '@mcp-b/webmcp-types',
      '@mcp-b/webmcp-polyfill',
      '@mcp-b/global',
      '@mcp-b/webmcp-ts-sdk',
      '@mcp-b/transports',
      '@mcp-b/mcp-iframe',
    ],
  },
  {
    label: 'React',
    packages: ['usewebmcp', '@mcp-b/react-webmcp'],
  },
  {
    label: 'Agent and browser tooling',
    packages: ['@mcp-b/webmcp-local-relay', '@mcp-b/smart-dom-reader'],
  },
];

function npmUrl(packageName: string) {
  return `https://www.npmjs.com/package/${packageName}`;
}

export function WebMCPPackagesContent() {
  const [activeTab, setActiveTab] = useState(0);
  const tab = codeTabs[activeTab];

  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border bg-muted px-4 py-2.5">
          <div className="mr-3 flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-500" />
            <div className="size-2.5 rounded-full bg-yellow-500" />
            <div className="size-2.5 rounded-full bg-green-500" />
          </div>
          {codeTabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setActiveTab(i)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                i === activeTab
                  ? 'border border-border bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">{tab.fileName}</span>
        </div>
        <div className="flex-1 overflow-auto bg-background p-4 font-mono text-xs md:p-5 md:text-sm">
          <div className="space-y-0.5">
            {tab.lines.map((line, i) => (
              <div key={`${activeTab}-${i}`} className="flex">
                <span className="mr-4 w-6 select-none text-right text-[10px] leading-5 text-foreground/70">
                  {i + 1}
                </span>
                <span className="whitespace-pre">
                  {line ? renderHighlightedLine(line) : '\u00A0'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-1.5">
          {productLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 transition-colors hover:bg-muted"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{link.icon}</span>
              <span className="text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                {link.label}
              </span>
            </a>
          ))}
        </div>
        {packageGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {group.packages.map((packageName) => (
                <a
                  key={packageName}
                  href={npmUrl(packageName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {packageName}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
