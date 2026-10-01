import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function unwrapParenthesized(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

function isTypeNameLiteral(expression: ESTree.Expression | ESTree.PrivateIdentifier): boolean {
	if (expression.type === "PrivateIdentifier") return false;
	const unwrapped = unwrapParenthesized(expression);
	return unwrapped.type === "Literal" && typeof unwrapped.value === "string";
}

function isTypeofComparison(node: ESTree.UnaryExpression): boolean {
	let current: ESTree.Expression = node;
	let parent = node.parent;
	while (parent.type === "ParenthesizedExpression" && parent.expression === current) {
		current = parent;
		parent = parent.parent;
	}
	if (parent.type !== "BinaryExpression" || !["==", "!=", "===", "!=="].includes(parent.operator)) {
		return false;
	}
	return (
		(parent.left === current && isTypeNameLiteral(parent.right)) ||
		(parent.right === current && isTypeNameLiteral(parent.left))
	);
}

function isSwitchDiscriminant(node: ESTree.UnaryExpression): boolean {
	let current: ESTree.Expression = node;
	let parent = node.parent;
	while (parent.type === "ParenthesizedExpression" && parent.expression === current) {
		current = parent;
		parent = parent.parent;
	}
	return parent.type === "SwitchStatement" && parent.discriminant === current;
}

/** Disallow stored `typeof` results while allowing checks that narrow a value. */
export const noRuntimeTypeofRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow using `typeof` as a value; allow comparisons and switch cases that narrow the value.",
		},
		messages: {
			runtimeTypeof:
				"Avoid storing a `typeof` result. Compare it directly with a type name or switch on it to narrow the value.",
		},
	},
	createOnce(context) {
		return {
			UnaryExpression(node) {
				if (
					node.operator !== "typeof" ||
					isTypeofComparison(node) ||
					isSwitchDiscriminant(node)
				) {
					return;
				}
				context.report({ node, messageId: "runtimeTypeof" });
			},
		};
	},
});
