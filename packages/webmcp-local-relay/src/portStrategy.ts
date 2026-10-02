import type { AddressInfo } from 'node:net';
import { z } from 'zod/v4';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function isTcpAddress(address: AddressInfo | string | null): address is AddressInfo {
  return address !== null && typeof address !== 'string';
}

export const DEFAULT_RELAY_PORT = 9333;
export const DEFAULT_RELAY_PORT_RANGE_END = 9348;
const RELAY_PORT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PersistedRelayPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  updatedAt: z.string(),
});
type PersistedRelayPort = z.infer<typeof PersistedRelayPortSchema>;

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

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readPersistedPort(path: string, expectedHost: string): Promise<number | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = PersistedRelayPortSchema.parse(JSON.parse(raw));
    if (expectedHost && parsed.host !== expectedHost) {
      return null;
    }

    const updatedAtMs = Date.parse(parsed.updatedAt);
    if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > RELAY_PORT_CACHE_MAX_AGE_MS) {
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

  const cachedPort = await readPersistedPort(persistPath, host);
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
