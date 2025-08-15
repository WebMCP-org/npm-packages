export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-enum": [
			2,
			"always",
			[
				// Packages
				"transports",
				"web-tools",
				"extension-tools",
				"mcp-react-hooks",
				"mcp-react-hook-form",
				"global",

				// Repository-wide scopes
				"root",
				"deps",
				"release",
				"ci",
				"docs",
				"*", // Allow any scope for flexibility
			],
		],
		"scope-case": [2, "always", "kebab-case"],
		"subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
	},
	prompt: {
		settings: {
			enableMultipleScopes: true,
			scopeEnumSeparator: ",",
		},
		messages: {
			skip: "(press enter to skip)",
			max: "(max %d chars)",
			min: "(min %d chars)",
			emptyWarning: "(%s is required)",
			upperLimitWarning: "%s is %d chars longer than the limit",
			lowerLimitWarning: "%s is %d chars less than the limit",
		},
		questions: {
			type: {
				description: "Select the type of change that you're committing:",
				enum: {
					feat: {
						description: "A new feature",
						title: "Features",
						emoji: "✨",
					},
					fix: {
						description: "A bug fix",
						title: "Bug Fixes",
						emoji: "🐛",
					},
					docs: {
						description: "Documentation only changes",
						title: "Documentation",
						emoji: "📚",
					},
					style: {
						description: "Changes that do not affect the meaning of the code",
						title: "Styles",
						emoji: "💎",
					},
					refactor: {
						description:
							"A code change that neither fixes a bug nor adds a feature",
						title: "Code Refactoring",
						emoji: "📦",
					},
					perf: {
						description: "A code change that improves performance",
						title: "Performance Improvements",
						emoji: "🚀",
					},
					test: {
						description: "Adding missing tests or correcting existing tests",
						title: "Tests",
						emoji: "🚨",
					},
					build: {
						description:
							"Changes that affect the build system or external dependencies",
						title: "Builds",
						emoji: "🛠",
					},
					ci: {
						description: "Changes to our CI configuration files and scripts",
						title: "Continuous Integrations",
						emoji: "⚙️",
					},
					chore: {
						description: "Other changes that don't modify src or test files",
						title: "Chores",
						emoji: "♻️",
					},
					revert: {
						description: "Reverts a previous commit",
						title: "Reverts",
						emoji: "🗑",
					},
				},
			},
			scope: {
				description:
					"What is the scope of this change (e.g. transports, web-tools, mcp-react-hooks)?",
			},
			subject: {
				description:
					"Write a short, imperative tense description of the change",
			},
			body: {
				description: "Provide a longer description of the change",
			},
			isBreaking: {
				description: "Are there any breaking changes?",
			},
			breakingBody: {
				description:
					"A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself",
			},
			breaking: {
				description: "Describe the breaking changes",
			},
			isIssueAffected: {
				description: "Does this change affect any open issues?",
			},
			issuesBody: {
				description:
					"If issues are closed, the commit requires a body. Please enter a longer description of the commit itself",
			},
			issues: {
				description: 'Add issue references (e.g. "fix #123", "re #123".)',
			},
		},
	},
};
