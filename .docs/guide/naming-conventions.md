# Naming Conventions

Source: `.docs/decisions/history/KNOWLEDGE_03.md` §5.1. Applied to all runtime identifiers in this project.

## Required prefixes

| Kind | Prefix | Example |
|---|---|---|
| Exported/runtime functions | `f_` | `f_getAvailableModels()` |
| Helper functions | `fh_` | `fh_normalizeModelId()` |
| Globals (shared mutable state; rare — prefer DI) | `g_` | `g_refreshPromise` |
| Constants (not runtime-obtained config) | `k_` | `k_priceScale` |
| Function parameters | `p_` | `p_modelId` |
| Local variables | `vl_` | `vl_models` |
| Other runtime variables | `v_` | `v_result` |

## Style rules

- **Types / interfaces:** PascalCase (`ModelRecord`) — type declarations are exempt from runtime prefixes.
- **String unions / enum-like members:** descriptive names (`"llbmCoding"`, `"family_fallback"`).
- **Files:** kebab-case (`model-matching.ts`).
- Prefix **every** function by role, including callbacks and class methods.
- Prefix parameters even in short callbacks (`(p_a, p_b) => …`).
- `k_` only for compile-time constants; runtime configuration keeps descriptive host names.
- Explicit return types on exported functions and complex helpers.
- No `any`; use `unknown` at external-data boundaries and validate.
- Prefer named exports; **no default exports** except where the loader requires one (see exceptions).

## Imposed exceptions (documented, lint-recognized)

1. **Plugin entry points:** OpenCode requires `export default Plugin.define({...})` — the default export in
   `src/index.ts` / `src/tui.tsx` is exempt.
2. **Solid/JSX components:** JSX resolves components by PascalCase (`<Status />`); Solid component functions
   (e.g. in `src/ui/*.tsx`) are PascalCase, per the official OpenCode CLI-plugin examples.
3. **Framework object properties:** keys of API objects passed to OpenCode/OpenTUI (`id`, `setup`, `append`,
   `render`, `palette`, `slash`, …) keep the framework's names.
4. **Third-party imports:** keep upstream names; wrap in prefixed locals when used as values.
5. **Intentionally unused identifiers:** prefix with `_` (lint ignores); unused parameters may instead use `p_`.

## Lint enforcement (eslint.config.js, "where practical" per spec §13)

- `f_` / `fh_` / PascalCase enforced by `no-restricted-syntax` for **module-scope** function declarations and
  function-valued `const` bindings.
- `@typescript-eslint/no-unused-vars` ignores `p_` arguments and `_`-prefixed names.
- Remaining prefixes (`k_`, `vl_`, `v_`, `g_`) are convention-enforced via review; the rules above catch the
  highest-churn categories mechanically.
