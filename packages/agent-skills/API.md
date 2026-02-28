# @mcp-b/agent-skills API

This package is a TypeScript implementation of the Agent Skills specification.
It follows the public spec and mirrors the Python reference library behavior
with a storage-agnostic, in-memory API surface.

References:
- Spec: https://agentskills.io/specification
- Reference implementation: https://github.com/agentskills/agentskills/tree/main/skills-ref
- Parser reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
- Validator reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
- Models reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
- Prompt reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py

## Module map (TypeScript → Python reference)

- `src/models.ts` → [`skills_ref/models.py`](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py)
- `src/parser.ts` → [`skills_ref/parser.py`](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py)
- `src/validator.ts` → [`skills_ref/validator.py`](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py)
- `src/prompt.ts` → [`skills_ref/prompt.py`](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py)
- `src/patch.ts` → patch/diff utilities (no Python reference module)
- `src/errors.ts` → [`skills_ref/errors.py`](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/errors.py)
- `src/utils/*` → helper logic used by parsing and validation

## Core types

### SkillFrontmatter
Spec-accurate YAML frontmatter shape. Keys are exactly as they appear in
`SKILL.md` (`allowed-tools` stays hyphenated). Required fields are
`name` and `description`.

### SkillProperties
JavaScript-friendly representation of frontmatter. `allowed-tools` becomes
`allowedTools`, and `metadata` is normalized to string values.

### SkillFile
Full record that a host can store in its own persistence layer. Contains the
raw content, parsed properties, size, and timestamps.

### SkillMetadata
Lightweight list view for progressive disclosure with token estimates.

## Parsing

### parseFrontmatter(content)
Parses YAML frontmatter and returns `{ metadata, body }`.
Behavior matches the reference parser:
- Requires frontmatter, validates name/description presence and non-empty strings.
- Preserves metadata scalar formatting by reading YAML source tokens where possible.
- Returns hyphenated keys in `metadata`.

### parseSkillContent(content)
Returns `{ properties, body }` where `properties` is the camel-cased
`SkillProperties` representation of the frontmatter.

### extractBody(content)
Strips frontmatter and returns the markdown body.

### frontmatterToProperties(metadata)
Converts `SkillFrontmatter` to `SkillProperties` without re-parsing.

### findSkillMdFile(files)
Finds `SKILL.md` from an in-memory list of files, preferring uppercase and
falling back to `skill.md`.

### readSkillProperties(files, options)
Reads `SKILL.md` from an in-memory list and returns `SkillProperties`.
This is the filesystem-free analog of `skills_ref.read_properties`.

## Validation

### validateSkillProperties(properties, options)
Validates name, description, and compatibility fields. Provide `expectedName`
to enforce a name match against a host-provided value (e.g., directory slug).

### validateSkillContent(content)
Parses and validates a single `SKILL.md` content string, including unknown
frontmatter keys.

### validateSkillEntries(entries, options)
Validates a skill represented as an in-memory file list. The host supplies
storage context via:
- `exists` (missing path),
- `isDirectory` (path is not a directory),
- `expectedName` (name-to-location match),
- `location` (user-facing label in error messages).

This mirrors the reference `validate()` without assuming a filesystem.

## Prompt generation

### toPrompt(entries)
Builds the `<available_skills>` XML block. Accepts either:
- `SkillPromptEntry` objects with `name`, `description`, and `location`, or
- `SkillPromptSource` objects with raw `SKILL.md` content + location.

XML is escaped to preserve safe system prompt formatting.

## Diff + patch

### diffSkillContent(base, updated)
Returns a line-based diff with `equal`, `insert`, and `delete` segments.
This is suitable for UI diff rendering or model feedback loops.

### createSkillPatch(base, updated, options)
Generates a contextual patch for the delta between two `SKILL.md` strings.
Each operation is a `replace` hunk that includes a small amount of context
to keep patches stable across minor edits.

### validateSkillPatch(patch)
Runtime patch validation for model-provided payloads. Returns structured,
model-friendly errors when a patch is malformed or unsupported.

### applySkillPatch(content, patch, options)
Applies patch operations sequentially and returns a structured result:
- `ok: true` with `content` when the patch applies cleanly.
- `ok: false` with `errors` when a target cannot be found, is ambiguous,
  or the resulting content violates the Agent Skills spec.

By default, the resulting `SKILL.md` is validated with `validateSkillContent`
and can optionally enforce an `expectedName`.

## Utilities

### normalizeNFKC(str)
Unicode normalization used by name validation to match Python’s
`unicodedata.normalize("NFKC", ...)`.

### estimateTokens(text)
Conservative token estimator (~1 token per 4 characters) for context budgeting.

## Error types

- `ParseError`: malformed frontmatter, invalid YAML, missing `SKILL.md`.
- `ValidationError`: invalid or missing required fields, length violations,
  unexpected frontmatter keys.
