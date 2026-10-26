# Coding standard

Adopted 2026-10-26 (Adjustment 24). Each rule lists how this codebase meets it.

| # | Rule | How it is met |
|---|---|---|
| 10 | All code is supported by comments, especially non-trivial parts | Every module starts with a header comment stating responsibility and invariants; complex paths (matching order, painting/remount model, cache freshness, press-and-release) carry inline rationale. Naming: [naming-conventions.md](naming-conventions.md). |
| 11 | Architecture preference VIPER > MVC > ECS, documented with a linked TOC | MVC: [architecture/mvc.md](architecture/mvc.md), decision [D-0026](../decisions/D-0026-architecture-mvc.md). |
| 12 | Secure language subset, restricted language policy, secure code, strict mode | ESLint bans `eval`/implied eval/`new Function`/`javascript:` URLs, loose equality, parameter reassignment, non-null assertions, `any`; external data enters as `unknown` and is validated (`src/domain/guards.ts`); network errors never include URLs, headers or payloads (`src/utils/fetch-json.ts`); strict `tsconfig.json`. [D-0031](../decisions/D-0031-lint-format-policy.md). |
| 13 | Linting and formatting tools | `bun run lint` (ESLint 10 + typescript-eslint type-checked), `bun run format` / `format:check` (Prettier). `bun run check` = typecheck + lint + format:check + tests. |
| 14 | Explicit type annotations; strict type checking | Explicit return types enforced by lint on every named function and module boundary; annotations required at trust boundaries and for collection initializers; inference allowed for initialized locals ([D-0031](../decisions/D-0031-lint-format-policy.md)). `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. |
| 15 | Debug: fast build/start; release: minimal size, fast runtime; ship only needed modules | Source-loaded plugin, no build step ([D-0027](../decisions/D-0027-no-build-targets.md)); only entry-point-reachable modules load; UI libraries are host-provided peers. |

## Workflow

1. Read [agents.md](agents.md).
2. Change code; keep comments in step.
3. `bun run format`, then `bun run check` must be green.
4. Record a decision in [decisions/](../decisions/README.md) for any
   behavioural or structural change, log `.docs` edits in
   [CHANGELOG.md](../CHANGELOG.md), set the version
   ([versioning.md](versioning.md)).
5. The owner commits.
