# agent-skills-ts-sdk

TypeScript implementation of the [AgentSkills specification](https://agentskills.io/specification).

## Overview

This package provides parser and validator for Agent Skills, following the official specification at https://agentskills.io/specification.

Agent Skills are folders of instructions, scripts, and resources that agents can discover and use. Skills are defined in `SKILL.md` files with YAML frontmatter.

## References

- **Specification**: https://agentskills.io/specification
- **Reference Implementation**: [agentskills/skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) (Python)
- **Example Skills**: https://github.com/anthropics/skills
- **Reference Repository**: https://github.com/agentskills/agentskills/tree/main/skills-ref

## Installation

```bash
pnpm add agent-skills-ts-sdk
```

## Usage

### Parsing SKILL.md

```typescript
import { parseSkillContent, validateSkillContent } from 'agent-skills-ts-sdk';

const content = `---
name: my-skill
description: A test skill
---
# My Skill

Instructions here.`;

const { properties, body } = parseSkillContent(content);

const errors = validateSkillContent(content);
if (errors.length > 0) {
  console.error('Validation errors:', errors);
}
```

For embedded/web-extracted content (for example `<script>` text with a leading
newline), opt in explicitly:

```typescript
const { properties, body } = parseSkillContent(contentFromDom, {
  inputMode: 'embedded',
});
```

### Validation

```typescript
import { validateSkillProperties } from 'agent-skills-ts-sdk';

const properties = {
  name: 'my-skill',
  description: 'A test skill',
};

const errors = validateSkillProperties(properties);
```

### In-memory file lists (Durable Objects or other non-filesystem hosts)

```typescript
import { findSkillMdFile, readSkillProperties, validateSkillEntries } from 'agent-skills-ts-sdk';

const files = [{ name: 'SKILL.md', content: skillMarkdown }];

const entry = findSkillMdFile(files);
const properties = readSkillProperties(files);
const errors = validateSkillEntries(files, { expectedName: properties.name });
```

### Prompt generation

```typescript
import { toPrompt } from 'agent-skills-ts-sdk';

const promptBlock = toPrompt([{ content: skillMarkdown, location: 'skills/my-skill/SKILL.md' }]);
```

### Progressive disclosure helpers

```typescript
import {
  handleSkillRead,
  toDisclosureInstructions,
  toDisclosurePrompt,
  toReadToolSchema,
} from 'agent-skills-ts-sdk';

const instructions = toDisclosureInstructions({ toolName: 'read_site_context' });
const skillsXml = toDisclosurePrompt([
  { name: 'pizza-maker', description: 'Interactive pizza builder', resources: ['build-pizza'] },
]);
const readTool = toReadToolSchema([{ name: 'pizza-maker' }], {
  toolName: 'read_site_context',
});
```

### Diff + patch

```typescript
import { createSkillPatch, applySkillPatch } from 'agent-skills-ts-sdk';

const patch = createSkillPatch(oldContent, newContent);
const result = applySkillPatch(oldContent, patch);

if (!result.ok) {
  console.error(result.errors);
} else {
  console.log(result.content);
}
```

## Library Guide

### Parsing

- `parseFrontmatter` parses YAML frontmatter into the spec’s hyphenated keys, trims required fields, and preserves metadata scalars as strings.
- `parseSkillContent` returns both the markdown body and a JS-friendly `SkillProperties` shape.
- `frontmatterToProperties` converts `SkillFrontmatter` to `SkillProperties` without re-parsing.
- `extractBody` strips frontmatter and returns the markdown body.
- `findSkillMdFile` and `readSkillProperties` mirror the reference library’s file lookup without assuming a filesystem.

### Validation

- `validateSkillProperties` enforces the name/description/compatibility rules and optionally checks an expected name.
- `validateSkillContent` validates a single SKILL.md string, including unknown frontmatter fields.
- `validateSkillEntries` mirrors `skills-ref validate` for in-memory file lists while letting the host surface path and directory state.

### Prompt utilities

- `toPrompt` builds the `<available_skills>` XML block from parsed entries or raw SKILL.md content.
- `toDisclosurePrompt` optionally includes resource names for tier-3 hints.
- `toDisclosureInstructions` generates canonical read-protocol instruction text.
- `toReadToolSchema` builds a strict JSON-schema declaration for a read tool.
- `handleSkillRead` handles 2-level read requests in memory (overview vs specific resource).

### Diff + patch

- `diffSkillContent` returns a line-based diff for display or patch construction.
- `createSkillPatch` builds a contextual patch from two SKILL.md strings.
- `applySkillPatch` applies patch operations and returns structured errors when a patch cannot be applied or yields invalid SKILL.md.
- `validateSkillPatch` performs runtime validation for model-provided patch payloads.

### Utilities

- `normalizeNFKC` matches Python’s `unicodedata.normalize("NFKC", ...)` for name validation.
- `estimateTokens` provides a conservative heuristic for context budgeting.

### Types

- `SkillFrontmatter` matches spec keys (`allowed-tools`), `SkillProperties` is the camel-cased JS view.
- `SkillFile` and `SkillMetadata` are storage-friendly wrappers used by hosts that persist skills.

## Specification Compliance

This package mirrors the Agent Skills specification for content parsing and
validation, and aligns with the Python `skills-ref` reference behavior.
Directory-level checks (missing paths, non-directories, name-to-location match)
are surfaced through `validateSkillEntries` so hosts can supply their own storage model.

### Required Fields

- `name` (max 64 chars, lowercase, hyphens only)
- `description` (max 1024 chars)

### Optional Fields

- `license`
- `compatibility` (max 500 chars)
- `metadata` (key-value pairs)
- `allowed-tools` (experimental)

### Validation Rules

- Name must be lowercase
- Name cannot start/end with hyphen
- Name cannot contain consecutive hyphens
- Unicode normalization (NFKC)
- i18n support (Chinese, Russian, etc.)

## Testing

This package follows Test-Driven Development with comprehensive test coverage:

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

**Coverage goals:**

- Line coverage: >95%
- Branch coverage: >90%
- Function coverage: >95%

## API Reference

See [API.md](./API.md) for full module and function details.

## License

MIT
