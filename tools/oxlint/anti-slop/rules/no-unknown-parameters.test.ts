import { RuleTester } from "oxlint/plugins-dev";

import { noUnknownParametersRule } from "./no-unknown-parameters.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "unknownParameter" };

tester.run("anti-slop/no-unknown-parameters", noUnknownParametersRule, {
  valid: [
    "function report(cause: unknown, message: string) {}",
    "function isUser(value: unknown): value is User { return true; }",
    "function parseUser(input: unknown): User { return user; }",
    "const toError = (value: unknown): Error => new Error(String(value));",
    "class Store { readValue(input: unknown): Value { return value; } }",
  ],
  invalid: [
    { code: "function load(input: unknown) {}", errors: [error] },
    { code: "function parseUser(input: unknown) { return user; }", errors: [error] },
    { code: "function parseUser(input: unknown): unknown { return input; }", errors: [error] },
    { code: "function tokenize(input: unknown): Token[] { return tokens; }", errors: [error] },
    { code: "class Store { save(value: unknown) {} }", errors: [error] },
    { code: "type Handler = (event: unknown) => void;", errors: [error] },
  ],
});
