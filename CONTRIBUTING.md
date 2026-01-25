# Contributing to MCP-B NPM Packages

Thank you for considering contributing to MCP-B!

## Code Quality Requirements

**All contributions must meet these standards before being merged:**

### Type Safety
- All code must be written in TypeScript with strict mode enabled
- No `any` types unless absolutely necessary (and documented why)
- All public APIs must have explicit type annotations
- No `@ts-ignore` or `@ts-expect-error` without explanation

### Testing
- All new features must include tests
- All bug fixes must include a regression test
- Tests must pass before submitting a PR:
  ```bash
  pnpm test:unit    # Unit tests must pass
  pnpm test:e2e     # E2E tests must pass (if applicable)
  ```

### Code Quality Checks
- All code must pass linting and formatting:
  ```bash
  pnpm check        # Biome linting and formatting
  pnpm typecheck    # TypeScript type checking
  pnpm build        # Build must succeed
  ```

### Before Submitting a PR
Run the full validation suite:
```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test:unit
```

If any of these fail, your PR will not be merged.

---

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what behavior you expected**
- **Include screenshots if relevant**
- **Include your environment details** (OS, Node version, browser version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Provide specific examples to demonstrate the enhancement**
- **Describe the current behavior and expected behavior**
- **Explain why this enhancement would be useful**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Write your code following TypeScript strict mode
3. Add tests for all new features and bug fixes
4. Update documentation for any API changes
5. **Run the full validation suite** (see Code Quality Requirements above)
6. Create a changeset: `pnpm changeset`
7. Submit your pull request

**PRs that don't pass all checks will not be merged.**

## Development Process

### Prerequisites

- Node.js >= 22.12 (check `.nvmrc`)
- pnpm >= 10.0.0
- Git

### Setting Up Your Development Environment

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/npm-packages.git
   cd npm-packages
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Making Changes

1. **Write type-safe code**
   - Use TypeScript strict mode (already configured)
   - Add explicit types for all public APIs
   - Avoid `any` - use `unknown` and type guards instead
   - Follow existing code patterns

2. **Add tests**
   - Write unit tests for new functionality
   - Add regression tests for bug fixes
   - Test edge cases and error conditions

3. **Validate your changes**
   ```bash
   pnpm build        # Must succeed
   pnpm typecheck    # No type errors
   pnpm check        # No lint errors
   pnpm test:unit    # All tests pass
   ```

4. **Create a changeset**
   ```bash
   pnpm changeset
   ```
   - Select the packages you've changed
   - Choose the appropriate version bump (patch/minor/major)
   - Write a clear description of your changes

### Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification with **required package scopes** for clarity in our monorepo:

#### Commit Format
```
<type>(<scope>): <subject>
```

#### Types
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only changes
- `style:` Code style changes (formatting, etc)
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `perf:` Performance improvement
- `test:` Adding missing tests
- `build:` Changes to build system or dependencies
- `ci:` Changes to CI configuration
- `chore:` Other changes that don't modify src or test files

#### Scopes (Required)
Package scopes (all in `packages/` directory):
- `chrome-devtools-mcp` - @mcp-b/chrome-devtools-mcp
- `extension-tools` - @mcp-b/extension-tools
- `global` - @mcp-b/global
- `mcp-iframe` - @mcp-b/mcp-iframe
- `react-webmcp` - @mcp-b/react-webmcp
- `smart-dom-reader` - @mcp-b/smart-dom-reader
- `transports` - @mcp-b/transports
- `usewebmcp` - usewebmcp (alias package)
- `webmcp-helpers` - @webmcp/helpers
- `webmcp-ts-sdk` - @mcp-b/webmcp-ts-sdk

Repository-wide scopes:
- `root` - Changes to root config files
- `deps` - Dependency updates
- `release` - Release-related changes
- `ci` - CI/CD changes
- `docs` - Documentation changes
- `*` - Multiple packages affected (use sparingly)

#### Examples
```bash
# Package-specific changes
git commit -m "feat(transports): add postMessage timeout option to TabServerTransport"
git commit -m "fix(extension-tools): handle chrome.runtime errors gracefully"
git commit -m "docs(react-webmcp): update usage examples"
git commit -m "feat(global): add new tool registration API"

# Repository-wide changes
git commit -m "chore(deps): upgrade @modelcontextprotocol/sdk to v2.0"
git commit -m "ci(root): add npm publishing workflow"
git commit -m "docs(root): update README with installation instructions"

# Multiple packages (use sparingly)
git commit -m "refactor(*): update to new MCP SDK types"
```

**Note:** Commits without proper format will be rejected by our commit-msg hook!

### Submitting Your Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request**
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template with:
     - Clear description of changes
     - Related issue numbers
     - Testing steps
     - Screenshots (if applicable)

3. **Address review feedback**
   - Make requested changes
   - Push new commits to your branch
   - Re-request review when ready

## Project Structure

```
npm-packages/
├── packages/                    # All NPM packages
│   ├── chrome-devtools-mcp/     # Chrome DevTools MCP server
│   ├── extension-tools/         # Chrome Extension API tools
│   ├── global/                  # Navigator.modelContext polyfill
│   ├── mcp-iframe/              # Iframe MCP element
│   ├── react-webmcp/            # React hooks for MCP
│   ├── smart-dom-reader/        # DOM extraction for AI
│   ├── transports/              # Core transport implementations
│   ├── usewebmcp/               # Alias for react-webmcp
│   ├── webmcp-helpers/          # Userscript helpers
│   └── webmcp-ts-sdk/           # TypeScript SDK adapter
├── e2e/                         # E2E tests and test apps
├── docs/                        # Technical documentation
└── .changeset/                  # Changeset files
```

## Package Guidelines

When contributing to a specific package:

### @mcp-b/global
- Ensure compatibility with W3C Web Model Context API spec
- Test in multiple browser environments
- Validate tool registration and unregistration
- Handle edge cases in two-bucket system

### @mcp-b/webmcp-ts-sdk
- Minimal modifications to official SDK
- Maintain compatibility with upstream SDK updates
- Focus on dynamic tool registration support

### @mcp-b/transports
- Ensure browser compatibility
- Test in multiple browser environments
- Handle connection lifecycle properly
- Support both Tab and Extension transports

### @mcp-b/react-webmcp
- Follow React best practices
- Ensure proper cleanup in useEffect
- Add proper TypeScript types for hooks
- Support both provider and client use cases
- Test with React StrictMode

### @mcp-b/extension-tools
- Test in Chrome extension context
- Document required permissions
- Handle chrome.runtime errors gracefully
- Auto-generate tools from Chrome API types

### @mcp-b/smart-dom-reader
- Optimize for token efficiency
- Test in various DOM structures
- Handle shadow DOM and iframes
- Maintain stateless architecture

### @mcp-b/chrome-devtools-mcp
- Test with Chrome DevTools Protocol
- Handle browser window lifecycle
- Support WebMCP tool integration
- Test auto-connect and session management

### @mcp-b/mcp-iframe
- Test cross-origin scenarios
- Handle postMessage security properly
- Support tool prefixing for namespacing
- Test connection lifecycle

### @webmcp/helpers
- Keep utilities lightweight
- Maintain tree-shakeability
- Document all helper functions
- Test DOM manipulation edge cases

## Testing

### Required Tests

All PRs must include appropriate tests:

```bash
pnpm test:unit      # Run unit tests (required)
pnpm test:e2e       # Run E2E tests (if applicable)
```

### Writing Tests

- **Unit tests**: Use Vitest, co-located with source files (`*.test.ts`)
- **Browser tests**: Use Vitest with `@vitest/browser` for browser-specific code
- **E2E tests**: Use Playwright in the `e2e/` directory

### Test Coverage

- New features must have tests covering the main functionality
- Bug fixes must include a test that would have caught the bug
- Edge cases and error conditions should be tested

### Manual Testing

For browser-specific changes:
1. Test in Chrome, Firefox, and Safari
2. Test in both development and production builds
3. Include testing steps in your PR description

See [docs/TESTING.md](./docs/TESTING.md) for detailed testing documentation.

## Documentation

- Update README files for any API changes
- Add JSDoc comments for public APIs
- Include usage examples for new features
- Update TypeScript types and interfaces

## Release Process

Releases are handled automatically by our CI/CD pipeline:

1. Contributors create changesets with their PRs
2. A bot creates a "Version Packages" PR
3. Maintainers review and merge the version PR
4. Packages are automatically published to npm

## Getting Help

- **Discord**: Join our [Discord community](https://discord.gg/a9fBR6Bw)
- **GitHub Issues**: Open an issue for bugs or features
- **Discussions**: Use GitHub Discussions for questions

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- Our Discord community

Thank you for contributing to MCP-B! 🚀