#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

/**
 * Maps advisory severities to sortable numeric ranks.
 *
 * @type {{ low: number; moderate: number; high: number; critical: number }}
 */
const severityRank = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

/**
 * Parses command arguments for filtered audit runs.
 *
 * @param {string[]} argv
 * @returns {{ level: 'low' | 'moderate' | 'high' | 'critical'; ignorePrefixes: string[]; prod: boolean }}
 */
function parseArgs(argv) {
  const args = { level: 'high', ignorePrefixes: [], prod: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--level') {
      args.level = argv[i + 1] ?? 'high';
      i += 1;
      continue;
    }
    if (arg === '--ignore-prefix') {
      const prefix = argv[i + 1];
      if (prefix) {
        args.ignorePrefixes.push(prefix);
      }
      i += 1;
      continue;
    }
    if (arg === '--prod') {
      args.prod = true;
    }
  }

  if (!Object.hasOwn(severityRank, args.level)) {
    throw new Error(
      `Invalid --level value "${args.level}". Expected one of: ${Object.keys(severityRank).join(
        ', '
      )}`
    );
  }

  return args;
}

/**
 * Returns whether a dependency path should be included in filtered results.
 *
 * @param {string} path
 * @param {string[]} ignorePrefixes
 * @returns {boolean}
 */
function shouldKeepPath(path, ignorePrefixes) {
  return !ignorePrefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * Filters advisories by removing any findings that match ignored path prefixes.
 *
 * @param {Record<string, { findings?: Array<{ paths?: string[] }> }>} advisories
 * @param {string[]} ignorePrefixes
 * @returns {{ kept: Array<{ severity: 'low' | 'moderate' | 'high' | 'critical'; findings?: Array<{ paths?: string[] }>; module_name?: string; id?: number }>; ignoredAdvisoryCount: number }}
 */
function filterAdvisories(advisories, ignorePrefixes) {
  const kept = [];
  let ignoredAdvisoryCount = 0;

  for (const advisory of Object.values(advisories ?? {})) {
    const keptFindings = [];

    for (const finding of advisory.findings ?? []) {
      const keptPaths = (finding.paths ?? []).filter((path) =>
        shouldKeepPath(path, ignorePrefixes)
      );
      if (keptPaths.length > 0) {
        keptFindings.push({ ...finding, paths: keptPaths });
      }
    }

    if (keptFindings.length === 0) {
      ignoredAdvisoryCount += 1;
      continue;
    }

    kept.push({ ...advisory, findings: keptFindings });
  }

  return { kept, ignoredAdvisoryCount };
}

/**
 * Extracts de-duplicated dependency paths from an advisory.
 *
 * @param {{ findings?: Array<{ paths?: string[] }> }} advisory
 * @returns {string[]}
 */
function uniquePaths(advisory) {
  return [...new Set((advisory.findings ?? []).flatMap((finding) => finding.paths ?? []))];
}

/**
 * Builds a severity summary for reporting.
 *
 * @param {Array<{ severity: 'low' | 'moderate' | 'high' | 'critical' }>} advisories
 * @returns {{ low: number; moderate: number; high: number; critical: number }}
 */
function summarizeBySeverity(advisories) {
  const summary = { low: 0, moderate: 0, high: 0, critical: 0 };
  for (const advisory of advisories) {
    const severity = advisory.severity;
    if (Object.hasOwn(summary, severity)) {
      summary[severity] += 1;
    }
  }
  return summary;
}

/**
 * Runs pnpm audit and returns parsed JSON output.
 *
 * @param {'low' | 'moderate' | 'high' | 'critical'} level
 * @param {boolean} prod
 * @returns {{ advisories?: Record<string, unknown> }}
 */
function runAudit(level, prod) {
  const auditArgs = ['audit', '--audit-level', level, '--json'];
  if (prod) {
    auditArgs.push('--prod');
  }

  const result = spawnSync('pnpm', auditArgs, {
    encoding: 'utf8',
    env: { ...process.env, NPM_TOKEN: process.env.NPM_TOKEN ?? 'local-ci' },
  });

  if (result.error) {
    throw result.error;
  }

  if (!result.stdout) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || 'pnpm audit returned no JSON output');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error('Failed to parse pnpm audit JSON output');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('pnpm audit JSON output was not an object');
  }

  return parsed;
}

const { level, ignorePrefixes, prod } = parseArgs(process.argv.slice(2));
const threshold = severityRank[level];

const auditJson = runAudit(level, prod);
const { kept: advisories, ignoredAdvisoryCount } = filterAdvisories(
  auditJson.advisories,
  ignorePrefixes
);
const failing = advisories.filter((advisory) => severityRank[advisory.severity] >= threshold);
const severitySummary = summarizeBySeverity(advisories);

console.log(
  `[audit-filtered] level=${level} ignorePrefixes=${
    ignorePrefixes.length > 0 ? ignorePrefixes.join(',') : '(none)'
  } prod=${prod}`
);
console.log(
  `[audit-filtered] advisories kept=${advisories.length} ignored=${ignoredAdvisoryCount}`
);
console.log(
  `[audit-filtered] kept severities: low=${severitySummary.low} moderate=${severitySummary.moderate} high=${severitySummary.high} critical=${severitySummary.critical}`
);

for (const advisory of failing) {
  const paths = uniquePaths(advisory);
  const shownPaths = paths.slice(0, 3);
  const extra =
    paths.length > shownPaths.length ? ` (+${paths.length - shownPaths.length} more)` : '';
  console.log(
    `[audit-filtered] ${advisory.severity.toUpperCase()} ${advisory.module_name} (${advisory.id}) ${shownPaths.join(' | ')}${extra}`
  );
}

if (failing.length > 0) {
  process.exit(1);
}
