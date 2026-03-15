# AgentSkills Specification Reference

This document contains the complete AgentSkills specification for reference during development and maintenance.

**Official Specification**: https://agentskills.io/specification
**Last Updated**: 2026-01-14
**Reference Implementation**: https://github.com/agentskills/agentskills/tree/main/skills-ref

---

## SKILL.md Format

A skill is a directory containing at minimum a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: skill-name
description: A description of what this skill does and when to use it.
---
# Skill Instructions

Markdown content here...
```

## Field Specifications

### Required Fields

| Field         | Type   | Constraints                                                                                                                                                       |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string | Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start/end with hyphen or contain consecutive hyphens. Must match parent directory name. |
| `description` | string | Max 1024 characters. Non-empty. Should describe what the skill does and when to use it.                                                                           |

### Optional Fields

| Field           | Type   | Constraints                                                                              |
| --------------- | ------ | ---------------------------------------------------------------------------------------- |
| `license`       | string | License name or reference to bundled license file.                                       |
| `compatibility` | string | Max 500 characters. Environment requirements (product, system packages, network access). |
| `metadata`      | object | Arbitrary key-value string mapping for additional properties.                            |
| `allowed-tools` | string | Space-delimited list of pre-approved tools (Experimental).                               |

## Validation Rules

### Name Field

**Format**: Lowercase letters, digits, and hyphens only
**Max Length**: 64 characters
**Unicode**: NFKC normalized before validation
**i18n**: Supports Unicode letters (Chinese, Russian, etc.)

**Rules**:

- Must be lowercase
- Cannot start or end with hyphen
- Cannot contain consecutive hyphens (`--`)
- Must only contain letters, digits, and hyphens

**Valid Examples**:

```yaml
name: pdf-processing
name: data-analysis
name: code-review
name: 技能          # Chinese
name: мой-навык     # Russian with hyphens
```

**Invalid Examples**:

```yaml
name: PDF-Processing      # uppercase not allowed
name: -pdf                # cannot start with hyphen
name: pdf--processing     # consecutive hyphens not allowed
name: my_skill            # underscores not allowed
```

### Description Field

**Max Length**: 1024 characters
**Must**: Be non-empty string

**Good Example**:

```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

**Poor Example**:

```yaml
description: Helps with PDFs. # Too vague
```

### Compatibility Field

**Max Length**: 500 characters
**Optional**

```yaml
compatibility: Designed for Claude Code (or similar products)
compatibility: Requires git, docker, jq, and access to the internet
```

### Metadata Field

**Type**: Object with string key-value pairs
**Optional**

```yaml
metadata:
  author: example-org
  version: '1.0'
  category: data-processing
```

### Allowed-Tools Field (Experimental)

**Type**: Space-delimited string
**Optional**

```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read
```

## Progressive Disclosure

Skills use a three-tier loading strategy:

1. **Metadata** (~50-100 tokens): `name` and `description` fields loaded at startup
2. **Instructions** (~500-5000 tokens): Full `SKILL.md` body loaded when activated
3. **Resources** (as needed): Files in `scripts/`, `references/`, `assets/` loaded on demand

## Directory Structure

```
skill-name/
├── SKILL.md           # Required
├── scripts/           # Optional: executable code
│   ├── extract.py
│   └── process.sh
├── references/        # Optional: additional docs
│   └── REFERENCE.md
└── assets/           # Optional: static resources
    ├── template.json
    └── schema.yaml
```

## Frontmatter Parsing Rules

1. File must start with `---`
2. Frontmatter must be closed with second `---`
3. YAML must be valid mapping (object)
4. Required fields (`name`, `description`) must be present
5. Required fields must be non-empty strings
6. Names and descriptions are trimmed
7. Metadata values are converted to strings

## Body Content

- Markdown content after frontmatter
- No format restrictions
- Recommended: Keep under 500 lines
- Support for relative file references

## Reference Implementation Behavior

The Python reference implementation (`skills-ref`) provides canonical behavior:

### Parser (`parser.py`)

- Finds `SKILL.md` (case-insensitive, prefers uppercase)
- Parses YAML frontmatter with `strictyaml`
- Validates required fields presence
- Trims and normalizes field values
- Converts metadata to string key-value pairs

### Validator (`validator.py`)

- NFKC Unicode normalization
- Name format validation (lowercase, hyphens, length)
- Description length validation
- Compatibility length validation
- Field presence validation
- Directory name matching (when applicable)

### Models (`models.py`)

- `SkillProperties` dataclass with required/optional fields
- `to_dict()` method excludes None values
- `allowed-tools` stored with hyphen (not underscore)
- Empty metadata dict omitted from dict output

## Testing Requirements

This implementation must pass equivalent tests to:

- `tests/test_parser.py` (29+ test cases)
- `tests/test_validator.py` (32+ test cases)

### Test Categories

1. **Frontmatter Parsing**
   - Valid frontmatter
   - Missing frontmatter
   - Unclosed frontmatter
   - Invalid YAML
   - Non-dict frontmatter

2. **Required Fields**
   - Missing name
   - Missing description
   - Empty name
   - Empty description

3. **Name Validation**
   - Uppercase rejection
   - Length limits
   - Leading/trailing hyphens
   - Consecutive hyphens
   - Invalid characters (underscores, etc.)
   - i18n support (Chinese, Russian)
   - Unicode normalization (NFKC)

4. **Description Validation**
   - Length limits (1024 chars)

5. **Optional Fields**
   - Compatibility length (500 chars)
   - Metadata parsing
   - Allowed-tools parsing
   - License field

6. **Field Restrictions**
   - Unknown field rejection

## Compliance Checklist

- [ ] Parse YAML frontmatter correctly
- [ ] Validate required fields (name, description)
- [ ] Validate name format (lowercase, hyphens, length)
- [ ] Validate description length (1024 chars)
- [ ] Validate compatibility length (500 chars)
- [ ] Support optional fields (license, metadata, allowed-tools)
- [ ] Perform NFKC Unicode normalization
- [ ] Support i18n characters in names
- [ ] Reject unknown frontmatter fields
- [ ] Extract body content (strip frontmatter)
- [ ] Trim and normalize field values
- [ ] Convert metadata to string key-value pairs
- [ ] Handle case-insensitive SKILL.md filename
- [ ] Provide clear error messages

---

**Note**: This specification must be kept in sync with https://agentskills.io/specification. Check for updates periodically.
