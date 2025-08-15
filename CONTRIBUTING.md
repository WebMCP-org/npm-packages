# Contributing to MCP-B NPM Packages

First off, thank you for considering contributing to MCP-B! It's people like you that make MCP-B such a great tool for the developer community.

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
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code follows the existing code style
6. Issue that pull request!

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

1. **Write your code**
   - Follow the existing code style
   - Add TypeScript types for all new code
   - Update documentation as needed

2. **Test your changes**
   ```bash
   # Build all packages
   pnpm build
   
   # Run type checking
   pnpm typecheck
   
   # Run linting and formatting
   pnpm check
   ```

3. **Create a changeset**
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
Package scopes:
- `transports` - Changes to @mcp-b/transports
- `extension-tools` - Changes to @mcp-b/extension-tools
- `mcp-react-hooks` - Changes to @mcp-b/mcp-react-hooks
- `mcp-react-hook-form` - Changes to @mcp-b/mcp-react-hook-form
- `global` - Changes to @mcp-b/global

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
git commit -m "docs(mcp-react-hooks): update usage examples"

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
├── transports/           # Core transport implementations
├── mcp-react-hooks/      # React hooks for MCP
├── extension-tools/      # Chrome Extension API tools
├── mcp-react-hook-form/  # React Hook Form integration
├── global/               # Shared types (internal)
└── .changeset/           # Changeset files
```

## Package Guidelines

When contributing to a specific package:

### @mcp-b/transports
- Ensure browser compatibility
- Test in multiple browser environments
- Handle connection lifecycle properly

### @mcp-b/mcp-react-hooks
- Follow React best practices
- Ensure proper cleanup in useEffect
- Add proper TypeScript types for hooks

### @mcp-b/extension-tools
- Test in Chrome extension context
- Document required permissions
- Handle chrome.runtime errors gracefully

## Testing

### Manual Testing

1. Manually test your changes thoroughly
2. Test in different browsers when applicable
3. Test in both development and production builds
4. Include testing steps in your PR description

### Testing GitHub Actions Locally

You can test GitHub Actions workflows locally before pushing:

1. Install [act](https://github.com/nektos/act) (simulates GitHub Actions)
2. Set up your tokens and configuration
3. Run workflows locally

See our [Testing with Act Guide](./TESTING-WITH-ACT.md) for detailed instructions.

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