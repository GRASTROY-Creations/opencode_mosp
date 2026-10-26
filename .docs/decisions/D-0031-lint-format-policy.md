# D-0031 — Formatter, secure-subset lint rules, type-annotation policy

- **Date:** 2026-10-26 · **Status:** active
- **Requirement:** Coding Standard 12 (secure language subset, restricted
  language policy, secure code, strict mode), 13 (linting + formatting tools),
  14 (explicit type annotations, strict checking).

## Decision

1. **Formatter:** Prettier (MIT, pinned) with `.prettierrc.json` matching the
   existing style; `bun run format` / `format:check`; `bun run check` includes
   `format:check`. `eslint-config-prettier` disables stylistic ESLint rules
   that would fight the formatter.
2. **Restricted language subset** (`eslint.config.js`, all `error`):
   `no-eval`, `@typescript-eslint/no-implied-eval`, `no-new-func`,
   `no-script-url`, `eqeqeq`, `no-param-reassign`,
   `@typescript-eslint/no-non-null-assertion`, plus the existing
   `no-explicit-any`, `no-floating-promises`, naming-prefix rules.
3. **Explicit types:** `@typescript-eslint/explicit-function-return-type`
   (callbacks passed inline and typed function expressions exempt) and
   `explicit-module-boundary-types`. Variables: an explicit annotation is
   required where a value crosses a trust boundary (`unknown` from JSON, host
   data) and for empty/collection initializers; initialized locals may rely on
   inference — annotating every `const vl_x = f_y()` adds noise without type
   safety (the compiler already fixes the type).
4. **Strict mode:** `tsconfig.json` keeps `strict` plus
   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
   `noImplicitReturns`, `noFallthroughCasesInSwitch`,
   `noImplicitOverride`; `noImplicitAny` and `useUnknownInCatchVariables`
   are listed explicitly for documentation.

Details per rule: [guide/coding-standard.md](../guide/coding-standard.md).
