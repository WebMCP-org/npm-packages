import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPortCandidates,
  persistPort,
  RELAY_PORT_CACHE_MAX_AGE_MS,
  readPersistedPort,
} from './portStrategy.js';

describe('portStrategy', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  async function tempFile(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'webmcp-relay-port-strategy-'));
    tempDirs.push(dir);
    return join(dir, name);
  }

  it('returns only the fixed port when explicitly configured', async () => {
    const candidates = await buildPortCandidates({
      defaultPort: 9333,
      fixedPort: 9444,
      host: '127.0.0.1',
      rangeEnd: 9348,
    });

    expect(candidates).toEqual([{ fromCache: false, port: 9444, wasFixed: true }]);
  });

  it('prefers a cached port before the default range', async () => {
    const persistPath = await tempFile('relay-port.json');
    await persistPort(9337, persistPath, '127.0.0.1');

    const candidates = await buildPortCandidates({
      defaultPort: 9333,
      host: '127.0.0.1',
      persistPath,
      rangeEnd: 9338,
    });

    expect(candidates.slice(0, 4)).toEqual([
      { fromCache: true, port: 9337, wasFixed: false },
      { fromCache: false, port: 9333, wasFixed: false },
      { fromCache: false, port: 9334, wasFixed: false },
      { fromCache: false, port: 9335, wasFixed: false },
    ]);
  });

  it('ignores stale persisted ports', async () => {
    const persistPath = await tempFile('relay-port.json');
    const now = Date.now();
    await persistPort(9337, persistPath, '127.0.0.1', now - RELAY_PORT_CACHE_MAX_AGE_MS - 1000);

    const persisted = await readPersistedPort(persistPath, {
      expectedHost: '127.0.0.1',
      now,
    });

    expect(persisted).toBeNull();
  });

  it('ignores persisted ports for a different host', async () => {
    const persistPath = await tempFile('relay-port.json');
    await persistPort(9337, persistPath, '127.0.0.1');

    const persisted = await readPersistedPort(persistPath, {
      expectedHost: '[::1]',
    });

    expect(persisted).toBeNull();
  });
});
