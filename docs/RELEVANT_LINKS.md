# Relevant Links

Curated reference for contributors (human and AI) seeking guidance on monorepo quality, documentation, and contribution practices. Each link teaches something specific and actionable.

## Monorepo Architecture & Structure

- [Turborepo - Structuring a Repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- Official guidance on splitting apps vs packages, namespace conventions, and shared code organization.
- [monorepo.tools](https://monorepo.tools/) -- Definitive comparison of all major monorepo tools with feature matrices. Good for understanding the landscape.
- [Luca Pette - How to Structure a Monorepo](https://lucapette.me/writing/how-to-structure-a-monorepo/) -- Opinionated take on mirroring team structure in repo layout and leveraging workspace symlinks.
- [Jonathan Creamer - Inside the Pain of Monorepos and Hoisting](https://www.jonathancreamer.com/inside-the-pain-of-monorepos-and-hoisting/) -- Technical deep-dive on phantom dependencies and why pnpm's non-flat node_modules solves them.
- [Monorepos in JavaScript, Anti-Pattern](https://medium.com/@PepsRyuu/monorepos-in-javascript-anti-pattern-917603da59c8) -- Contrarian view: when separate packages create more problems than they solve. Good for cost-benefit thinking.
- [ByteByteGo - Why Does Google Use Monorepo?](https://blog.bytebytego.com/p/ep62-why-does-google-use-monorepo) -- High-level explanation of monorepo benefits at scale: code sharing, single source of truth for dependencies.

## TypeScript Monorepo Tooling

- [Alan Norbauer - Switching from tsup to tsdown](https://alan.norbauer.com/articles/tsdown-bundler/) -- Why tsdown (Rust-powered, ESM-first) is replacing tsup for TypeScript library bundling.
- [tsdown.dev - Migrate from tsup](https://tsdown.dev/guide/migrate-from-tsup) -- Official migration guide with key differences between the two bundlers.
- [Complete Monorepo Guide: pnpm + Workspace + Changesets](https://jsdev.space/complete-monorepo-guide/) -- End-to-end practical setup covering the exact stack this repo uses.
- [Nhost - How We Configured pnpm and Turborepo](https://nhost.io/blog/how-we-configured-pnpm-and-turborepo-for-our-monorepo) -- Real production setup with specific tsconfig decisions for multi-package repos.
- [Biome vs ESLint: Comparing JavaScript Linters](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/) -- Performance comparison (Biome is 10-25x faster) and trade-offs in rule coverage.
- [From ESLint and Prettier to Biome](https://kittygiraudel.com/2024/06/01/from-eslint-and-prettier-to-biome/) -- Migration experience: 127 npm packages replaced by one. Practical lessons.
- [Understanding TypeScript's Strict Compiler Option](https://betterstack.com/community/guides/scaling-nodejs/typescript-strict-option/) -- Deep dive into what each strict flag does and why they matter.

## Documentation Quality

- [The Divio Documentation System](https://docs.divio.com/documentation-system/) -- Framework for organizing docs into four types: tutorials, how-to guides, reference, explanation. Each requires a distinct writing mode.
- [Readme Driven Development](https://tom.preston-werner.com/2010/08/23/readme-driven-development.html) -- Tom Preston-Werner (GitHub co-founder) on writing READMEs before code. "A perfect implementation of the wrong specification is worthless."
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) -- The standard for human-readable changelogs. Changelogs are for humans, not machines.
- [Documentation Best Practices - Google Style Guide](https://google.github.io/styleguide/docguide/best_practices.html) -- Write docs in the same commit as code changes. A small set of accurate docs beats a large set in disrepair.
- [Azure SDK TypeScript Documentation Guidelines](https://azure.github.io/azure-sdk/typescript_documentation.html) -- Microsoft's standards for TypeScript SDK docs: preempt usage questions, include atomic code snippets.
- [Azure SDK TypeScript API Design Guidelines](https://azure.github.io/azure-sdk/typescript_design.html) -- Comprehensive TypeScript API design principles from Microsoft. Useful for library authors.
- [How to Write a Good README](https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/) -- Answer the what, why, and how. Avoid jargon. Show expected output.
- [awesome-readme](https://github.com/matiassingers/awesome-readme) -- Curated list of excellent README examples from real projects.

## Contributing to Open Source

- [Google Engineering Practices - Code Review](https://google.github.io/eng-practices/review/) -- The standard: focus on design, functionality, complexity, tests, naming, comments, style. Comment on the code, not the developer.
- [The Standard of Code Review - Google](https://google.github.io/eng-practices/review/reviewer/standard.html) -- When to approve, when to request changes, and how to separate style preferences from correctness.
- [Code Review - Software Engineering at Google (Book Chapter)](https://abseil.io/resources/swe-book/html/ch09.html) -- Deep dive: 90% of reviews have fewer than 10 files changed. Small, frequent reviews beat large batches.
- [Move Faster, Wait Less: Code Review at Meta](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/) -- Every diff must be reviewed. Tools surface diffs to the right reviewers at the right time.
- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/) -- GitHub's authoritative guide. Read contributing guidelines first. Start small. Check issue status before working.
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) -- The spec this repo follows. Enables automated changelogs and semantic version bumps.
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) -- The original inspiration for conventional commits. Defines feat, fix, docs, refactor, test, chore.
- [CONTRIBUTING.md Guide](https://contributing.md/how-to-build-contributing-md/) -- What to include: environment setup, PR protocol, bug reporting, style guide, code of conduct.

## Testing & CI/CD

- [Testing Strategies for Monorepos - Graphite](https://graphite.com/guides/testing-strategies-for-monorepos) -- Affected project detection, incremental testing, smart prioritization. "Running all tests for every commit is overkill."
- [Monorepo Testing Strategies - Yuri Kan](https://yrkan.com/blog/monorepo-testing-strategies/) -- Test pyramid breakdown: unit (fastest, most granular), integration (medium), E2E (slowest, most comprehensive).
- [Monorepo CI Best Practices - Buildkite](https://buildkite.com/resources/blog/monorepo-ci-best-practices/) -- Smart build detection, parallelization, module-level caching. Only rebuild what changed.
- [CI/CD Strategies for Monorepos - Graphite](https://graphite.com/guides/implement-cicd-strategies-monorepos) -- Remote caching can reduce pipeline time by 60-80% on large repos.

## Package Publishing & Versioning

- [Semantic Versioning 2.0.0](https://semver.org/) -- The spec: Major.Minor.Patch. Once released, contents must not be modified.
- [Changesets - GitHub](https://github.com/changesets/changesets) -- The tool this repo uses. Contributors declare how changes should be released; automation handles the rest.
- [Changesets for Versioning - Vercel Academy](https://vercel.com/academy/production-monorepos/changesets-versioning) -- Practical changesets workflow: a changeset is an intent to release at a particular semver bump with a summary.
- [How to Create an NPM Package - Total TypeScript](https://www.totaltypescript.com/how-to-create-an-npm-package) -- Matt Pocock's opinionated guide to TypeScript npm packages done right.
- [NPM Package Best Practices with Security in Mind - Snyk](https://snyk.io/blog/best-practices-create-modern-npm-package/) -- Security-focused: type definitions, package configuration, module format support.
- [Release Management Strategies in a Monorepo - Graphite](https://www.graphite.com/guides/release-management-strategies-in-a-monorepo) -- Independent vs synchronized vs hybrid versioning. Choice depends on package coupling.

## AI-Friendly Codebases

- [Using CLAUDE.md Files - Anthropic](https://claude.com/blog/using-claude-md-files) -- Official guide. CLAUDE.md turns Claude Code from a general-purpose assistant into a tool configured for your codebase.
- [How to Write a Good CLAUDE.md - Builder.io](https://www.builder.io/blog/claude-md-guide) -- Keep it concise to minimize context usage, but comprehensive enough to guide the AI.
- [Creating the Perfect CLAUDE.md - Dometrain](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/) -- Structure: project structure, commands, code style, repository etiquette, "do not touch" list.
