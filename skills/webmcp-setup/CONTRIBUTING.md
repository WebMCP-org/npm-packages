# Contributing to WebMCP Setup Skill

Thank you for your interest in contributing to the WebMCP Setup skill! This document provides guidelines for contributing to the skill.

## How to Contribute

### Reporting Issues

If you encounter bugs or have feature requests:

1. Check [existing issues](https://github.com/WebMCP-org/npm-packages/issues) first
2. Create a new issue with:
   - Clear description of the problem/request
   - Steps to reproduce (for bugs)
   - Framework and environment details
   - Expected vs actual behavior

### Suggesting Improvements

We welcome suggestions for:
- New framework support
- Additional tool patterns
- Documentation improvements
- Better error messages
- Setup optimizations

Open an issue labeled "enhancement" with your suggestion.

### Adding Framework Support

To add support for a new framework:

1. **Create reference documentation**
   - Add `references/FRAMEWORK_SETUP.md`
   - Follow the pattern in `REACT_SETUP.md`
   - Include installation, setup, and examples

2. **Update SKILL.md**
   - Add framework to framework detection logic
   - Add entry to "Supported Frameworks" list
   - Add Quick Reference entry if needed

3. **Create template (optional)**
   - Add `assets/templates/framework-demo.ext`
   - Include working example with tools
   - Follow style of existing templates

4. **Test thoroughly**
   - Create a real project with the framework
   - Run through the setup process
   - Verify tools work with Chrome DevTools MCP

5. **Update CHANGELOG.md**
   - Add entry under "Added" section
   - Document new framework support

### Improving Documentation

Documentation improvements are always welcome:

- Fix typos or unclear wording
- Add missing examples
- Improve code samples
- Add troubleshooting tips
- Clarify confusing sections

### Code Style

- Use clear, descriptive names
- Add comments for complex logic
- Follow existing patterns
- Keep functions focused and small
- Use TypeScript types where applicable

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(react): add React 19 support
docs(troubleshooting): add CORS error solutions
fix(verification): handle missing package.json
```

## Development Workflow

### Local Testing

1. **Symlink the skill**
   ```bash
   ln -s $(pwd)/skills/webmcp-setup ~/.claude/skills/webmcp-setup
   ```

2. **Restart Claude Code**
   ```
   /restart
   ```

3. **Test the skill**
   ```
   "Set up WebMCP in my app"
   ```

### Testing Changes

1. **Create a test project**
   ```bash
   # For React
   pnpm create vite test-react --template react-ts
   cd test-react

   # For Vue
   pnpm create vite test-vue --template vue-ts
   cd test-vue
   ```

2. **Run the skill**
   - Ask Claude Code to set up WebMCP
   - Verify packages are installed
   - Check that tools work
   - Test with Chrome DevTools MCP

3. **Document any issues**
   - Note what worked and what didn't
   - Capture error messages
   - Suggest improvements

## Pull Request Process

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/npm-packages.git
   cd npm-packages
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feat/add-angular-support
   ```

3. **Make your changes**
   - Follow the guidelines above
   - Test thoroughly
   - Update documentation

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat(angular): add Angular setup guide"
   ```

5. **Push and create PR**
   ```bash
   git push origin feat/add-angular-support
   ```
   - Open PR on GitHub
   - Fill out PR template
   - Link any related issues

6. **Address review feedback**
   - Make requested changes
   - Push updates
   - Respond to comments

## Review Criteria

PRs will be reviewed for:

- **Correctness**: Does it work as intended?
- **Completeness**: Is documentation included?
- **Code quality**: Is it well-written and maintainable?
- **Testing**: Has it been tested thoroughly?
- **Compatibility**: Does it work across environments?

## Getting Help

If you need help:

- Ask in the PR/issue
- Check existing documentation
- Review similar implementations
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- CHANGELOG.md (for significant changes)
- GitHub contributors page
- Release notes

Thank you for contributing! 🎉
