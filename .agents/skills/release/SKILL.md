---
name: release
description: Release the @mcp-b monorepo with Changesets and pnpm, using npm trusted publishing in GitHub Actions. Covers stable releases, snapshots, prerelease trains, metadata checks, and MCPB artifacts.
---

# Release @mcp-b packages

Use the existing [Release workflow](../../../.github/workflows/changesets.yml).
CI publishes from `main` using npm OIDC, not an `NPM_TOKEN` secret.
Do not publish, dispatch, push, or change remote settings without authorization.

## Stable releases

1. Validate the changes:

   ```bash
   pnpm build && pnpm typecheck && vp check && pnpm test:unit && pnpm release:check
   ```

2. Run `pnpm changeset`. Select only packages with actual changes and describe the
   consumer-facing effect. Separate summaries when packages need different release notes.
3. Commit the changeset with the implementation and submit the PR.
4. After merge, CI creates or updates `chore(release): version packages`.
5. Review that PR's versions, changelogs, relay manifest and global CDN test pin.
   Merging it lets CI publish the release.

The version PR uses `GITHUB_TOKEN`. GitHub can hold workflows from bot-created or updated
PRs for approval: a maintainer with write access selects **Approve workflows to run** in
the PR merge box, then waits for all required checks. Do not bypass checks or add a PAT to
work around an approval prompt. See [GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Never hand-edit package versions or use `pnpm version`: this bypasses changelogs and
fixed-group coordination. All 12 published packages belong to one Changesets fixed group;
private workspace apps and examples are not released.

`pnpm changeset:version` applies versions and synchronizes checked-in metadata through
`scripts/release-metadata.mjs --write`. Normally the workflow runs it. Use it locally only
when preparing an explicitly requested version commit.

`ci:publish` validates metadata, publishes unpublished package versions in dependency order,
then runs `changeset tag`. The pinned Changesets action reads those new-tag messages to
create GitHub releases and trigger SBOM, MCPB and signing steps. Keep the tag command after
a successful publish; plain `pnpm publish` does not emit Changesets release events.

## npm trusted publishing

Each public package must configure the same trusted publisher on npm:

- Organization: `WebMCP-org`
- Repository: `npm-packages`
- Workflow filename: `changesets.yml`
- Environment: `npm-publish`
- Allowed action: `npm publish`

The workflow uses GitHub-hosted runners and job-level `id-token: write`. Node 24 and the
pinned npm CLI meet npm's OIDC requirements. pnpm packs the workspace, resolving `workspace:`
and `catalog:` protocols, then delegates publication to npm. Keep the npm CLI setup.
Provenance is enabled; no long-lived npm publish token is needed.

Configure `npm-publish` environment reviewers and restrict deployment branches to `main`
in GitHub settings. Naming an environment in YAML does **not** configure these protections.
Verify OIDC publishing works before disabling legacy token access in npm settings.
The workflow's canonical-repository and branch checks are additional safeguards.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[pnpm publish](https://pnpm.io/cli/publish).

## Snapshots

For one temporary build from `main`, dispatch only when requested:

```bash
gh workflow run "Release" --ref main -f tag=beta
```

This publishes `<next>-beta.<datetime>` under `beta`, without committing temporary versions
or consuming the changesets on `main`. Dispatch before merging the version PR: snapshots
need pending changesets. The workflow rejects an empty release, `latest`, unsafe tag text,
and existing pre-mode state. It publishes only snapshot packages and signs the registry
artifact in each prerelease GitHub release.

A snapshot is independent of the accumulating prerelease flow below. Never restore an
entire working tree with `git checkout .` to discard snapshot versions. Prefer the workflow;
if a local snapshot is explicitly needed, prepare it in a disposable clean checkout.

## Accumulating prereleases

```bash
pnpm changeset pre enter beta
```

Commit `.changeset/pre.json`. Normal version PRs now produce `X.Y.Z-beta.0`, then
`beta.1`, and so on. `scripts/npm-dist-tag.mjs` selects the active prerelease tag for
`ci:publish` and `publish:all`; invalid state must stop publication rather than defaulting
to `latest`.

To graduate, run `pnpm changeset pre exit` and commit the change. The next version PR
removes the prerelease suffix and publishes to `latest`.

## Local publishing and recovery

Use local publishing only when explicitly requested. Authenticate with `npm login` through
the user's approved interactive flow; do not read, print, or shell-evaluate `.env` files.
Then use `pnpm publish:all`, which builds, checks release metadata, and selects the dist-tag.
Do not publish a source directory with npm: it cannot resolve pnpm dependency protocols.

Publication is not atomic across packages. pnpm skips versions already on npm, so rerun the
same release after fixing the cause of a partial publish. Never overwrite or silently bump
an already published version. If npm publishing succeeded but a later GitHub artifact step
failed, recover those missing artifacts explicitly: existing tags can make Changesets
report no new publication on a rerun. A rerun of snapshot versioning creates a new timestamp.

If only signing failed after stable GitHub releases were created, recover signatures with:

```bash
gh workflow run "Release" --ref main -f recover_signatures_version=5.0.3
```

Use the affected stable version. This checks out its `usewebmcp@<version>` tag, validates
every public package's version, tag commit and existing release, then signs source archives
with Sigstore bundles. It never publishes npm packages or replaces SBOM/MCPB/R2 artifacts.

Verify exact versions (`npm view <name>@<version> version`) and dist-tags, including unscoped
`usewebmcp` and nested `@mcp-b/smart-dom-reader-server`. Do not use the default `npm view`
version as a prerelease check: it reads `latest`.

See [publishing references](references/publishing.md) for MCPB artifact recovery.
