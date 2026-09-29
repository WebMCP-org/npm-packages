# anti-slop Oxlint rules

Vendored from the `src/` directory of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit [`6d538555cb151d4121ed51a27db81890eacf8ae9`](https://github.com/dmmulroy/anti-slop/tree/6d538555cb151d4121ed51a27db81890eacf8ae9/src). MIT licensed, copyright (c) 2026 Dillon Mulroy; see [LICENSE](./LICENSE).

Not vendored: `effect/` and the `no-conditional-empty-object-spread` and `no-shape-in-symbol-names` rules. Source and test files not listed below match upstream byte for byte.

## Local changes

- `index.ts`: drops the `no-conditional-empty-object-spread` and `no-shape-in-symbol-names` registrations.
- `rules/no-runtime-typeof.ts`: reports `typeof` only when its result is used as a value; comparisons with a type-name string and `switch` discriminants pass. The `allowInTypeGuards` option is gone.
- `rules/no-runtime-typeof.test.ts`: rewritten for the local behavior.
- `rules/no-unknown-parameters.ts`: also exempts type guards and functions named `parse*`, `decode*`, `normalize*`, `validate*`, `read*`, `coerce*`, `serialize*`, or `to*` that declare a concrete return type.
- `rules/require-safety-comment-for-type-assertion.ts`: accepts a `SAFETY:` comment above `export const`.
- `rules/require-safety-comment-for-type-assertion.test.ts`: adds the `export const` cases.
- `shared/lexical-type-parameters.ts`: disables three of these rules on the one line that fails this repo's lint config.
