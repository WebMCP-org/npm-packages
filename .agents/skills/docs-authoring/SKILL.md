---
name: docs-authoring
description: Author and review the WebMCP documentation site using its Diataxis structure, Mintlify conventions, writing rules, design system, and source-of-truth boundaries. Use when creating, editing, reorganizing, or validating pages under apps/documentation-website.
---

# WebMCP Documentation: Authoring Guide

Reference for writing and editing the WebMCP docs. The repo-wide agent
instructions live in the root [CLAUDE.md](../../../CLAUDE.md); this file covers the
docs-specific rules (Diataxis, writing style, Mintlify components, source-of-truth
boundaries).

## What this is

Documentation for [WebMCP](https://webmachinelearning.github.io/webmcp/), a W3C standard for making websites AI-accessible through `document.modelContext`. Built with
[Mintlify](https://mintlify.com). Live at
[docs.mcp-b.ai](https://docs.mcp-b.ai).

## Site structure

`apps/documentation-website/docs.json` is the single source of truth for navigation,
pages, groups, and hierarchy. Read it first.

| Tab               | Path prefix            | Diataxis type          |
| ----------------- | ---------------------- | ---------------------- |
| **Home**          | `index`, `start-here/` | Landing + routing      |
| **Tutorials**     | `tutorials/`           | Learning-oriented      |
| **How-To Guides** | `how-to/`              | Goal-oriented          |
| **Reference**     | `reference/`           | Information-oriented   |
| **Explanation**   | `explanation/`         | Understanding-oriented |

### Key files

| File                                   | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `apps/documentation-website/docs.json` | Navigation, theme, config. **Do not modify without explicit request.**    |
| `../diataxis/SKILL.md`                 | Diataxis framework overview and compass                                   |
| `../diataxis/references/`              | 17 unabridged Diataxis reference pages from diataxis.fr                   |
| `../mintlify/SKILL.md`                 | Mintlify best practices (components, navigation, frontmatter, deployment) |
| `references/design-system.mdx`         | Brand colors, typography, Mintlify component examples                     |

---

## Diataxis framework

This documentation follows [Diataxis](https://diataxis.fr/) by Daniele Procida.
Read `../diataxis/SKILL.md` for the full compass. Read
`../diataxis/references/<type>.md` for the complete reference on each type before
writing or editing a page of that type.

### The four types (never mix on a single page)

**Tutorials** (`../diataxis/references/tutorials.md`):

- A guided learning experience. The teacher holds responsibility. The learner follows.
- Concrete steps, no choices, no branching. Every step produces a visible result.
- Zero conceptual explanation. "We're using HTTPS because it's more secure" is enough. Link to the explanation page for the full story.
- Language: "We will...", "First, do X. Now, do Y.", "Notice that...", "You have built..."

**How-to guides** (`../diataxis/references/how-to-guides.md`):

- Directions for a competent user solving a real problem.
- Assumes the reader knows the basics and has a specific goal.
- Can branch ("If you need X, do Y"). Addresses real-world conditions.
- No digression, no explanation, no teaching. "If they're important, link to them."
- Language: conditional imperatives. "To do X, run Y."

**Reference** (`../diataxis/references/reference.md`):

- Technical description of the machinery. Austere, factual, structured like the code.
- Consulted while working, not read cover-to-cover.
- Describe and only describe. No teaching, no opinions. Link to how-to guides for usage and explanation pages for the "why".
- Language: "X does Y.", "You must use X.", lists, tables, warnings.

**Explanation** (`../diataxis/references/explanation.md`):

- Discursive treatment that deepens understanding.
- Read after stepping away from work. Discusses why, provides context, weighs alternatives.
- Admits opinion and perspective. Makes connections across topics.
- Language: "The reason for X is...", "Consider...", analogies, history, alternatives.

### Cross-linking between types

Each type is deliberately incomplete. Links are how the reader moves between them. Every page should have at least 2-3 outgoing links to related pages, woven naturally into prose (not a "See also" dump at the bottom).

- **Tutorials** → link to explanation pages parenthetically: "(see [Security Model](/explanation/design/security-and-human-in-the-loop) for details)"
- **How-to** → link to explanation with one sentence of context: "For background on transports, see [Transports and Bridges](/explanation/architecture/transports-and-bridges)." Link to reference pages on first mention of any package.
- **Reference** → link to how-to for practical usage, explanation for the "why"
- **Explanation** → link to other explanation pages for related concepts, reference pages when naming specific APIs

### Canonical locations for concepts

If a concept is covered on multiple pages, one page owns it. All others link to it.

| Concept                           | Canonical page                                                    |
| --------------------------------- | ----------------------------------------------------------------- |
| What is WebMCP                    | `explanation/what-is-webmcp`                                      |
| WebMCP vs MCP                     | `explanation/webmcp-vs-mcp`                                       |
| Native vs polyfill vs global      | `explanation/native-vs-polyfill-vs-global`                        |
| Strict core vs MCP-B extensions   | `explanation/strict-core-vs-mcp-b-extensions`                     |
| Runtime layering / initialization | `explanation/architecture/runtime-layering`                       |
| Transports and bridges            | `explanation/architecture/transports-and-bridges`                 |
| Tool lifecycle                    | `explanation/architecture/tool-lifecycle-and-context-replacement` |
| Security model                    | `explanation/design/security-and-human-in-the-loop`               |
| Tool design principles            | `explanation/design/tool-design`                                  |
| Spec status                       | `explanation/design/spec-status-and-limitations`                  |
| Choosing a runtime                | `how-to/choose-runtime`                                           |
| Package API details               | the matching `reference/runtime/*` or `reference/tools/*` page    |

---

## Writing style

Follow the **writing-clearly-and-concisely** skill (`~/.claude/skills/writing-clearly-and-concisely/SKILL.md`). It covers active voice, concision, AI pattern avoidance, and Strunk's composition principles. Read it before writing or editing any page.

### WebMCP-specific rules

- Second-person ("you") for instructions
- Lead with the verb in steps: "Install the package", not "You should install the package"
- No em dashes. Use commas, periods, or parentheses.
- No excessive bold. Bold for terms on first definition only.
- No emoji unless the user requests them.

### Product names

- "WebMCP" for the standard
- `@mcp-b/*` for packages
- "MCP-B" only in package scope contexts (npm scope, commit messages)

---

## Code examples

- Every example must be real, taken from source code, tests, or package READMEs. Do not invent code.
- Specify language for syntax highlighting
- Add titles to code blocks: `"filename.ext"`
- Use `CodeGroup` for multi-framework examples
- Use `twoslash` for TypeScript/TSX hover type information
- Make long examples (50+ lines) expandable

---

## Mintlify format

Follow the **mintlify** skill (`../mintlify/SKILL.md`) for components, navigation
patterns, page frontmatter, and deployment. It covers everything from `docs.json`
configuration to component selection to the verification checklist.

The **Mintlify MCP server** is configured in `.mcp.json` and available to all agents. Use it to search Mintlify's latest docs instead of relying on training data.

Read `references/design-system.mdx` for brand-specific component examples (colors,
typography, callout usage).

### Frontmatter requirements

Every page needs at minimum:

```yaml
---
title: 'Page Title in Sentence case'
description: 'Concise summary for SEO'
---
```

Include `keywords` for discoverability. Include `sidebarTitle` when the full title is too long for the sidebar. Include `icon` when the page is a landing or index page.

### Links

- Internal links: root-relative, no extension: `[text](/path/to/page)`
- Paths must match entries in `docs.json`
- New pages must be added to `docs.json` navigation

### Headings

Use sentence case for all headings and code block titles ("Getting started", not "Getting Started").

### Component selection

Pick the right component for the job. See `../mintlify/SKILL.md` for the full list.
Quick reference:

| Need                                       | Component                                    |
| ------------------------------------------ | -------------------------------------------- |
| Sequential instructions                    | `<Steps>` with `<Step title="...">` children |
| Show code in multiple languages/frameworks | `<CodeGroup>`                                |
| Supplementary info the reader can skip     | `<Note>`                                     |
| Helpful context (permissions, prereqs)     | `<Info>`                                     |
| Best practice or recommendation            | `<Tip>`                                      |
| Potentially destructive or breaking action | `<Warning>`                                  |
| Success confirmation                       | `<Check>`                                    |
| Hide optional details                      | `<Accordion>`                                |
| User chooses one option                    | `<Tabs>` with `<Tab>` children               |
| Linked navigation cards                    | `<Card>` in `<CardGroup>`                    |
| Side-by-side comparison                    | `<Columns>`                                  |
| Diagrams and flowcharts                    | `<Mermaid>`                                  |
| Images with light/dark mode                | `<Frame>`                                    |

Rules:

- All code blocks must have a language tag
- Use `<Steps>` with `<Step>` children, not `<Steps>` with `###` headings inside
- Do not overuse callouts. One per section at most. If everything is a note, nothing is.
- Do not nest components more than two levels deep

---

## Source of truth: what we own vs. what the Chrome team owns

This is critical. WebMCP is a **W3C web standard** developed by Google and Microsoft. Our project (`@mcp-b/*`) provides a **polyfill and runtime** on top of that standard. The docs must make this distinction clear and always point to the canonical upstream sources for the standard itself.

### What the Chrome team / W3C owns (link to these, don't re-document)

**W3C spec and proposals:**

| Topic                        | Canonical URL                                                                                  | Local clone                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| W3C WebMCP spec (formal)     | https://webmachinelearning.github.io/webmcp/                                                   | `official-spec/webmcp/index.bs`                                |
| WebMCP proposal (API design) | https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md                        | `official-spec/webmcp/docs/proposal.md`                        |
| Explainer (declarative API)  | https://github.com/webmachinelearning/webmcp/blob/main/docs/explainer.md                       | `official-spec/webmcp/docs/explainer.md`                       |
| Declarative API spec         | https://github.com/webmachinelearning/webmcp/blob/main/docs/declarative.md                     | `official-spec/webmcp/docs/declarative.md`                     |
| Security & privacy           | https://github.com/webmachinelearning/webmcp/blob/main/docs/security-privacy-considerations.md | `official-spec/webmcp/docs/security-privacy-considerations.md` |
| W3C Community Group          | https://www.w3.org/community/webmachinelearning/                                               | —                                                              |
| Model Context Protocol       | https://modelcontextprotocol.io/                                                               | —                                                              |

**Chrome team developer docs (link to these prominently):**

| Topic                          | URL                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------- |
| WebMCP early preview blog post | https://developer.chrome.com/blog/webmcp-epp                                     |
| Early Preview Program signup   | https://developer.chrome.com/docs/ai/join-epp                                    |
| Chrome DevTools MCP blog       | https://developer.chrome.com/blog/chrome-devtools-mcp                            |
| DevTools MCP debugging guide   | https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session |
| AI on Chrome overview          | https://developer.chrome.com/docs/ai                                             |

**Chrome team tools and demos:**

| Topic                                           | URL                                                                                                 | Local clone                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Model Context Tool Inspector (Chrome Web Store) | https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd | —                                            |
| Tool Inspector source                           | https://github.com/beaufortfrancois/model-context-tool-inspector                                    | `webmcp-tools/model-context-tool-inspector/` |
| webmcp-tools repo (demos + utilities)           | https://github.com/GoogleChromeLabs/webmcp-tools                                                    | `webmcp-tools/`                              |
| Live demos (flight search, bistro, pizza)       | https://googlechromelabs.github.io/webmcp-tools/demos/                                              | `webmcp-tools/demos/`                        |
| Awesome WebMCP list                             | `webmcp-tools/AWESOME_WEBMCP.md`                                                                    | `webmcp-tools/AWESOME_WEBMCP.md`             |

**Rules for standard vs. polyfill content:**

- When documenting `document.modelContext` API shape (methods, parameters,
  return types), link to the W3C spec and proposal. Describe
  `navigator.modelContext` only as a deprecated compatibility alias. Our
  reference pages should provide a quick-lookup summary, but always include a
  "See the [W3C spec](https://webmachinelearning.github.io/webmcp/) for the
  authoritative definition" link. Do not maintain a competing full spec. If
  the upstream spec is more detailed, say so and link.
- When documenting the declarative API (`toolname`, form attributes, schema synthesis, CSS pseudo-classes, SubmitEvent extensions), link to the Chrome team's [declarative explainer](https://github.com/webmachinelearning/webmcp/blob/main/docs/declarative.md). Show a short example, then link. Do not re-document the full type mapping table or constraint mapping table; those will go stale as Chrome iterates.
- When documenting `@mcp-b/*` packages, that's ours. Document fully. But clearly mark what is "WebMCP standard" behavior vs. "MCP-B extension" behavior. Treat `registerTool` and `unregisterTool` as the stable standard surface. Do not describe `provideContext` or `clearContext` as current WebMCP standard methods. Everything else (`registerPrompt`, `registerResource`, `listTools`, `callTool`, `createMessage`, `elicitInput`) is an MCP-B extension.
- When showing demos or examples of the standard working, prefer linking to the Chrome team's live demos at `googlechromelabs.github.io/webmcp-tools/demos/` rather than recreating them.
- Security model documentation should summarize our approach but link to the upstream [security-privacy-considerations.md](https://github.com/webmachinelearning/webmcp/blob/main/docs/security-privacy-considerations.md) for the full threat model.
- When mentioning native Chrome support, always link to the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd) extension. It's the Chrome team's official tool for inspecting WebMCP tools and it's in the Chrome Web Store.

**Page-specific guidance:**

| Our page                                         | What to keep                                                             | What to defer upstream                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference/webmcp/model-context.mdx`             | Quick-lookup method table, code examples showing usage with our polyfill | Full ToolDescriptor spec, ContentBlock types, InputSchema spec → link to W3C spec                                                           |
| `reference/webmcp/declarative-api.mdx`           | One example showing `toolname` on a form, SubmitEvent pattern            | Full type mapping table, constraint mapping table, schema synthesis rules, CSS pseudo-classes → link to Chrome team's declarative explainer |
| `reference/webmcp/browser-support-and-flags.mdx` | Support matrix, flag instructions                                        | Chromium source paths, detailed flag semantics → link to `CHROMIUM_FLAGS.md`                                                                |
| `explanation/what-is-webmcp.mdx`                 | High-level "what and why", ecosystem positioning                         | Detailed API walkthrough → link to W3C explainer and proposal                                                                               |
| `tutorials/first-native-preview.mdx`             | The tutorial steps                                                       | Prominently feature the Chrome Web Store extension link and Chrome team demos                                                               |

### What we own (document fully)

| Topic                                          | Location                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `@mcp-b/*` package APIs                        | `packages/*/README.md` and `packages/*/src/`                                    |
| Package architecture & philosophy              | `CLAUDE.md`, `docs/MCPB_PACKAGE_PHILOSOPHY.md`                                  |
| Polyfill behavior & initialization             | `packages/webmcp-polyfill/`, `packages/global/`                                 |
| React hooks                                    | `packages/react-webmcp/`, `packages/usewebmcp/`                                 |
| Transports, iframe, relay                      | `packages/transports/`, `packages/mcp-iframe/`, `packages/webmcp-local-relay/`  |
| Tooling (devtools-mcp, smart-dom-reader, etc.) | `packages/chrome-devtools-mcp/`, `packages/smart-dom-reader/`, etc.             |
| Type contracts                                 | `packages/webmcp-types/src/*.test-d.ts`                                         |
| Chromium flags & testing                       | `e2e/web-standards-showcase/CHROMIUM_FLAGS.md`, `e2e/tests/CHROMIUM_TESTING.md` |

---

## Brand

| Key           | Value                                      |
| ------------- | ------------------------------------------ |
| Primary color | #1F5EFF                                    |
| Product name  | "WebMCP" (not "MCP-B" in user-facing docs) |
| Package scope | `@mcp-b/*`                                 |
| Organization  | WebMCP-org                                 |
| Docs URL      | docs.mcp-b.ai                              |
| Live demo     | webmcp.sh                                  |
| Icons         | Font Awesome (see docs.json)               |

---

## Do not

- Skip frontmatter (`title` and `description` are required on every `.mdx` file)
- Use absolute URLs for internal links (use root-relative: `/path/to/page`)
- Use title case for headings (use sentence case: "Getting started", not "Getting Started")
- Write code blocks without a language tag
- Use `<Steps>` with `###` headings inside (use `<Step title="...">` children)
- Include untested or invented code examples
- Use placeholder values like "foo" or "bar" in code (use realistic values)
- Reference outdated MiguelsPizza organization links
- Mix Diataxis content types within a single page
- Re-explain a concept that has a canonical page (link to it instead)
- Re-document the W3C standard API surface in detail when the upstream spec is more authoritative. Summarize, then link.
- Blur the line between "WebMCP standard" and "MCP-B extension". Always clarify which layer a feature belongs to.
- Overuse callouts. One per section at most.
- Use decorative formatting, emoji, or excessive bold

## Development

```bash
pnpm dev:docs # from the repo root. Preview at http://localhost:3000
```

Deployed automatically on push to main via Mintlify's GitHub integration.
