import { RuleTester } from "oxlint/plugins-dev";

import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "chained" };

tester.run("anti-slop/no-chained-type-assertions", noChainedTypeAssertionsRule, {
  valid: [
    "const user = input as User;",
    "const values = [1, 2] as const as const;",
    "const name = (input as User).name as string;",
  ],
  invalid: [
    { name: "as chain", code: "const user = input as unknown as User;", errors: [error] },
    { name: "angle-bracket chain", code: "const user = <User>(<unknown>input);", errors: [error] },
    { name: "parenthesized chain", code: "const user = ((input as unknown)) as User;", errors: [error] },
    { name: "const then cast", code: "const user = input as const as User;", errors: [error] },
  ],
});
