# Publishing references

Follow [the release skill](../SKILL.md) for Changesets, OIDC authentication and release
validation. These commands are recovery tools, not an alternative versioning workflow.

## Inspect an exact published version

```bash
npm view @mcp-b/global@<version> version dist-tags dist.integrity dist.tarball
```

Inspect tarball contents when a consumer reports missing build files. Source manifests use
`workspace:` and `catalog:` references; published manifests must contain resolved versions.
Use pnpm for packing and publishing. `prepublishOnly` validates the publisher and builds
packages that need compilation.

Authentication failures in CI require checking npm's exact repository, workflow filename,
environment and allowed-action configuration. Do not fix OIDC failures by adding an
`NPM_TOKEN` secret. Local publishing requires approved interactive npm authentication.

## Recover an MCPB bundle

`@mcp-b/webmcp-local-relay` also ships a Claude Desktop `.mcpb` bundle. Its build script
stages files and resolves catalog dependencies; inspect that script when changing bundling.
The normal Release job builds and uploads the bundle after npm publication. R2 upload is
optional and requires `CLOUDFLARE_API_TOKEN`; npm trusted publishing does not authorize R2.

When explicitly requested, rebuild the exact released version and attach it to the existing
package release:

```bash
pnpm --filter @mcp-b/webmcp-local-relay run build:mcpb
# Substitute the reviewed exact version in these recovery commands.
gh release upload '@mcp-b/webmcp-local-relay@<version>' \
  packages/webmcp-local-relay/webmcp-local-relay-<version>.mcpb
```

For an authorized R2 upload, preserve the root filename key used by existing installers:

```bash
pnpm exec wrangler r2 object put \
  'webmcp-installs/webmcp-local-relay-<version>.mcpb' \
  --file 'packages/webmcp-local-relay/webmcp-local-relay-<version>.mcpb' \
  --content-type application/octet-stream \
  --cache-control 'public, max-age=31536000, immutable' \
  --remote
```

Verify the exact uploaded object at `https://install.mcp-b.ai/` and
`https://install.mcpb.ai/`. Do not overwrite an immutable published bundle with different
content; release a corrected version through Changesets.

A successful npm publish does not prove GitHub release creation, signing, or R2 upload
succeeded. Check those steps separately before declaring a complete release.
