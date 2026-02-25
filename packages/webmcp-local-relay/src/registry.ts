import { buildPublicToolName, extractSanitizedDomain } from './naming.js';
import type { BrowserHelloMessage, BrowserTool } from './schemas.js';

interface SourceMetadata {
  sourceId: string;
  tabId: string;
  origin: string | undefined;
  url: string | undefined;
  title: string | undefined;
  iconUrl: string | undefined;
  connectedAt: number;
  lastSeenAt: number;
}

export interface SourceInfo extends SourceMetadata {
  toolCount: number;
}

export interface AggregatedTool {
  name: string;
  originalName: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  outputSchema: Record<string, unknown> | undefined;
  annotations: Record<string, unknown> | undefined;
  sources: SourceInfo[];
}

interface ToolProvider {
  sourceId: string;
  tabId: string;
  tool: BrowserTool;
  publicToolName: string;
}

export interface ResolvedInvocation {
  connectionId: string;
  tool: BrowserTool;
  publicToolName: string;
}

export class HelloRequiredError extends Error {
  readonly connectionId: string;

  constructor(connectionId: string) {
    super(`Connection ${connectionId} must send hello before tools`);
    this.name = 'HelloRequiredError';
    this.connectionId = connectionId;
  }
}

export class RelayRegistry {
  private readonly sourceByConnectionId = new Map<string, SourceMetadata>();
  private readonly toolsByConnectionId = new Map<string, ToolProvider[]>();
  private readonly providersByPublicToolName = new Map<string, ToolProvider[]>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  // sourceId is currently identical to connectionId; kept as a separate concept
  // for future stable-identity support (e.g., reconnecting the same logical source).
  upsertSource(connectionId: string, hello: BrowserHelloMessage): void {
    const now = this.now();
    const existing = this.sourceByConnectionId.get(connectionId);

    this.sourceByConnectionId.set(connectionId, {
      sourceId: connectionId,
      tabId: hello.tabId,
      origin: hello.origin ?? existing?.origin,
      url: hello.url ?? existing?.url,
      title: hello.title ?? existing?.title,
      iconUrl: hello.iconUrl ?? existing?.iconUrl,
      connectedAt: existing?.connectedAt ?? now,
      lastSeenAt: now,
    });
  }

  registerTools(connectionId: string, tools: BrowserTool[]): void {
    const source = this.sourceByConnectionId.get(connectionId);
    if (!source) {
      throw new HelloRequiredError(connectionId);
    }

    this.touchConnection(connectionId);
    this.removeConnectionTools(connectionId);

    const domain = extractSanitizedDomain(source.origin ?? source.url);
    const providers: ToolProvider[] = tools.map((tool) => ({
      sourceId: connectionId,
      tabId: source.tabId,
      tool,
      publicToolName: buildPublicToolName({
        domain,
        tabId: source.tabId,
        originalToolName: tool.name,
      }),
    }));

    this.toolsByConnectionId.set(connectionId, providers);

    for (const provider of providers) {
      const existing = this.providersByPublicToolName.get(provider.publicToolName) ?? [];
      existing.push(provider);
      this.providersByPublicToolName.set(
        provider.publicToolName,
        this.sortProvidersByRecency(existing)
      );
    }
  }

  removeConnection(connectionId: string): void {
    this.removeConnectionTools(connectionId);
    this.sourceByConnectionId.delete(connectionId);
  }

  touchConnection(connectionId: string): void {
    const source = this.sourceByConnectionId.get(connectionId);
    if (!source) {
      return;
    }

    source.lastSeenAt = this.now();
  }

  listSources(): SourceInfo[] {
    return Array.from(this.sourceByConnectionId.values())
      .map((source) => this.toSourceInfo(source))
      .filter((source) => source.toolCount > 0)
      .sort((a, b) => this.compareRecency(b.lastSeenAt, a.lastSeenAt, b.sourceId, a.sourceId));
  }

  listTools(): AggregatedTool[] {
    const result: AggregatedTool[] = [];

    for (const [publicToolName, providers] of this.providersByPublicToolName.entries()) {
      const rankedProviders = this.sortProvidersByRecency(providers);
      const primaryProvider = rankedProviders[0];
      if (!primaryProvider) {
        continue;
      }

      const sources = rankedProviders
        .map((provider) => {
          const source = this.sourceByConnectionId.get(provider.sourceId);
          return source ? this.toSourceInfo(source) : undefined;
        })
        .filter((source): source is SourceInfo => Boolean(source));

      result.push({
        name: publicToolName,
        originalName: primaryProvider.tool.name,
        description: primaryProvider.tool.description,
        inputSchema: primaryProvider.tool.inputSchema,
        outputSchema: primaryProvider.tool.outputSchema,
        annotations: primaryProvider.tool.annotations,
        sources,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Resolution priority:
  // 1. Explicit sourceId — match by connectionId, then by tabId
  // 2. requestTabId — strict tab match, returns null if no match (no fallback)
  // 3. Default — most-recent provider
  resolveInvocation(options: {
    toolName: string;
    sourceId?: string;
    requestTabId?: string;
  }): ResolvedInvocation | null {
    const providers = this.providersByPublicToolName.get(options.toolName);
    if (!providers || providers.length === 0) {
      return null;
    }

    const rankedProviders = this.sortProvidersByRecency(providers);

    if (options.sourceId) {
      const byConnection = rankedProviders.find(
        (provider) => provider.sourceId === options.sourceId
      );
      if (byConnection) {
        return {
          connectionId: byConnection.sourceId,
          tool: byConnection.tool,
          publicToolName: byConnection.publicToolName,
        };
      }

      const byTabId = rankedProviders.find((provider) => provider.tabId === options.sourceId);
      if (byTabId) {
        return {
          connectionId: byTabId.sourceId,
          tool: byTabId.tool,
          publicToolName: byTabId.publicToolName,
        };
      }

      return null;
    }

    if (options.requestTabId) {
      const byRequestTab = rankedProviders.find(
        (provider) => provider.tabId === options.requestTabId
      );
      if (!byRequestTab) {
        return null;
      }

      return {
        connectionId: byRequestTab.sourceId,
        tool: byRequestTab.tool,
        publicToolName: byRequestTab.publicToolName,
      };
    }

    const provider = rankedProviders[0];
    if (!provider) {
      return null;
    }

    return {
      connectionId: provider.sourceId,
      tool: provider.tool,
      publicToolName: provider.publicToolName,
    };
  }

  private toSourceInfo(source: SourceMetadata): SourceInfo {
    return {
      ...source,
      toolCount: this.toolsByConnectionId.get(source.sourceId)?.length ?? 0,
    };
  }

  private removeConnectionTools(connectionId: string): void {
    const providers = this.toolsByConnectionId.get(connectionId) ?? [];
    this.toolsByConnectionId.delete(connectionId);

    for (const provider of providers) {
      const existing = this.providersByPublicToolName.get(provider.publicToolName) ?? [];
      const filtered = existing.filter((entry) => entry.sourceId !== connectionId);

      if (filtered.length === 0) {
        this.providersByPublicToolName.delete(provider.publicToolName);
        continue;
      }

      this.providersByPublicToolName.set(
        provider.publicToolName,
        this.sortProvidersByRecency(filtered)
      );
    }
  }

  private sortProvidersByRecency(providers: ToolProvider[]): ToolProvider[] {
    return providers.slice().sort((a, b) => {
      const aSource = this.sourceByConnectionId.get(a.sourceId);
      const bSource = this.sourceByConnectionId.get(b.sourceId);
      const aLastSeen = aSource?.lastSeenAt ?? 0;
      const bLastSeen = bSource?.lastSeenAt ?? 0;

      return this.compareRecency(bLastSeen, aLastSeen, b.sourceId, a.sourceId);
    });
  }

  private compareRecency(
    leftLastSeen: number,
    rightLastSeen: number,
    leftId: string,
    rightId: string
  ): number {
    const timeDiff = leftLastSeen - rightLastSeen;
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return leftId.localeCompare(rightId);
  }
}
