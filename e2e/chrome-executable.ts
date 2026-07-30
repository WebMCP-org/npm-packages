import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const MACOS_CHROME_EXECUTABLE_PATHS = [
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
] as const;

export const LINUX_CHROME_EXECUTABLE_PATHS = [
  '/usr/bin/google-chrome-unstable',
  '/usr/bin/google-chrome-beta',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
] as const;

interface RejectedChromeCandidate {
  executablePath: string;
  version: string | undefined;
}

interface ResolveChromeExecutableOptions {
  candidates: readonly (string | undefined)[];
  minimumMajor: number;
  onRejectedCandidate?: (candidate: RejectedChromeCandidate) => Error | undefined;
  unresolvedError: () => Error;
}

export interface ResolvedChromeExecutable {
  executablePath: string;
  version: string;
}

function readChromeVersion(executablePath: string): string | undefined {
  try {
    return execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function majorFromVersion(version: string | undefined): number | undefined {
  const match = version?.match(/\b(\d+)\./);
  const major = match?.[1];
  return major ? Number.parseInt(major, 10) : undefined;
}

export function resolveChromeExecutable({
  candidates,
  minimumMajor,
  onRejectedCandidate,
  unresolvedError,
}: ResolveChromeExecutableOptions): ResolvedChromeExecutable {
  for (const executablePath of candidates) {
    if (!executablePath || !existsSync(executablePath)) continue;

    const version = readChromeVersion(executablePath);
    const major = majorFromVersion(version);
    if (major !== undefined && major >= minimumMajor) {
      return { executablePath, version: version ?? executablePath };
    }

    const rejection = onRejectedCandidate?.({ executablePath, version });
    if (rejection) throw rejection;
  }

  throw unresolvedError();
}
