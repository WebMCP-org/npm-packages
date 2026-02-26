import { buildPublicToolName } from './naming.js';
import type { RelayTool } from './protocol.js';
import type { BrowserHelloMessage } from './schemas.js';

/**
 * Internal metadata tracked for each active browser source.
 */
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

/**
 * Public source metadata exposed by registry APIs.
 */
export interface SourceInfo extends SourceMetadata {
  toolCount: number;
}

/**
 * Aggregated relayed tool metadata across one or more sources.
 *
 * Extends {@link RelayTool} with relay-specific fields so new SDK tool
 * properties are automatically inherited without manual duplication.
 */
export interface AggregatedTool extends RelayTool {
  originalName: string;
  sources: SourceInfo[];
}

/**
 * Internal record linking a source to a concrete tool implementation.
 */
interface ToolProvider {
  sourceId: string;
  tabId: string;
  tool: RelayTool;
  publicToolName: string;
}

/**
 * Invocation target selected by the registry.
 */
export interface ResolvedInvocation {
  connectionId: string;
  tool: RelayTool;
  publicToolName: string;
}

/**
 * Error thrown when a source attempts to register tools before `hello`.
 */
export class HelloRequiredError extends Error {
  readonly connectionId: string;

  constructor(connectionId: string) {
    super(`Connection ${connectionId} must send hello before tools`);
    this.name = 'HelloRequiredError';
    this.connectionId = connectionId;
  }
}

/**
 * In-memory source and tool registry used by the relay bridge.
 */
export class RelayRegistry {
  private readonly sourceByConnectionId = new Map<string, SourceMetadata>();
  private readonly toolsByConnectionId = new Map<string, ToolProvider[]>();
  private readonly providersByPublicToolName = new Map<string, ToolProvider[]>();

  /**
   * @param now Time provider used for recency ordering.
   */
  constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * Upserts source metadata from a browser `hello` message.
   *
   * `sourceId` currently matches `connectionId`, but remains conceptually distinct
   * so stable source identity can be introduced in the future.
   */
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

  /**
   * Replaces the full tool set for a source connection.
   */
  registerTools(connectionId: string, tools: RelayTool[]): void {
    const source = this.sourceByConnectionId.get(connectionId);
    if (!source) {
      throw new HelloRequiredError(connectionId);
    }

    this.touchConnection(connectionId);
    this.removeConnectionTools(connectionId);

    const providers: ToolProvider[] = tools.map((tool) => ({
      sourceId: connectionId,
      tabId: source.tabId,
      tool,
      publicToolName: '',
    }));

    this.toolsByConnectionId.set(connectionId, providers);
    this.rebuildPublicNames();
  }

  /**
   * Removes a source and all of its tool registrations.
   */
  removeConnection(connectionId: string): void {
    this.removeConnectionTools(connectionId);
    this.sourceByConnectionId.delete(connectionId);
    this.rebuildPublicNames();
  }

  /**
   * Marks a source as recently seen without mutating identity metadata.
   */
  touchConnection(connectionId: string): void {
    const source = this.sourceByConnectionId.get(connectionId);
    if (!source) {
      return;
    }

    source.lastSeenAt = this.now();
  }

  /**
   * Lists active sources that currently publish at least one tool.
   */
  listSources(): SourceInfo[] {
    return Array.from(this.sourceByConnectionId.values())
      .map((source) => this.toSourceInfo(source))
      .filter((source) => source.toolCount > 0)
      .sort((a, b) => this.compareRecency(b.lastSeenAt, a.lastSeenAt, b.sourceId, a.sourceId));
  }

  /**
   * Lists aggregated tools ordered by public tool name.
   */
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
        ...primaryProvider.tool,
        name: publicToolName,
        originalName: primaryProvider.tool.name,
        sources,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolves a tool invocation to a concrete source provider.
   *
   * Resolution order:
   * 1. `sourceId`: exact source id, then fallback to tab id.
   * 2. `requestTabId`: strict tab id match with no fallback.
   * 3. Default: most recently seen provider.
   */
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

  /**
   * Converts internal source metadata to public source info.
   */
  private toSourceInfo(source: SourceMetadata): SourceInfo {
    return {
      ...source,
      toolCount: this.toolsByConnectionId.get(source.sourceId)?.length ?? 0,
    };
  }

  /**
   * Removes all tool providers for a connection.
   */
  private removeConnectionTools(connectionId: string): void {
    this.toolsByConnectionId.delete(connectionId);
  }

  /**
   * Rebuilds public tool names after source set changes.
   *
   * When the same original tool name appears in multiple tabs, names are
   * disambiguated with a short tab suffix.
   */
  private rebuildPublicNames(): void {
    const byOriginalName = new Map<string, ToolProvider[]>();
    for (const providers of this.toolsByConnectionId.values()) {
      for (const provider of providers) {
        const key = provider.tool.name;
        const group = byOriginalName.get(key) ?? [];
        group.push(provider);
        byOriginalName.set(key, group);
      }
    }

    this.providersByPublicToolName.clear();

    for (const [, providers] of byOriginalName) {
      const uniqueTabIds = new Set(providers.map((p) => p.tabId));
      const disambiguate = uniqueTabIds.size > 1;

      for (const provider of providers) {
        provider.publicToolName = buildPublicToolName({
          originalToolName: provider.tool.name,
          tabId: provider.tabId,
          disambiguate,
        });

        const existing = this.providersByPublicToolName.get(provider.publicToolName) ?? [];
        existing.push(provider);
        this.providersByPublicToolName.set(
          provider.publicToolName,
          this.sortProvidersByRecency(existing)
        );
      }
    }
  }

  /**
   * Returns providers sorted by source recency.
   */
  private sortProvidersByRecency(providers: ToolProvider[]): ToolProvider[] {
    return providers.slice().sort((a, b) => {
      const aSource = this.sourceByConnectionId.get(a.sourceId);
      const bSource = this.sourceByConnectionId.get(b.sourceId);
      const aLastSeen = aSource?.lastSeenAt ?? 0;
      const bLastSeen = bSource?.lastSeenAt ?? 0;

      return this.compareRecency(bLastSeen, aLastSeen, b.sourceId, a.sourceId);
    });
  }

  /**
   * Compares two source recency tuples and stabilizes order by source id.
   */
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
