# Testing GitHub Actions Locally with Act

This guide explains how to test GitHub Actions workflows locally using [act](https://github.com/nektos/act), which simulates GitHub Actions in your local Docker environment.

## Prerequisites

1. **Docker Desktop** must be installed and running
2. **act** must be installed:
   ```bash
   # macOS with Homebrew
   brew install act
   
   # Or check installation guide at https://github.com/nektos/act
   ```

## Setup

### 1. Create Secrets File

Create a `.secrets` file in the project root with your tokens:

```bash
GITHUB_TOKEN=ghp_YOUR_GITHUB_TOKEN_HERE
PAT_TOKEN=ghp_YOUR_PERSONAL_ACCESS_TOKEN_HERE
NPM_TOKEN=npm_YOUR_NPM_TOKEN_HERE
```

**Important:** Never commit the `.secrets` file. It's already in `.gitignore`.

#### Getting Tokens

- **GitHub Token (GITHUB_TOKEN)**: 
  1. Go to https://github.com/settings/tokens/new
  2. Select scopes: `repo`, `workflow`, `write:packages`
  3. Generate and copy the token

- **Personal Access Token (PAT_TOKEN)**: 
  1. Go to https://github.com/settings/tokens/new
  2. Select scopes: `repo`, `workflow`, `write:packages`, `pull_request`
  3. Generate and copy the token
  4. Add this token as a repository secret named `PAT_TOKEN` in Settings → Secrets and variables → Actions

- **NPM Token**:
  1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
  2. Click "Generate New Token" → Choose "Automation" type
  3. Copy the token

### 2. Create Act Configuration

The repository includes an `.actrc` configuration file:

```
-P ubuntu-latest=catthehacker/ubuntu:act-latest
--secret-file .secrets
--env CI=true
```

This configuration:
- Uses an optimized Ubuntu image for act
- Loads secrets from `.secrets` file
- Sets CI environment variable

## Running Workflows

### Test NPM Publish (Dry Run)

We have a special test workflow for safely testing publishing:

```bash
# Run the test publish workflow (includes --dry-run flag)
act push -W .github/workflows/test-publish.yml --container-architecture linux/amd64
```

This workflow:
- Builds all packages
- Runs `pnpm publish` with `--dry-run` and `--no-git-checks`
- Validates package configuration without actually publishing

### Test Main Changesets Workflow

```bash
# Run the changesets/publish workflow
act push -W .github/workflows/changesets.yml --container-architecture linux/amd64
```

**Note:** This will fail on uncommitted changes (by design).

### Test CI Workflow

```bash
# Run all CI jobs (lint, typecheck, build)
act push -W .github/workflows/ci.yml --container-architecture linux/amd64
```

### Dry Run Mode

To see what would run without executing:

```bash
act push -W .github/workflows/ci.yml -n
```

## Known Issues

### 1. Apple Silicon (M1/M2/M3)

On Apple Silicon Macs, always use the `--container-architecture linux/amd64` flag:

```bash
act push --container-architecture linux/amd64
```

### 2. pnpm Version Mismatch

Ensure the pnpm version in `package.json`'s `packageManager` field matches the version specified in GitHub Actions workflows. If they don't match, you'll see:
```
Error: Multiple versions of pnpm specified
```

Fix by updating `packageManager` in `package.json` to match the workflow version.

### 3. Git Authentication

If you see authentication errors when act tries to clone action repositories:
```
authentication required: Invalid username or token
```

Ensure your GitHub token in `.secrets` has the correct permissions.

### 4. Uncommitted Changes

The changesets workflow will fail with uncommitted changes:
```
ERR_PNPM_GIT_UNCLEAN  Unclean working tree. Commit or stash changes first.
```

This is expected behavior. Use the `test-publish.yml` workflow for testing with uncommitted changes.

## Debugging Tips

### Verbose Output

Add `-v` flag for verbose output:
```bash
act push -v
```

### Shell Access

Get a shell in the container:
```bash
act push -W .github/workflows/ci.yml --container-architecture linux/amd64 -s
```

### List Available Events

See what events can be triggered:
```bash
act -l
```

### Use Different Events

```bash
# Simulate pull request
act pull_request

# Simulate push to main
act push --eventpath event.json
```

## Best Practices

1. **Always test locally first** before pushing workflow changes
2. **Use dry-run workflows** for testing publish scenarios
3. **Keep secrets file updated** but never commit it
4. **Test on same architecture** as GitHub Actions (linux/amd64)
5. **Create test workflows** for complex scenarios that need modification

## Creating Test Workflows

For workflows that need special handling in local testing, create test versions:

```yaml
# .github/workflows/test-publish.yml
name: Test Publish

on:
  push:
    branches:
      - main

jobs:
  test-publish:
    runs-on: ubuntu-latest
    steps:
      # ... setup steps ...
      
      - name: Test publish (dry-run)
        run: |
          echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" >> ~/.npmrc
          pnpm publish -r --access public --dry-run --no-git-checks
```

## Troubleshooting

If Docker isn't running:
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

If act isn't installed:
```bash
# Verify installation
which act

# Install if missing
brew install act
```

## Additional Resources

- [act Documentation](https://github.com/nektos/act)
- [act Docker Images](https://github.com/catthehacker/docker_images)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)