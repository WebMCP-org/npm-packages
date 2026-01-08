# Changelog

All notable changes to the WebMCP Setup skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-07

### Added
- Initial release of WebMCP Setup skill
- Framework detection for React, Vue, Next.js, Angular, Svelte, and vanilla HTML
- Automatic package installation based on detected framework
- SKILL.md with comprehensive setup instructions
- Reference documentation:
  - REACT_SETUP.md - Detailed React integration guide
  - TOOL_PATTERNS.md - Common tool patterns and best practices
  - TROUBLESHOOTING.md - Common issues and solutions
- Template files:
  - vanilla-demo.html - Complete working demo for vanilla HTML
- Scripts:
  - verify-setup.js - Environment verification script
- Package metadata and README
- Claude Code plugin configuration

### Framework Support
- ✅ React (17, 18, 19) with `@mcp-b/react-webmcp`
- ✅ Vue 3+ with `@mcp-b/webmcp-ts-sdk`
- ✅ Next.js (13+, App Router and Pages Router)
- ✅ Vanilla HTML/JS with `@mcp-b/global` IIFE
- ✅ Angular 14+ (SDK-based)
- ✅ Svelte 3+ and SvelteKit (SDK-based)

### Documentation
- Comprehensive SKILL.md with setup workflow
- Quick reference table for common tasks
- Success criteria checklist
- Best practices for tool registration
- Performance optimization guidelines
- Links to WebMCP documentation

[0.1.0]: https://github.com/WebMCP-org/npm-packages/releases/tag/webmcp-skill-v0.1.0
