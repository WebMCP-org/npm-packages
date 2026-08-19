/**
 * Print the npm dist-tag `pnpm publish` should use.
 *
 * `npm publish` defaults to `latest` whatever the version says, so a prerelease built by
 * `changeset pre` would land on `latest` and reach every consumer. Changesets records the
 * active prerelease in `.changeset/pre.json`; this reads it so the publish command tags
 * betas as `beta`. Outside pre mode it prints `latest`, which is what publishing already
 * did. `changeset publish` handles this itself, but it cannot resolve the `workspace:` and
 * `catalog:` protocols that `pnpm publish` does.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const preJsonPath = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  '.changeset/pre.json'
);

function resolveDistTag() {
  let raw;
  try {
    raw = readFileSync(preJsonPath, 'utf8');
  } catch {
    return 'latest';
  }

  let pre;
  try {
    pre = JSON.parse(raw);
  } catch (error) {
    throw new Error(`.changeset/pre.json is not valid JSON: ${error.message}`);
  }

  // `changeset pre exit` leaves the file behind with mode "exit"; only "pre" is active.
  if (pre.mode !== 'pre') return 'latest';
  if (typeof pre.tag !== 'string' || !pre.tag) {
    throw new Error('.changeset/pre.json is in pre mode but declares no tag.');
  }
  return pre.tag;
}

process.stdout.write(resolveDistTag());
