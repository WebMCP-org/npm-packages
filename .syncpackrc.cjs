// @ts-check

/**
 * Syncpack configuration for the MCP-B monorepo.
 *
 * Syncpack enforces consistent dependency versions across example/frameworks projects only.
 * Internal packages (packages/*, e2e/*) are NOT managed here — they use the pnpm
 * catalog in pnpm-workspace.yaml instead.
 *
 * Run `pnpm syncpack:lint` to check, `pnpm syncpack:fix` to auto-fix.
 *
 * @see https://syncpack.dev
 * @type {import("syncpack").RcFile}
 */
module.exports = {
  // ---------------------------------------------------------------------------
  // Source — only scan example package.json files.
  // This prevents syncpack from touching packages/*, e2e/*, skills/*, or the
  // root package.json. Those are managed by the pnpm catalog instead.
  // ---------------------------------------------------------------------------
  source: ['examples/frameworks/*/package.json'],

  // ---------------------------------------------------------------------------
  // Formatting — disabled because Oxfmt already handles package.json formatting.
  // Without these overrides syncpack would re-sort properties and dependencies
  // on every `syncpack format` or flag them as errors during `syncpack lint`.
  // ---------------------------------------------------------------------------
  sortPackages: false,
  sortAz: [],
  sortExports: [],
  sortFirst: [],
  formatRepository: false,
  formatBugs: false,

  // ---------------------------------------------------------------------------
  // Semver groups
  //
  // Most dependencies use `^` (caret). Exceptions:
  //   - next: pinned exact — due to recent security issues
  //   - typescript: `~` (tilde) — not semantically versioned
  // ---------------------------------------------------------------------------
  semverGroups: [
    {
      label: 'next should be pinned to an exact version',
      range: '',
      dependencies: ['next'],
      packages: ['**'],
    },
    {
      label: 'typescript is not semver-compliant, use tilde',
      range: '~',
      dependencies: ['typescript'],
      packages: ['**'],
    },
    {
      range: '^',
      dependencyTypes: ['**'],
      dependencies: ['**'],
      packages: ['**'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Version groups
  //
  // The default policy is `highestSemver` which requires all instances of a
  // shared dependency to use the exact same version string. For example, if
  // react has `vite: "^7.3.1"` and svelte has `vite: "^7.5.1"`, syncpack
  // will flag the mismatch and suggest aligning both to `"^7.5.1"`.
  //
  // We don't need any custom version groups here because:
  //   - `source` already limits the scope to examples only
  //   - There are no catalog: or workspace: specifiers in example packages
  //   - The default highestSemver policy is exactly what we want
  // ---------------------------------------------------------------------------
};
