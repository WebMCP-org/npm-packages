import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_RELAY_PORT = 9333;
export const DEFAULT_RELAY_PORT_RANGE_END = 9348;
export const RELAY_PORT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PersistedRelayPort {
  host: string;
  port: number;
  updatedAt: string;
}

export interface PortStrategyOptions {
  fixedPort?: number;
  defaultPort: number;
  rangeEnd: number;
  host: string;
  persistPath?: string;
}

export interface PortStrategyResult {
  port: number;
  wasFixed: boolean;
  fromCache: boolean;
}

export function defaultRelayPortPersistPath(): string {
  return join(homedir(), '.webmcp', 'relay-port.json');
}

export async function persistPort(
  port: number,
  path = defaultRelayPortPersistPath(),
  host = '127.0.0.1',
  now = Date.now()
): Promise<void> {
  const payload: PersistedRelayPort = {
    port,
    host,
    updatedAt: new Date(now).toISOString(),
  };

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function readPersistedPort(
  path = defaultRelayPortPersistPath(),
  options: {
    expectedHost?: string;
    maxAgeMs?: number;
    now?: number;
  } = {}
): Promise<number | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedRelayPort>;
    if (
      typeof parsed.port !== 'number' ||
      !Number.isInteger(parsed.port) ||
      parsed.port < 1 ||
      parsed.port > 65535
    ) {
      return null;
    }
    if (typeof parsed.host !== 'string' || parsed.host.length === 0) {
      return null;
    }
    if (options.expectedHost && parsed.host !== options.expectedHost) {
      return null;
    }

    const maxAgeMs = options.maxAgeMs ?? RELAY_PORT_CACHE_MAX_AGE_MS;
    const now = options.now ?? Date.now();
    const updatedAtMs =
      typeof parsed.updatedAt === 'string' ? Date.parse(parsed.updatedAt) : Number.NaN;

    if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > maxAgeMs) {
      return null;
    }

    return parsed.port;
  } catch {
    return null;
  }
}

export async function buildPortCandidates(
  options: PortStrategyOptions
): Promise<PortStrategyResult[]> {
  const {
    defaultPort,
    fixedPort,
    host,
    persistPath = defaultRelayPortPersistPath(),
    rangeEnd,
  } = options;

  if (fixedPort !== undefined) {
    return [{ port: fixedPort, wasFixed: true, fromCache: false }];
  }

  const cachedPort = await readPersistedPort(persistPath, { expectedHost: host });
  const seen = new Set<number>();
  const candidates: PortStrategyResult[] = [];

  const pushCandidate = (port: number, fromCache: boolean): void => {
    if (port < 1 || port > 65535 || seen.has(port)) {
      return;
    }
    seen.add(port);
    candidates.push({ port, wasFixed: false, fromCache });
  };

  if (cachedPort !== null && cachedPort >= defaultPort && cachedPort <= rangeEnd) {
    pushCandidate(cachedPort, true);
  }

  pushCandidate(defaultPort, false);

  for (let port = defaultPort + 1; port <= rangeEnd; port += 1) {
    pushCandidate(port, false);
  }

  return candidates;
}
