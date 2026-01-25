# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it responsibly.

**Please do NOT create public GitHub issues for security vulnerabilities.**

### How to Report

1. **GitHub Security Advisories (Preferred)**: Use [GitHub's private vulnerability reporting](https://github.com/WebMCP-org/npm-packages/security/advisories/new) to report the issue confidentially.

2. **Email**: If you prefer email, contact the maintainers directly through their GitHub profiles.

### What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability
- Steps to reproduce the issue
- Affected versions
- Any potential mitigations you've identified
- Your assessment of the severity (Critical/High/Medium/Low)

### Response Timeline

- **Initial Response**: Within 48 hours of report submission
- **Status Update**: Within 7 days with an assessment
- **Resolution Target**: Within 90 days for most vulnerabilities

### Disclosure Policy

- We follow [coordinated vulnerability disclosure](https://github.com/ossf/oss-vulnerability-guide/blob/main/maintainer-guide.md)
- We will acknowledge your contribution in the security advisory (unless you prefer to remain anonymous)
- We request that you do not publicly disclose the vulnerability until we have had a chance to address it

## Security Measures

This project implements several security measures:

- **Dependency Updates**: Automated dependency updates via Dependabot and Renovate
- **Static Analysis**: CodeQL security scanning on all PRs and commits
- **Vulnerability Scanning**: Regular `pnpm audit` checks in CI
- **Pinned Dependencies**: GitHub Actions are pinned to commit SHAs
- **Least Privilege**: Workflow tokens use minimal required permissions
- **OpenSSF Scorecard**: Regular security posture assessment

## Security Best Practices for Contributors

When contributing to this project:

1. Never commit secrets, API keys, or credentials
2. Keep dependencies up to date
3. Follow secure coding practices
4. Report any security concerns promptly
