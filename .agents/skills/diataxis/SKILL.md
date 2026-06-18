---
name: diataxis
description: Write technical documentation following the Diataxis framework by Daniele Procida. Use when writing, reviewing, or restructuring documentation to ensure correct separation of tutorials, how-to guides, reference, and explanation.
---

# Diataxis Documentation Framework

Complete reference for the Diataxis framework — a systematic approach to technical documentation authoring by Daniele Procida. All content sourced verbatim from [diataxis.fr](https://diataxis.fr/).

## When to Use This Skill

This skill should be triggered when:

- **Writing documentation**: Creating new docs pages of any type
- **Reviewing documentation**: Checking if content is in the right place and follows the right form
- **Restructuring documentation**: Reorganizing existing docs into proper Diataxis categories
- **Deciding content type**: Determining whether something should be a tutorial, how-to, reference, or explanation
- **Resolving confusion**: Distinguishing tutorials from how-to guides, or reference from explanation

## The Diataxis Compass

Use this decision table when you need to classify content:

| If the content...     | ...and serves the user's... | ...then it belongs in... |
| --------------------- | --------------------------- | ------------------------ |
| informs **action**    | **acquisition** of skill    | a **tutorial**           |
| informs **action**    | **application** of skill    | a **how-to guide**       |
| informs **cognition** | **application** of skill    | **reference**            |
| informs **cognition** | **acquisition** of skill    | **explanation**          |

Two questions to ask:

1. **Action or cognition?** Is this about _doing_ something or _knowing_ something?
2. **Acquisition or application?** Is the user _learning_ or _working_?

Full compass guidance: `references/compass.md`

## The Four Documentation Types

### Tutorials (learning-oriented)

- An **experience** guided by a tutor, where the learner acquires skills by doing
- Teacher holds nearly all responsibility — learner just follows directions
- Concrete steps, no choices, no branching, ruthlessly minimal explanation
- Language: "We will...", "First, do X. Now, do Y.", "Notice that...", "You have built..."

**Full reference**: `references/tutorials.md`

### How-to Guides (goal-oriented)

- **Directions** that guide a competent user through a real-world problem
- Assumes the user already knows the basics and has a specific goal
- Can branch ("If this, do that"), addresses real-world conditions
- Language: "If you want X, do Y." Conditional imperatives.

**Full reference**: `references/how-to-guides.md`

### Reference (information-oriented)

- **Technical description** of the machinery — austere, factual, structured like the code
- Consulted while working, not read cover-to-cover
- Neutral, objective. Describe and only describe. No teaching, no opinions.
- Language: "X does Y.", "You must use X.", lists, tables, warnings.

**Full reference**: `references/reference.md`

### Explanation (understanding-oriented)

- **Discursive treatment** that permits reflection and deepens understanding
- Read after stepping away from work. Discusses why, provides context, weighs alternatives.
- Admits opinion and perspective. Makes connections across topics.
- Language: "The reason for X is...", "Consider...", analogies, history, alternatives.

**Full reference**: `references/explanation.md`

## Critical Distinctions

The most common mistake in documentation is mixing types. Read these when boundaries are unclear:

- **Tutorials vs How-to Guides**: `references/tutorials-how-to.md` — The single most common conflation in software documentation. Tutorials are safe, contrived, teacher-led. How-to guides are real-world, user-led, assume competence.
- **Reference vs Explanation**: `references/reference-explanation.md` — Key test: would you consult this _while working_ (reference) or _after stepping away_ (explanation)?

## Reference Files

All files in `references/` contain the complete, unabridged content from diataxis.fr:

### Getting Started

- **`references/index.md`** — Overview and introduction to Diataxis
- **`references/start-here.md`** — Getting started primer
- **`references/application.md`** — Applying Diataxis in practice

### The Four Types (read before writing any documentation)

- **`references/tutorials.md`** (16K) — Complete tutorial guidance with all principles
- **`references/how-to-guides.md`** (11K) — Complete how-to guide guidance
- **`references/reference.md`** (6K) — Complete reference documentation guidance
- **`references/explanation.md`** (7K) — Complete explanation guidance

### Practical Tools

- **`references/compass.md`** — The decision compass for classifying content
- **`references/how-to-use-diataxis.md`** — Workflow guidance for applying the framework

### Theory & Principles

- **`references/theory.md`** — Theoretical foundations overview
- **`references/foundations.md`** — Foundational concepts underpinning Diataxis
- **`references/map.md`** — The Diataxis map and its relationships
- **`references/quality.md`** (11K) — Theory of functional vs deep quality in documentation

### Boundaries & Edge Cases

- **`references/tutorials-how-to.md`** (14K) — Tutorials vs how-to guides (the most important distinction)
- **`references/reference-explanation.md`** — Reference vs explanation
- **`references/complex-hierarchies.md`** (8K) — Handling complex documentation structures

### Meta

- **`references/colophon.md`** — About Diataxis itself

## Working with This Skill

### Before Writing a Page

1. Determine which Diataxis type it is using the compass above
2. Read the full reference file for that type (e.g., `references/tutorials.md`)
3. Follow the language patterns and structural rules for that type
4. **Never mix types on a single page**

### When Reviewing Documentation

1. For each page, use the compass to verify its type
2. Flag any content that mixes types (e.g., explanation inside a how-to guide)
3. Check `references/tutorials-how-to.md` if tutorials and how-tos seem conflated
4. Check `references/reference-explanation.md` if reference and explanation seem blurred

### When Restructuring

1. Read `references/how-to-use-diataxis.md` for the overall workflow
2. Read `references/complex-hierarchies.md` for handling large documentation sites
3. Classify every existing page using the compass
4. Move misplaced content to its correct type

## Notes

- All reference content is Daniele Procida's original writing from diataxis.fr — do not paraphrase when the original words apply
- The reference files are the authority. When in doubt, re-read the relevant file.
- Source: https://diataxis.fr/ — Copyright Daniele Procida
