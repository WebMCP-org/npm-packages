import { AssistantRuntimeProvider, useAssistantTool } from '@assistant-ui/react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  CallToolRequest,
  CallToolResult,
  Prompt as MCPPrompt,
  Resource as MCPResource,
  Tool as MCPTool,
} from '@modelcontextprotocol/sdk/types.js';
import { AlertCircle, ExternalLink, Loader2, Menu, Plug, PlugZap, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeyInput } from '@/components/ApiKeyInput';
import { Thread } from '@/components/assistant-ui/thread';
import { ToolSourceBadge } from '@/components/assistant-ui/tool-source-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MCPContext, type MCPContextValue } from '@/contexts/MCPContext';
import { useUIResources } from '@/contexts/UIResourceContext';

// Type for tools with source metadata
type ToolWithSource = MCPTool & { _sourceId: string };

import { isUIResource } from '@mcp-ui/client';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { clearStoredServerUrl, getStoredApiKey, setStoredServerUrl } from '@/lib/storage';
import { createClient } from './MCP';

function McpToolBridge({
  toolName,
  toolDescription,
  inputSchema,
  callTool,
}: {
  toolName: string;
  toolDescription: string;
  inputSchema: unknown;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const { addResource } = useUIResources();

  useAssistantTool({
    toolName,
    description: toolDescription,
    parameters: inputSchema as Record<string, unknown>,
    execute: async (args) => {
      try {
        const result: CallToolResult = (await callTool(toolName, args)) as CallToolResult;
        result.content.forEach((content) => {
          if (isUIResource(content) && content.resource) {
            addResource({
              toolName: toolName,
              resource: content.resource,
            });
          }
        });
        return result;
      } catch (error) {
        console.error('[Client] Tool execution failed:', error);
        throw error;
      }
    },
  });

  return null; // This component only registers the tool
}

function App() {
  const [mcpState, setMCPState] = useState<
    'disconnected' | 'connecting' | 'loading' | 'ready' | 'failed'
  >('disconnected');
  // Aggressive modal: show if no API key OR not connected (demo app requirement)
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(
    !getStoredApiKey() || mcpState !== 'ready'
  );
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [mcpPrompts, setMcpPrompts] = useState<MCPPrompt[]>([]);
  const [mcpResources, setMcpResources] = useState<MCPResource[]>([]);

  // MCP client and transport refs
  const clientRef = useRef<Client | null>(null);
  const transportRef = useRef<Transport | null>(null);

  // WebMCP state for iframe tools
  const [webMcpTools, setWebMcpTools] = useState<MCPTool[]>([]);
  const webMcpClients = useRef<Map<string, Client>>(new Map());

  const disconnectFromServer = useCallback(async () => {
    // Close existing connection
    if (clientRef.current) {
      try {
        await clientRef.current.close();
      } catch (error) {
        console.error('[App] Error closing client:', error);
      }
      clientRef.current = null;
    }

    if (transportRef.current) {
      try {
        await transportRef.current.close();
      } catch (error) {
        console.error('[App] Error closing transport:', error);
      }
      transportRef.current = null;
    }

    // Reset state
    setMcpTools([]);
    setMcpPrompts([]);
    setMcpResources([]);
    setMCPState('disconnected');

    // Clear server URL from localStorage
    clearStoredServerUrl();
  }, []);

  const connectToServer = useCallback(
    async (url: string) => {
      // Validate URL
      try {
        new URL(url);
      } catch (error) {
        console.error('[App] Invalid URL:', error);
        setMCPState('failed');
        return;
      }

      // Disconnect from existing server first
      await disconnectFromServer();

      setMCPState('connecting');

      try {
        // Create new client and transport
        const { client, transport } = createClient(
          {
            _clientInfo: {
              name: 'MCP-UI Demo',
              version: '1.0.0',
            },
          },
          {
            url: new URL(url),
          }
        );

        clientRef.current = client;
        transportRef.current = transport;

        await client.connect(transport);
        setMCPState('loading');

        // Fetch available tools, prompts, and resources
        const [toolsResponse, promptsResponse, resourcesResponse] = await Promise.all([
          client.listTools(),
          client.listPrompts().catch(() => ({ prompts: [] })),
          client.listResources().catch(() => ({ resources: [] })),
        ]);

        setMcpTools(toolsResponse.tools || []);
        setMcpPrompts(promptsResponse.prompts || []);
        setMcpResources(resourcesResponse.resources || []);

        // Save URL to localStorage
        setStoredServerUrl(url);

        setMCPState('ready');
      } catch (error) {
        console.error('MCP connection failed:', error);
        setMCPState('failed');

        // Clean up on failure
        clientRef.current = null;
        transportRef.current = null;
      }
    },
    [disconnectFromServer]
  );

  const callPrompt = useCallback(async (name: string, args?: Record<string, string>) => {
    if (!clientRef.current) {
      throw new Error('MCP client not connected');
    }
    try {
      const result = await clientRef.current.getPrompt({ name, arguments: args });
      return result;
    } catch (error) {
      console.error('[Client] Prompt call failed:', error);
      throw error;
    }
  }, []);

  const readResource = useCallback(async (uri: string) => {
    if (!clientRef.current) {
      throw new Error('MCP client not connected');
    }
    try {
      const result = await clientRef.current.readResource({ uri });
      return result;
    } catch (error) {
      console.error('[Client] Resource read failed:', error);
      throw error;
    }
  }, []);

  // WebMCP integration callbacks
  const registerWebMcpClient = useCallback((sourceId: string, webMcpClient: Client) => {
    webMcpClients.current.set(sourceId, webMcpClient);
  }, []);

  const registerWebMcpTools = useCallback((tools: MCPTool[], sourceId: string) => {
    setWebMcpTools((prev) => {
      // Remove old tools from this source
      const filtered = prev.filter((t) => (t as ToolWithSource)._sourceId !== sourceId);
      // Add new tools with source metadata
      const tagged = tools.map((t) => ({ ...t, _sourceId: sourceId }) as ToolWithSource);
      return [...filtered, ...tagged];
    });
  }, []);

  const unregisterWebMcpClient = useCallback((sourceId: string) => {
    const webMcpClient = webMcpClients.current.get(sourceId);
    if (webMcpClient) {
      webMcpClient.close?.();
      webMcpClients.current.delete(sourceId);
    }
    // Remove tools from this source
    setWebMcpTools((prev) => prev.filter((t) => (t as ToolWithSource)._sourceId !== sourceId));
  }, []);

  const callTool = useCallback(
    async (request: CallToolRequest['params'], sourceId?: string): Promise<CallToolResult> => {
      // Route to WebMCP iframe client if sourceId is provided
      if (sourceId) {
        const webMcpClient = webMcpClients.current.get(sourceId);
        if (!webMcpClient) {
          throw new Error(`WebMCP client not found for source: ${sourceId}`);
        }
        try {
          const result = await webMcpClient.callTool(request);
          return result as CallToolResult;
        } catch (error) {
          console.error(`[WebMCP Client ${sourceId}] Tool call failed:`, error);
          throw error;
        }
      }

      // Default to HTTP server client
      if (!clientRef.current) {
        throw new Error('MCP client not connected');
      }
      try {
        const result = await clientRef.current.callTool(request);
        return result as CallToolResult;
      } catch (error) {
        console.error('[HTTP Client] Tool call failed:', error);
        throw error;
      }
    },
    []
  );

  const mcpContextValue: MCPContextValue = useMemo(
    () => ({
      tools: [...mcpTools, ...webMcpTools], // Merge HTTP and WebMCP tools
      prompts: mcpPrompts,
      resources: mcpResources,
      state: mcpState,
      callPrompt,
      readResource,
      callTool,
      serverUrl: mcpState === 'ready' ? 'connected' : null, // Simplified - just indicate if connected
      connectServer: connectToServer,
      disconnectServer: disconnectFromServer,
      registerWebMcpClient,
      registerWebMcpTools,
      unregisterWebMcpClient,
    }),
    [
      mcpTools,
      webMcpTools,
      mcpPrompts,
      mcpResources,
      mcpState,
      callPrompt,
      readResource,
      callTool,
      connectToServer,
      disconnectFromServer,
      registerWebMcpClient,
      registerWebMcpTools,
      unregisterWebMcpClient,
    ]
  );

  // Cleanup all connections on unmount
  useEffect(() => {
    return () => {
      // Close all WebMCP clients
      webMcpClients.current.forEach((client) => {
        client.close().catch(console.error);
      });
      webMcpClients.current.clear();

      // Close main MCP connection
      if (clientRef.current) {
        clientRef.current.close().catch(console.error);
      }
      if (transportRef.current) {
        transportRef.current.close().catch(console.error);
      }
    };
  }, []);

  // Aggressive modal behavior: auto-show when connection fails or disconnected
  useEffect(() => {
    if (mcpState === 'failed' || mcpState === 'disconnected') {
      setShowApiKeyDialog(true);
    }
  }, [mcpState]);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: (messages) => {
      return lastAssistantMessageIsCompleteWithToolCalls(messages);
    },
    transport: new AssistantChatTransport({
      api: '/api/chat',
      credentials: 'include',
      fetch: async (url, options) => {
        // Read API key directly from localStorage on every request
        const currentApiKey = getStoredApiKey();
        return fetch(url, {
          ...options,
          headers: {
            ...options?.headers,
            ...(currentApiKey ? { 'X-Anthropic-API-Key': currentApiKey } : {}),
          },
        });
      },
    }),
  });

  return (
    <MCPContext.Provider value={mcpContextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        {/* Register MCP tools as frontend tools (HTTP + WebMCP) */}
        {mcpTools.map((tool) => {
          const sourceId = (tool as ToolWithSource)._sourceId;
          return (
            <McpToolBridge
              key={`${sourceId || 'http'}-${tool.name}`}
              toolName={tool.name}
              toolDescription={tool.description || ''}
              inputSchema={tool.inputSchema}
              callTool={(name, args) => {
                if (!clientRef.current) {
                  throw new Error('MCP client not connected');
                }
                return clientRef.current.callTool({ name, arguments: args });
              }}
            />
          );
        })}
        {webMcpTools.map((tool) => {
          const sourceId = (tool as ToolWithSource)._sourceId;
          return (
            <McpToolBridge
              key={`${sourceId || 'http'}-${tool.name}`}
              toolName={tool.name}
              toolDescription={tool.description || ''}
              inputSchema={tool.inputSchema}
              callTool={(name, args) => {
                // Route to WebMCP client
                const webMcpClient = webMcpClients.current.get(sourceId);
                if (!webMcpClient) {
                  throw new Error(`WebMCP client not found for source: ${sourceId}`);
                }
                return webMcpClient.callTool({ name, arguments: args });
              }}
            />
          );
        })}

        <div className="flex min-h-dvh w-full flex-col bg-gradient-to-br from-background via-background to-muted/20">
          {/* Header */}
          <header className="z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
            <div className="flex h-12 items-center justify-between gap-1.5 px-2 sm:h-14 sm:gap-3 sm:px-4 md:h-16 md:gap-4 md:px-6 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))]">
              {/* Logo and Title */}
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8 md:h-10 md:w-10">
                  <PlugZap className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4 md:h-5 md:w-5" />
                </div>
                <h1 className="truncate text-xs font-semibold tracking-tight sm:text-sm md:text-base lg:text-lg">
                  webMCP + mcp-ui
                </h1>
              </div>

              {/* Right side - Navigation, Connection status and settings */}
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {/* Mobile Menu - Hamburger */}
                <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 rounded-full shadow-sm md:hidden"
                    >
                      <Menu className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                    <SheetHeader className="mb-6">
                      <SheetTitle>Navigation</SheetTitle>
                    </SheetHeader>

                    {/* Navigation Links in Mobile Menu */}
                    <div className="flex flex-col gap-4 mb-6">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Links
                      </h3>
                      <nav className="flex flex-col gap-3">
                        <a
                          href="https://mcp-b.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                          onClick={() => setShowMobileMenu(false)}
                        >
                          MCP-B
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <a
                          href="https://docs.mcp-b.ai/mcpui-webmcp-integration"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                          onClick={() => setShowMobileMenu(false)}
                        >
                          View Docs
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <a
                          href="https://www.linkedin.com/in/alex-nahas/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                          onClick={() => setShowMobileMenu(false)}
                        >
                          Contact me
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </nav>
                    </div>

                    {/* Tool Source Legend in Mobile Menu */}
                    <div className="flex flex-col gap-4 pt-4 border-t">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Tool Sources
                      </h3>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <ToolSourceBadge sourceId={undefined} />
                          <span className="text-xs text-muted-foreground">Remote MCP Server</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ToolSourceBadge sourceId="webmcp" />
                          <span className="text-xs text-muted-foreground">Client JavaScript</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Tools can come from the remote MCP server (HTTP) or run directly in your
                        browser via WebMCP.
                      </p>
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Desktop Navigation Links */}
                <div className="hidden items-center gap-2 border-r pr-3 md:flex">
                  <a
                    href="https://mcp-b.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    MCP-B
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://docs.mcp-b.ai/mcpui-webmcp-integration"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View Docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://www.linkedin.com/in/alex-nahas/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Contact me
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Tool Source Legend */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="hidden items-center gap-2 border-r pr-3 lg:flex">
                        <span className="text-xs font-medium text-muted-foreground">
                          Tool Sources:
                        </span>
                        <ToolSourceBadge sourceId={undefined} className="text-xs px-1.5 py-0" />
                        <ToolSourceBadge sourceId="webmcp" className="text-xs px-1.5 py-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold">Tool Source Types:</p>
                        <p className="text-xs">
                          🔵 <strong>Remote MCP:</strong> Tools from HTTP MCP server
                        </p>
                        <p className="text-xs">
                          🟢 <strong>WebMCP:</strong> Tools that run in client JavaScript
                        </p>
                        <p className="text-xs text-muted-foreground ml-4">
                          No external servers required
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* MCP Connection Button and Status */}
                <TooltipProvider>
                  {mcpState === 'ready' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <output
                          className="flex items-center gap-1.5 rounded-lg border border-green-500/50 bg-green-500/10 px-2 py-1.5 sm:gap-2 sm:px-3 cursor-pointer"
                          aria-live="polite"
                        >
                          <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500" />
                          <span className="hidden text-xs font-medium text-green-700 dark:text-green-400 sm:inline sm:text-sm">
                            Connected
                          </span>
                          <div className="hidden gap-1 sm:flex">
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {mcpTools.length}
                            </Badge>
                          </div>
                          {/* Mobile: Just show tool count */}
                          <span className="text-xs font-medium text-green-700 dark:text-green-400 sm:hidden">
                            {mcpTools.length}
                          </span>
                        </output>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          MCP server connected ({mcpTools.length} tools available)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : mcpState === 'connecting' || mcpState === 'loading' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <output
                          className="flex items-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-500/10 px-2 py-1.5 sm:gap-2 sm:px-3 cursor-pointer"
                          aria-live="polite"
                        >
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500 sm:h-4 sm:w-4" />
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-400 sm:text-sm">
                            {mcpState === 'connecting' ? 'Connecting...' : 'Loading...'}
                          </span>
                        </output>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Establishing connection to MCP server...</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : mcpState === 'failed' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <output
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/10 px-2 py-1.5 sm:gap-2 sm:px-3 cursor-pointer"
                          aria-live="polite"
                        >
                          <AlertCircle className="h-3 w-3 shrink-0 text-red-500 sm:h-4 sm:w-4" />
                          <span className="text-xs font-medium text-red-700 dark:text-red-400 sm:text-sm">
                            Failed
                          </span>
                        </output>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Connection failed. Click Settings to try again.</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <output
                          className="flex items-center gap-1.5 rounded-lg border border-muted bg-muted/20 px-2 py-1.5 sm:gap-2 sm:px-3 cursor-pointer"
                          aria-live="polite"
                        >
                          <Plug className="h-3 w-3 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
                          <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                            Not Connected
                          </span>
                        </output>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">No server configured. Click Settings to connect.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TooltipProvider>

                {/* Settings button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowApiKeyDialog(true)}
                        className="shrink-0 rounded-full shadow-sm"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Configure API key and MCP server connection</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </header>

          {/* API Key warning banner */}
          {!getStoredApiKey() && (
            <div className="flex justify-center border-b bg-background px-4 py-3">
              <Card className="w-full max-w-xl border-yellow-500/50 bg-yellow-500/10">
                <CardContent className="flex flex-col gap-3 p-4 text-left sm:flex-row sm:items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                      API Key Required
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Please enter your Anthropic API key to start chatting
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowApiKeyDialog(true)}
                    className="w-full sm:w-auto"
                  >
                    Add Key
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main content - Thread with internal scrolling */}
          <div className="flex-1 overflow-hidden">
            <div className="flex h-full w-full flex-col">
              <Thread />
            </div>
          </div>

          <ApiKeyInput
            open={showApiKeyDialog}
            onClose={() => setShowApiKeyDialog(false)}
            onConnectServer={connectToServer}
            onDisconnectServer={disconnectFromServer}
            connectionState={mcpState}
          />
        </div>
      </AssistantRuntimeProvider>
    </MCPContext.Provider>
  );
}

export default App;
