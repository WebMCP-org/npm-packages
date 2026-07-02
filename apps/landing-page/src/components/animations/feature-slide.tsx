'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { cn } from '@/lib/utils';

type FeatureItem = {
  id: number;
  title: string;
  content: string;
  image?: string;
  video?: string;
  contentType?: string;
  slug?: string;
};

type FeatureProps = {
  collapseDelay?: number;
  linePosition?: 'left' | 'right' | 'top' | 'bottom';
  lineColor?: string;
  featureItems: FeatureItem[];
  sectionId?: string;
};

const LINE_POSITION_CLASSES = {
  left: 'left-0 top-0 bottom-0 w-px',
  right: 'right-0 top-0 bottom-0 w-px',
  top: 'top-0 left-0 right-0 h-px',
  bottom: 'bottom-0 left-0 right-0 h-px',
} as const;

const MEDIA_TRANSITION = {
  duration: 0.3,
  ease: 'easeInOut' as const,
};

// ── Syntax highlighting (matches code-review-block.tsx) ──────────────

const tokenPattern =
  /(`[^`]*`|'[^']*'|"[^"]*"|\b(?:import|from|export|function|const|return|async|await|type|interface|extends)\b|\b(?:document|modelContext|registerTool|useWebMCP|useState)\b|\b(?:string|object|number|boolean|void|Promise|Record)\b|[{}()[\].,:<>=;|?&]|\/\/.*|[A-Za-z_]\w*|\s+|.)/g;

function getTokenClassName(token: string): string {
  if (/^\s+$/.test(token)) return '';
  if (token.startsWith('//')) return 'text-muted-foreground';
  if (/^['"`].*['"`]$/.test(token)) return 'text-emerald-500';
  if (/^(import|from|export|function|const|return|async|await|type|interface|extends)$/.test(token))
    return 'text-sky-500';
  if (/^(document|modelContext|registerTool|useWebMCP|useState)$/.test(token))
    return 'text-violet-500';
  if (/^(string|object|number|boolean|void|Promise|Record)$/.test(token)) return 'text-amber-500';
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

// ── Shared bullet component ──────────────────────────────────────────

function FeatureBullet({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-sm text-sky-500 shrink-0">{icon}</span>
      <span className="text-sm text-muted-foreground leading-snug">{children}</span>
    </div>
  );
}

// ── WebMCP Packages content ──────────────────────────────────────────

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
      '    handler: async ({ query }) => {',
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
      '    : void;',
      '  unregisterTool(name: string)',
      '    : void;',
      '}',
    ],
  },
];

const productLinks = [
  { label: 'Documentation', href: 'https://docs.mcp-b.ai', icon: '→' },
  { label: 'GitHub', href: 'https://github.com/WebMCP-org/npm-packages', icon: '→' },
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
    packages: ['@mcp-b/webmcp-local-relay', '@mcp-b/extension-tools', '@mcp-b/smart-dom-reader'],
  },
];

function npmUrl(packageName: string) {
  return `https://www.npmjs.com/package/${packageName}`;
}

function WebMCPPackagesContent() {
  const [activeTab, setActiveTab] = useState(0);
  const tab = codeTabs[activeTab];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 h-full">
      {/* Left: tabbed code block */}
      <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
        <div className="bg-muted px-4 py-2.5 flex items-center gap-1 border-b border-border">
          <div className="flex gap-1.5 mr-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          {codeTabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(i);
              }}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                i === activeTab
                  ? 'bg-background text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">{tab.fileName}</span>
        </div>
        <div className="bg-background p-4 md:p-5 font-mono text-xs md:text-sm flex-1 overflow-auto">
          <div className="space-y-0.5">
            {tab.lines.map((line, i) => (
              <div key={`${activeTab}-${i}`} className="flex">
                <span className="w-6 text-right text-muted-foreground/40 mr-4 select-none text-[10px] leading-5">
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

      {/* Right: getting started links */}
      <div className="flex flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-1.5">
          {productLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 hover:bg-muted transition-colors group"
            >
              <span className="text-[10px] text-muted-foreground font-mono">{link.icon}</span>
              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                {link.label}
              </span>
            </a>
          ))}
        </div>
        {packageGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {group.packages.map((packageName) => (
                <a
                  key={packageName}
                  href={npmUrl(packageName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-foreground hover:border-primary hover:text-primary transition-colors"
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

// ── MCP-B Extension content ─────────────────────────────────────────

function ExtensionContent() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 h-full">
      {/* Left: YouTube video */}
      <div className="relative w-full rounded-xl overflow-hidden border border-border bg-black aspect-video">
        <iframe
          src="https://www.youtube-nocookie.com/embed/IAfrzel524s?start=221&rel=0&modestbranding=1"
          title="WebMCP is MCP for Single Page Apps — Jack Herrington"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Right: what the extension does */}
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            What the extension does
          </p>
          <div className="flex flex-col gap-3">
            <FeatureBullet icon="&#x25B8;">
              Discovers WebMCP tools published by the active page
            </FeatureBullet>
            <FeatureBullet icon="&#x25B8;">
              Connects page tools to extension-side agent experiences
            </FeatureBullet>
            <FeatureBullet icon="&#x25B8;">
              Uses the MCP-B transport and runtime packages
            </FeatureBullet>
            <FeatureBullet icon="&#x25B8;">
              Installs from the canonical Chrome Web Store listing
            </FeatureBullet>
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-1.5">
          <a
            href="https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted transition-colors group"
          >
            <span className="text-[10px] text-muted-foreground font-mono">→</span>
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
              Install from Chrome Web Store
            </span>
          </a>
          <a
            href="https://docs.mcp-b.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted transition-colors group"
          >
            <span className="text-[10px] text-muted-foreground font-mono">→</span>
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
              Extension documentation
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Content type registry ────────────────────────────────────────────

const CONTENT_TYPE_COMPONENTS: Record<string, React.FC> = {
  'webmcp-packages': WebMCPPackagesContent,
  extension: ExtensionContent,
};

// ── Feature carousel ─────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const Feature = ({
  collapseDelay = 5000,
  linePosition = 'left',
  lineColor = 'bg-border',
  featureItems,
  sectionId,
}: FeatureProps) => {
  const getSlug = useCallback((item: FeatureItem) => item.slug ?? slugify(item.title), []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userLocked, setUserLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [primaryColor, setPrimaryColor] = useState('rgb(0, 0, 0)');
  const [trigger, setTrigger] = useState(0);

  // Read hash after hydration + listen for hash changes
  useEffect(() => {
    if (!sectionId) return;

    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      const idx = featureItems.findIndex((item) => `${sectionId}/${getSlug(item)}` === hash);
      if (idx >= 0) {
        setCurrentIndex(idx);
        setUserLocked(true);
        // Scroll the section into view when navigating via hash
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [sectionId, featureItems, getSlug]);

  useEffect(() => {
    const updatePrimaryColor = () => {
      const tempDiv = document.createElement('div');
      tempDiv.style.color = 'var(--primary)';
      document.body.appendChild(tempDiv);
      const computedColor = window.getComputedStyle(tempDiv).color;
      document.body.removeChild(tempDiv);
      setPrimaryColor(computedColor);
    };

    updatePrimaryColor();

    const observer = new MutationObserver(updatePrimaryColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => observer.disconnect();
  }, []);

  const isInView = useInView(containerRef, { amount: 'some' });
  const isVertical = linePosition === 'left' || linePosition === 'right';
  const currentItem = featureItems[currentIndex];

  const handleTabClick = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      setUserLocked(true);
      setTrigger((prev) => prev + 1);
      if (sectionId) {
        const slug = getSlug(featureItems[index]);
        window.history.replaceState(null, '', `#${sectionId}/${slug}`);
      }
    },
    [sectionId, featureItems, getSlug]
  );

  // Auto-rotate only when not user-locked
  useEffect(() => {
    if (!isInView || featureItems.length === 0 || userLocked) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featureItems.length);
    }, collapseDelay);

    return () => clearInterval(interval);
  }, [isInView, featureItems.length, collapseDelay, trigger, userLocked]);

  const renderMedia = () => {
    if (!currentItem) {
      return (
        <motion.div
          key={`empty-${currentIndex}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={MEDIA_TRANSITION}
          className="min-h-[400px] w-full rounded-xl border border-border bg-muted p-1"
        />
      );
    }

    if (currentItem.contentType && CONTENT_TYPE_COMPONENTS[currentItem.contentType]) {
      const ContentComponent = CONTENT_TYPE_COMPONENTS[currentItem.contentType];
      return (
        <motion.div
          key={`custom-${currentIndex}-${currentItem.id}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={MEDIA_TRANSITION}
          className="w-full"
        >
          <ContentComponent />
        </motion.div>
      );
    }

    if (currentItem.image) {
      return (
        <motion.img
          key={`image-${currentIndex}-${currentItem.id}`}
          src={currentItem.image}
          alt={currentItem.title}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={MEDIA_TRANSITION}
          className="h-full w-full min-h-[400px] rounded-xl border border-border object-cover p-1"
        />
      );
    }

    if (currentItem.video) {
      return (
        <motion.video
          key={`video-${currentIndex}-${currentItem.id}`}
          src={currentItem.video}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={MEDIA_TRANSITION}
          className="min-h-[400px] h-full w-full rounded-lg object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      );
    }

    return (
      <motion.div
        key={`fallback-${currentIndex}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={MEDIA_TRANSITION}
        className="min-h-[400px] w-full rounded-xl border border-border bg-muted p-1"
      />
    );
  };

  return (
    <div ref={containerRef} className="w-full flex flex-col">
      <div
        className="w-full grid overflow-hidden border-b"
        style={{ gridTemplateColumns: `repeat(${featureItems.length}, minmax(0, 1fr))` }}
      >
        {featureItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTabClick(index)}
            className="relative cursor-pointer overflow-hidden w-full min-h-[44px] p-5 text-sm font-semibold whitespace-nowrap transition-colors text-center group flex items-center justify-center touch-manipulation before:absolute before:left-0 before:top-0 before:z-10 before:h-screen before:w-px first:before:bg-transparent before:bg-border before:content-[''] after:absolute after:-left-px after:-top-px after:z-10 after:w-screen after:h-px last:after:bg-transparent after:bg-border after:content-['']"
          >
            {currentIndex === index && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MEDIA_TRANSITION}
                className="absolute inset-0 w-[calc(100%+1rem)] h-10 -z-10 mask-[linear-gradient(to_bottom,white,transparent)]"
              >
                <FlickeringGrid
                  className="absolute inset-0 z-0 size-full"
                  squareSize={3}
                  gridGap={2}
                  color={primaryColor}
                  maxOpacity={0.5}
                  flickerChance={0.2}
                />
              </motion.div>
            )}
            {item.title}
            {currentIndex === index && !userLocked && (
              <span
                aria-hidden
                className={cn('pointer-events-none absolute', LINE_POSITION_CLASSES[linePosition])}
              >
                <motion.span
                  key={`${currentIndex}-${trigger}`}
                  className={cn(
                    'absolute inset-0 -top-px',
                    isVertical ? 'origin-top' : 'origin-left',
                    lineColor,
                    isVertical ? 'w-px h-full' : 'h-px w-full'
                  )}
                  initial={isVertical ? { scaleY: 0 } : { scaleX: 0 }}
                  animate={isVertical ? { scaleY: 1 } : { scaleX: 1 }}
                  transition={{
                    duration: collapseDelay / 1000,
                    ease: 'linear',
                  }}
                />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="w-full p-4 relative overflow-hidden">
        <AnimatePresence mode="wait">{renderMedia()}</AnimatePresence>
      </div>
    </div>
  );
};
