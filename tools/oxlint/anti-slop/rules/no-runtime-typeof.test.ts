import { RuleTester } from "oxlint/plugins-dev";

import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "runtimeTypeof" };

tester.run("anti-slop/no-runtime-typeof", noRuntimeTypeofRule, {
	valid: [
		"const value = input;",
		'if (typeof input === "string") use(input);',
		'if ("string" !== (typeof input)) use(input);',
		'function isString(value: unknown): value is string { return typeof value === "string"; }',
		'switch (typeof input) { case "string": use(input); }',
	],
	invalid: [
		{ code: "const kind = typeof input;", errors: [error] },
		{ code: "use(typeof input);", errors: [error] },
		{ code: "if (typeof input === kind) use(input);", errors: [error] },
		{ code: 'if (typeof input < "string") use(input);', errors: [error] },
	],
});
