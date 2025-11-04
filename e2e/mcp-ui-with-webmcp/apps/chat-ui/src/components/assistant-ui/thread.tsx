import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useMessage,
} from '@assistant-ui/react';
import { IframeParentTransport } from '@mcp-b/transports';
import {
  basicComponentLibrary,
  type RemoteElementConfiguration,
  remoteButtonDefinition,
  remoteStackDefinition,
  remoteTextDefinition,
  type UIActionResult,
  UIResourceRenderer,
} from '@mcp-ui/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  Activity,
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Code,
  CopyIcon,
  FileText,
  Info,
  MessageSquare,
  Paperclip,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
  Trash2,
  Wrench,
  X as XIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FC } from 'react';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownText } from '@/components/assistant-ui/markdown-text';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUIResources } from '@/contexts/UIResourceContext';
import { useMCP } from '@/hooks/useMCP';
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { getStoredServerUrl } from '../../lib/storage';
import { NotifyMessage } from './notify-message';
import { StreamingOverlay } from './streaming-overlay';
import { ToolExecutionPanel } from './tool-execution-panel';
import { ToolFallback } from './tool-fallback';

// Context for sharing tool surface state
type ToolSurfaceContextValue = {
  hasToolSurface: boolean;
  isLargeScreen: boolean;
};

const ToolSurfaceContext = createContext<ToolSurfaceContextValue | null>(null);

// Marker to identify notify messages in the thread
const NOTIFY_MESSAGE_PREFIX = '[NOTIFY_MESSAGE]';

const REMOTE_DOM_ELEMENTS: RemoteElementConfiguration[] = [
  remoteButtonDefinition,
  remoteTextDefinition,
  remoteStackDefinition,
];

const formatTimestamp = (value: Date) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(value);
  } catch {
    return value instanceof Date ? value.toLocaleTimeString() : '';
  }
};

interface TabSelectorProps {
  openToolsPanelId: string | null;
  setOpenToolsPanelId: (id: string | null) => void;
}

const TabSelector: FC<TabSelectorProps> = ({ openToolsPanelId, setOpenToolsPanelId }) => {
  const { resources, selectedResourceId, selectResource, removeResource } = useUIResources();
  const { tools } = useMCP();

  if (resources.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 bg-muted/10 overflow-x-auto sm:px-3 sm:py-2">
      {resources.map((resource) => {
        const isSelected = resource.id === selectedResourceId;
        // Filter tools for this specific iframe
        const iframeTools = tools.filter((tool) => {
          const toolWithSource = tool as { _sourceId?: string };
          return toolWithSource._sourceId === resource.id;
        });
        const toolCount = iframeTools.length;
        const isToolsPanelOpen = openToolsPanelId === resource.id;

        return (
          <div
            key={resource.id}
            className={cn(
              'group flex items-center gap-1 px-2 py-1 rounded-t-lg border-t border-x transition-colors whitespace-nowrap text-xs sm:gap-1.5 sm:px-3 sm:py-1.5',
              isSelected
                ? 'bg-background border-border text-foreground'
                : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <button
              onClick={() => selectResource(resource.id)}
              className="font-medium hover:opacity-80 transition-opacity"
            >
              {resource.toolName}
            </button>

            {/* Tools button */}
            {toolCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenToolsPanelId(isToolsPanelOpen ? null : resource.id);
                    }}
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
                      isToolsPanelOpen
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground'
                    )}
                    aria-label={`View ${toolCount} tools from ${resource.toolName}`}
                  >
                    <Wrench className="h-2.5 w-2.5" />
                    <span>{toolCount}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    This iframe exposes {toolCount} tool{toolCount !== 1 ? 's' : ''} that can be
                    executed by the model
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            <button
              onClick={async (e) => {
                e.stopPropagation();
                await removeResource(resource.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive p-2 -m-2"
              aria-label={`Close ${resource.toolName}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const Thread: FC = () => {
  return <ThreadContent />;
};

type MobileView = 'chat' | 'ui';

const ThreadContent: FC = () => {
  const { resources } = useUIResources();
  const [mobileView, setMobileView] = useState<MobileView>('chat');

  const hasToolSurface = resources.length > 0;

  // Detect screen size for responsive animations
  const isMobile = useIsMobile();
  const isLargeScreen = !isMobile;
  const prefersReducedMotion = usePrefersReducedMotion();

  // Auto-switch to UI view on mobile when tool surface first appears
  useEffect(() => {
    if (isMobile && hasToolSurface) {
      setMobileView('ui');
    }
  }, [isMobile, hasToolSurface]);

  // Refs for gesture targets and scroll preservation
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const uiPanelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Store scroll position when switching views on mobile
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);

  // Save scroll position when leaving chat view, restore when returning
  useEffect(() => {
    if (!isMobile || !hasToolSurface) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    if (mobileView === 'ui') {
      // Switching away from chat - save scroll position
      setSavedScrollPosition(viewport.scrollTop);
    } else if (mobileView === 'chat') {
      // Switching back to chat - restore scroll position
      viewport.scrollTop = savedScrollPosition;
    }
  }, [mobileView, isMobile, hasToolSurface, savedScrollPosition]);

  // Pan gesture handlers for swipe navigation
  const handlePanEnd = useCallback(
    (
      _event: PointerEvent | MouseEvent | TouchEvent,
      info: { offset: { x: number; y: number } }
    ) => {
      // Only handle swipe on mobile when tool surface is visible
      if (!isMobile || !hasToolSurface) return;

      const swipeThreshold = 50; // Minimum distance for swipe detection
      const { x } = info.offset;

      // Swipe left (negative x): Chat → UI
      if (x < -swipeThreshold && mobileView === 'chat') {
        setMobileView('ui');
      }
      // Swipe right (positive x): UI → Chat
      else if (x > swipeThreshold && mobileView === 'ui') {
        setMobileView('chat');
      }
    },
    [isMobile, hasToolSurface, mobileView]
  );

  const toolSurfaceValue = useMemo(
    () => ({
      hasToolSurface,
      isLargeScreen,
    }),
    [hasToolSurface, isLargeScreen]
  );

  return (
    <ToolSurfaceContext.Provider value={toolSurfaceValue}>
      <ThreadPrimitive.Root
        className="relative h-full w-full overflow-hidden bg-background text-foreground"
        style={{
          ['--thread-max-width' as string]: hasToolSurface && isLargeScreen ? '36rem' : '48rem',
        }}
      >
        {/* Side Panel - Absolutely Positioned with Slide Animation */}
        <AnimatePresence initial={false}>
          {hasToolSurface && (
            <motion.aside
              key="tool-surface"
              ref={uiPanelRef}
              onPanEnd={isMobile && hasToolSurface ? handlePanEnd : undefined}
              initial={{ x: isLargeScreen ? '-100%' : mobileView === 'ui' ? '0%' : '100%' }}
              animate={{ x: isLargeScreen ? 0 : mobileView === 'ui' ? '0%' : '100%' }}
              exit={{ x: isLargeScreen ? '-100%' : '100%' }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.42, 0, 0.58, 1] }}
              style={{
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                contain: 'layout style paint',
                touchAction: isMobile && hasToolSurface ? 'pan-y' : 'auto',
              }}
              className={cn(
                'absolute inset-y-0 left-0 z-10 flex w-full max-w-full flex-col overflow-hidden border-b border-border/40 bg-background lg:w-[55%] lg:max-w-[800px] lg:border-b-0 lg:border-r',
                isMobile && 'pb-16'
              )}
            >
              <ToolResponsePanel />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Chat Content - Uses absolute positioning for layout */}
        <motion.div
          ref={chatPanelRef}
          onPanEnd={isMobile && hasToolSurface ? handlePanEnd : undefined}
          animate={
            isLargeScreen
              ? {
                  left: hasToolSurface ? '55%' : '0%',
                  x: 0,
                }
              : {
                  left: 0,
                  x: hasToolSurface ? (mobileView === 'chat' ? '0%' : '-100%') : '0%',
                }
          }
          transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.42, 0, 0.58, 1] }}
          style={{
            willChange: isLargeScreen ? 'left' : 'transform',
            backfaceVisibility: 'hidden',
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            touchAction: isMobile && hasToolSurface ? 'pan-y' : 'auto',
          }}
          className="flex h-full min-h-0 flex-col"
        >
          <ThreadPrimitive.Viewport
            ref={viewportRef}
            className={cn(
              'flex h-full flex-1 flex-col overflow-y-auto scroll-smooth px-3 pt-6 sm:px-6 sm:pt-8 md:px-8 md:pt-10 max-[500px]:pt-3 transition-[align-items,padding] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)]',
              hasToolSurface ? 'items-stretch lg:items-end lg:px-10' : 'items-center',
              // Dynamic bottom padding based on screen size and tool surface presence
              // Minimal padding to bring thread content very close to composer
              // Reduced in landscape (max-height 500px) for better space usage
              isMobile && hasToolSurface
                ? 'pb-44 max-[500px]:pb-32'
                : isMobile
                  ? 'pb-36 max-[500px]:pb-28'
                  : 'pb-44'
            )}
          >
            <ThreadWelcome />

            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                EditComposer,
                AssistantMessage,
              }}
            />

            <ThreadPrimitive.If empty={false}>
              <div className="min-h-8 flex-grow" />
            </ThreadPrimitive.If>
          </ThreadPrimitive.Viewport>

          {/* Gradient overlay above composer */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background via-background/60 to-transparent" />

          {/* Fixed position composer at bottom - floats above content */}
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center px-3 sm:px-6 md:px-8',
              isMobile && hasToolSurface
                ? 'pb-16 pt-2 max-[500px]:pb-12 max-[500px]:pt-1'
                : isMobile
                  ? 'pb-4 pt-2 max-[500px]:pb-3 max-[500px]:pt-1'
                  : 'pb-4 pt-6 sm:pt-8'
            )}
            style={{
              paddingBottom:
                isMobile && hasToolSurface
                  ? 'max(4rem, env(safe-area-inset-bottom))'
                  : isMobile
                    ? 'max(1rem, env(safe-area-inset-bottom))'
                    : 'max(1rem, env(safe-area-inset-bottom))',
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
            }}
          >
            <div className="pointer-events-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-3 transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)]">
              <ThreadScrollToBottom />
              <Composer />
            </div>
          </div>
        </motion.div>

        {/* Mobile View Toggle Bar */}
        {isMobile && hasToolSurface && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: [0.42, 0, 0.58, 1] }}
            className="pointer-events-auto absolute bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm shadow-lg"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }}
          >
            <div className="flex items-center justify-around p-1 gap-1 max-[500px]:p-0.5 max-[500px]:gap-0.5">
              <button
                onClick={() => setMobileView('chat')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg transition-all max-[500px]:py-1.5 max-[500px]:px-2',
                  mobileView === 'chat'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <MessageSquare className="h-4 w-4 max-[500px]:h-3.5 max-[500px]:w-3.5" />
                <span className="text-sm font-medium max-[500px]:text-xs">Chat</span>
              </button>
              <button
                onClick={() => setMobileView('ui')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg transition-all max-[500px]:py-1.5 max-[500px]:px-2',
                  mobileView === 'ui'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Wrench className="h-4 w-4 max-[500px]:h-3.5 max-[500px]:w-3.5" />
                <span className="text-sm font-medium max-[500px]:text-xs">Embedded UI</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Streaming Overlay - shows assistant response on mobile chat view */}
        {isMobile && mobileView !== 'chat' && hasToolSurface && <StreamingOverlay />}
      </ThreadPrimitive.Root>
    </ToolSurfaceContext.Provider>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="secondary"
        className="self-end size-11 rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur transition-transform disabled:invisible"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-col items-center gap-4 pb-6 pt-8 text-center transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] sm:gap-6 sm:pb-8 sm:pt-12 md:gap-8 md:pt-16">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
            How can I help you today?
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Choose a suggestion below to get started
          </p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  const { prompts } = useMCP();

  // Show placeholder if no prompts are available
  if (prompts.length === 0) {
    return (
      <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3">
        <div className="flex min-w-[160px] max-w-md flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-center sm:min-w-[200px] sm:gap-2 sm:rounded-xl sm:p-4">
          <span className="text-xs text-muted-foreground sm:text-sm">
            Connect any tool or embedded iframe that exposes WebMCP prompts and they will appear
            here as suggestions
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3">
      {prompts.slice(0, 3).map((prompt) => (
        <ThreadPrimitive.Suggestion
          key={prompt.name}
          className="group flex min-w-[160px] max-w-xs cursor-pointer flex-col items-start gap-1.5 rounded-lg border border-border/60 bg-background p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:min-w-[200px] sm:gap-2 sm:rounded-xl sm:p-4"
          prompt={prompt.description || prompt.title || prompt.name}
        >
          <span className="text-xs font-medium tracking-tight group-hover:text-primary sm:text-sm">
            {prompt.description || prompt.title || prompt.name}
          </span>
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
};

// Removed: ThreadWelcomeTicTacToeDemo - now using real tool from MCP server

const ToolResponsePanel: FC = () => {
  const { resources, selectedResourceId, setResourceCleanup } = useUIResources();
  const { tools, callTool, registerWebMcpClient, registerWebMcpTools, unregisterWebMcpClient } =
    useMCP();
  const [lastUIAction, setLastUIAction] = useState<UIActionResult | null>(null);
  const [openToolsPanelId, setOpenToolsPanelId] = useState<string | null>(null);
  const runtime = useAssistantRuntime();

  const selectedResource = useMemo(() => {
    return resources.find((r) => r.id === selectedResourceId);
  }, [resources, selectedResourceId]);

  // Filter tools for the currently open tool panel
  const iframeTools = useMemo(() => {
    if (!openToolsPanelId) return [];
    return tools.filter((tool) => {
      const toolWithSource = tool as { _sourceId?: string };
      return toolWithSource._sourceId === openToolsPanelId;
    });
  }, [tools, openToolsPanelId]);

  const handleUIAction = useCallback(
    async (action: UIActionResult) => {
      setLastUIAction(action);

      if (action.type === 'notify') {
        if (runtime.thread.getState().isRunning) {
          runtime.thread.cancelRun();
        }
        await new Promise((resolve) => setTimeout(resolve, 100)); // wait for cancellation to propagate
        // Prefix message with marker so we can identify it as a notify message
        runtime.thread.append(`${NOTIFY_MESSAGE_PREFIX}${action.payload.message}`);
      }

      return { status: 'UI action handled in panel' };
    },
    [runtime]
  );

  /**
   * Handle iframe resize events
   *
   * Listens for ui-size-change messages from iframes and updates their dimensions.
   * This is part of the embeddable UI protocol but handled separately from user actions
   * since it's not included in the @mcp-ui/client UIActionResult type yet.
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ui-size-change') {
        const payload = event.data.payload as { height?: number; width?: number };

        if (selectedResource?.iframeRef?.current) {
          const iframe = selectedResource.iframeRef.current;
          const container = iframe.parentElement;

          if (payload.width !== undefined && payload.height !== undefined && container) {
            const containerWidth = container.clientWidth;

            // Scale based on width only - mobile users expect vertical scrolling
            // Leave a bit of padding (95% of container width)
            const targetWidth = containerWidth * 0.95;
            const scale = Math.min(targetWidth / payload.width, 1); // Don't scale up, only down

            // Set natural dimensions
            iframe.style.width = `${payload.width}px`;
            iframe.style.height = `${payload.height}px`;

            // Apply scaling if needed (on mobile/small screens)
            if (scale < 1) {
              iframe.style.transform = `scale(${scale})`;
              iframe.style.transformOrigin = 'top center';
              // Adjust container to account for scaled size
              iframe.style.marginBottom = `${payload.height * (scale - 1)}px`;
            } else {
              iframe.style.transform = 'none';
              iframe.style.marginBottom = '0';
            }

            console.log(
              `📏 Iframe resized: ${payload.width}x${payload.height} (scale: ${scale.toFixed(2)})`
            );
          } else if (payload.width !== undefined) {
            iframe.style.width = `${payload.width}px`;
            iframe.style.maxWidth = '100%';
          } else if (payload.height !== undefined) {
            iframe.style.height = `${payload.height}px`;
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [selectedResource]);

  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>, sourceId?: string) => {
      return await callTool({ name: toolName, arguments: args }, sourceId);
    },
    [callTool]
  );

  if (!selectedResource) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-4">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">No Resource Selected</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Select a resource tab above to view its UI
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-full h-full flex flex-col overflow-hidden">
      {/* Tab Selector */}
      <TabSelector openToolsPanelId={openToolsPanelId} setOpenToolsPanelId={setOpenToolsPanelId} />

      {/* Iframe-specific Tool Execution Panel */}
      {openToolsPanelId && iframeTools.length > 0 && (
        <div className="p-2 sm:p-3 bg-muted/5 border-b border-border/40">
          <ToolExecutionPanel
            tools={iframeTools}
            onToolCall={handleToolCall}
            title={`Tools from ${resources.find((r) => r.id === openToolsPanelId)?.toolName || 'iframe'}`}
            showClose
            onClose={() => setOpenToolsPanelId(null)}
          />
        </div>
      )}

      {/* Full-Screen UI Resource Renderer */}
      <div className="relative flex-1 overflow-hidden max-w-full">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={selectedResource.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.42, 0, 0.58, 1] }}
            style={{
              willChange: 'opacity',
              backfaceVisibility: 'hidden',
            }}
            className="absolute inset-0 w-full max-w-full h-full"
          >
            <UIResourceRenderer
              resource={selectedResource.resource}
              onUIAction={handleUIAction}
              htmlProps={{
                iframeProps: {
                  ref: selectedResource.iframeRef as React.RefObject<HTMLIFrameElement>,
                  onLoad: async (e) => {
                    const iframe = e.currentTarget;
                    const sourceId = selectedResource.id;

                    // UI Lifecycle Protocol Handler
                    // Listen for iframe ready signal and respond to enable UI interaction
                    const handleIframeLifecycleMessage = (event: MessageEvent) => {
                      // Basic origin check - accept messages from the iframe
                      if (event.source !== iframe.contentWindow) {
                        return;
                      }

                      // Respond to iframe ready signal
                      if (event.data?.type === 'ui-lifecycle-iframe-ready') {
                        console.log('[UI Lifecycle] Iframe ready, sending parent-ready signal');
                        iframe.contentWindow?.postMessage(
                          { type: 'parent-ready', payload: {} },
                          '*'
                        );
                      }
                    };

                    window.addEventListener('message', handleIframeLifecycleMessage);

                    // Create Client + Transport pair (1-to-1 relationship)
                    const client = new Client({
                      name: 'WebMCP Client',
                      version: '1.0.0',
                    });
                    const transport = new IframeParentTransport({
                      targetOrigin: new URL(getStoredServerUrl()).origin,
                      iframe: iframe,
                    });

                    try {
                      await client.connect(transport);

                      // Register client for tool routing
                      registerWebMcpClient(sourceId, client);

                      // Fetch and register tools with app
                      const toolsResponse = await client.listTools();
                      registerWebMcpTools(toolsResponse.tools, sourceId);

                      // Listen for tool list changes
                      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
                        const updated = await client.listTools();
                        registerWebMcpTools(updated.tools, sourceId);
                      });

                      // Store cleanup function in the resource (properly via context method)
                      setResourceCleanup(sourceId, async () => {
                        try {
                          // Clean up UI lifecycle listener
                          window.removeEventListener('message', handleIframeLifecycleMessage);

                          await client.close();
                          await transport.close();
                        } catch (error) {
                          console.error(`Error closing client/transport for ${sourceId}:`, error);
                        }
                        // Trigger App-level cleanup (removes tools from state)
                        unregisterWebMcpClient(sourceId);
                      });
                    } catch (error) {
                      console.error('WebMCP connection failed:', error);
                    }
                  },
                },
              }}
              remoteDomProps={{
                library: basicComponentLibrary,
                remoteElements: REMOTE_DOM_ELEMENTS,
              }}
            />
          </motion.div>
        </AnimatePresence>

        {/* Overlay Icons - Bottom Right Corner */}
        <div className="absolute bottom-2 right-2 flex gap-1.5 z-10 sm:bottom-4 sm:right-4 sm:gap-2">
          {/* Resource Info Icon */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="h-11 w-11 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-lg hover:bg-background transition-colors flex items-center justify-center">
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-semibold text-xs">Resource Info</p>
                <p className="text-xs">
                  <span className="font-medium">URI:</span> {String(selectedResource.resource.uri)}
                </p>
                {Boolean(selectedResource.resource.mimeType) && (
                  <p className="text-xs">
                    <span className="font-medium">Type:</span>{' '}
                    {String(selectedResource.resource.mimeType)}
                  </p>
                )}
                <p className="text-xs">
                  <span className="font-medium">Time:</span>{' '}
                  {formatTimestamp(selectedResource.timestamp)}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Raw JSON Icon */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="h-11 w-11 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-lg hover:bg-background transition-colors flex items-center justify-center">
                <Code className="h-4 w-4 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-md max-h-96 overflow-auto">
              <p className="font-semibold text-xs mb-2">Resource Data</p>
              <pre className="text-xs leading-relaxed">
                {JSON.stringify(selectedResource.resource, null, 2)}
              </pre>
            </TooltipContent>
          </Tooltip>

          {/* UI Action Icon */}
          {lastUIAction && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="h-11 w-11 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/40 shadow-lg hover:bg-primary/20 transition-colors flex items-center justify-center">
                  <Activity className="h-4 w-4 text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-md">
                <p className="font-semibold text-xs mb-2">Last UI Action</p>
                <pre className="text-xs leading-relaxed">
                  {JSON.stringify(lastUIAction, null, 2)}
                </pre>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Tool Name Badge - Bottom Left Corner */}
        <div className="absolute bottom-2 left-2 z-10 sm:bottom-4 sm:left-4">
          <div className="px-2 py-1 rounded-full bg-background/95 backdrop-blur-sm border border-border/60 shadow-lg text-xs sm:px-3 sm:py-1.5">
            <p className="font-semibold text-foreground truncate max-w-[120px] sm:max-w-none">
              {selectedResource.toolName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Removed ToolRunCard - now using full-screen UI rendering in ToolResponsePanel

const ResourcesList: FC<{
  resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
}> = ({ resources }) => {
  const { readResource } = useMCP();
  const [expandedResources, setExpandedResources] = useState(false);

  const displayedResources = expandedResources ? resources : resources.slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          <span>Available Resources</span>
        </div>
        {resources.length > 3 && (
          <button
            onClick={() => setExpandedResources(!expandedResources)}
            className="text-xs text-primary hover:underline"
          >
            {expandedResources ? 'Show less' : `Show all ${resources.length}`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {displayedResources.map((resource) => (
          <button
            key={resource.uri}
            onClick={() => {
              readResource(resource.uri).then(console.log).catch(console.error);
            }}
            className="group flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs transition-all hover:border-primary/40 hover:bg-muted/40"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{resource.name}</span>
              {resource.description && (
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {resource.description}
                </span>
              )}
            </div>
            {resource.mimeType && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {resource.mimeType.split('/')[1] || resource.mimeType}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
// Removed ToolResultModal - now using side panel for all tool results
// Removed ToolCallState and ToolResultContent types - moved to ToolExecutionPanel component

const Composer: FC = () => {
  const { tools, resources, callTool } = useMCP();
  const { resources: uiResources, removeResource } = useUIResources();
  const [showTools, setShowTools] = useState(false);
  const assistantRuntime = useAssistantRuntime();

  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>, sourceId?: string) => {
      return await callTool({ name: toolName, arguments: args }, sourceId);
    },
    [callTool]
  );

  const handleResetThread = useCallback(async () => {
    // Clear the conversation by creating a new thread
    const currentState = assistantRuntime.thread.getState();
    if (currentState.isRunning) {
      assistantRuntime.thread.cancelRun();
    }

    // Close all UI resources (iframes)
    for (const resource of uiResources) {
      await removeResource(resource.id);
    }

    // Start a new thread by switching to a new thread ID
    // This will clear all messages and start fresh
    assistantRuntime.thread.import({
      messages: [],
    });
  }, [assistantRuntime, uiResources, removeResource]);

  return (
    <div className="flex w-full flex-col gap-2 sm:gap-3">
      {/* Expanded Tools List */}
      {showTools && tools.length > 0 && (
        <ToolExecutionPanel
          tools={tools}
          onToolCall={handleToolCall}
          title="Available Tools"
          showClose
          onClose={() => setShowTools(false)}
        />
      )}

      <ComposerPrimitive.Root className="focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 flex w-full flex-col gap-1.5 rounded-xl border border-border/60 bg-background shadow-xl backdrop-blur-sm transition-all ease-in-out sm:gap-2 sm:rounded-2xl max-[500px]:gap-1">
        {/* Main Input Row */}
        <div className="flex items-end gap-1.5 px-3 pt-3 pb-2 sm:gap-2 sm:px-4 sm:pt-4 sm:pb-3 max-[500px]:px-2 max-[500px]:pt-2 max-[500px]:pb-1.5">
          {/* Tools button */}
          {tools.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowTools(!showTools)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all sm:gap-1.5 sm:rounded-xl sm:px-2.5 sm:py-2',
                    showTools
                      ? 'bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:shadow-sm'
                  )}
                  aria-label="View available tools"
                >
                  <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="tabular-nums">{tools.length}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  View {tools.length} available tool{tools.length !== 1 ? 's' : ''}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder="Type your message..."
            className="placeholder:text-muted-foreground max-h-48 min-h-9 flex-1 resize-none border-none bg-transparent py-2 text-base leading-relaxed outline-none disabled:cursor-not-allowed sm:min-h-10 sm:py-2.5"
            enterKeyHint="send"
          />
          <ComposerAction />
        </div>

        {/* Toolbar Row */}
        <ThreadPrimitive.If empty={false}>
          <div className="flex items-center justify-between border-t border-border/40 bg-muted/5 px-3 py-1.5 sm:px-4 sm:py-2 max-[500px]:px-2 max-[500px]:py-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Reset Thread Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleResetThread}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:gap-1.5 sm:px-2.5 sm:py-1.5"
                    aria-label="Reset conversation"
                  >
                    <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Clear all messages and start a new conversation</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Press</span>
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-xs sm:px-1.5">
                Enter
              </kbd>
              <span className="hidden sm:inline">to send</span>
            </div>
          </div>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>

      {/* Resources as Attachments */}
      {resources.length > 0 && <ResourcesList resources={resources} />}
    </div>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2 size-11 p-2.5 transition-opacity ease-in"
          >
            <SendHorizontalIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2 size-11 p-2.5 transition-opacity ease-in"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  const message = useMessage();

  // Get the text content from the message
  const textContent = message.content.find(
    (part): part is { type: 'text'; text: string } => part.type === 'text'
  );
  const content = textContent?.text || '';

  // Check if this is a notify message
  const isNotifyMessage = content.startsWith(NOTIFY_MESSAGE_PREFIX);

  if (isNotifyMessage) {
    // Extract the actual message content without the prefix
    const actualMessage = content.slice(NOTIFY_MESSAGE_PREFIX.length);

    return (
      <MessagePrimitive.Root className="grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 py-4 transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] [&:where(>*)]:col-start-2">
        <UserActionBar />

        <motion.div
          layout
          className="col-start-2 row-start-2"
          transition={{
            duration: 0.4,
            ease: [0.42, 0, 0.58, 1],
            layout: { duration: 0.4, ease: [0.42, 0, 0.58, 1] },
          }}
          style={{
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          <NotifyMessage message={actualMessage} timestamp={message.createdAt} />
        </motion.div>

        <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </MessagePrimitive.Root>
    );
  }

  // Regular user message
  return (
    <MessagePrimitive.Root className="grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-1.5 py-2.5 transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] sm:gap-y-2 sm:py-4 [&:where(>*)]:col-start-2">
      <UserActionBar />

      <motion.div
        layout
        className="col-start-2 row-start-2"
        transition={{
          duration: 0.4,
          ease: [0.42, 0, 0.58, 1],
          layout: { duration: 0.4, ease: [0.42, 0, 0.58, 1] },
        }}
        style={{
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
      >
        <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] rounded-2xl px-3 py-2 text-sm wrap-break-word transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] sm:rounded-3xl sm:px-5 sm:py-2.5 sm:text-base">
          <MessagePrimitive.Parts />
        </div>
      </motion.div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="col-start-1 row-start-2 mt-2.5 mr-3 flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl transition-[max-width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)]">
      <ComposerPrimitive.Input
        className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none"
        enterKeyHint="send"
      />

      <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">Cancel</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>Send</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] py-2.5 transition-[max-width,grid-template-columns] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] sm:py-4">
      <div className="text-foreground col-span-2 col-start-2 row-start-1 my-1 max-w-[calc(var(--thread-max-width)*0.8)] text-sm leading-6 wrap-break-word transition-[max-width,width] duration-400 ease-[cubic-bezier(0.42,0,0.58,1)] sm:my-1.5 sm:text-base sm:leading-7">
        <MessagePrimitive.Parts
          components={{ Text: MarkdownText, tools: { Fallback: ToolFallback } }}
        />
        <MessageError />
      </div>

      <AssistantActionBar />

      <BranchPicker className="col-start-2 row-start-2 mr-2 -ml-2" />
    </MessagePrimitive.Root>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="border-destructive bg-destructive/10 dark:bg-destructive/5 text-destructive mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground data-[floating]:bg-background col-start-3 row-start-2 -ml-1 flex gap-1 data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn('text-muted-foreground inline-flex items-center text-xs', className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <title>Stop</title>
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};
