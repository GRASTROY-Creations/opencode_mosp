# D-0025 — Single `.docs/` documentation root

- **Date:** 2026-10-26 · **Status:** active · **Decided by:** owner ("Single .docs/")
- **Requirement:** Agents rule 11 places all documentation in `/.docs` with the
  sections `examples/`, `decisions/`, `guide/`, `test/`, `goals/`. Coding
  Standard rule 11 places architecture documents in `/docs`. The two rules
  conflict.

## Decision

One root, `.docs/`. Architecture documents live in
[`.docs/guide/architecture/`](../guide/architecture/README.md) with their own
table of contents, which satisfies both rules' intent (single knowledge base,
linked architecture TOC).

## Consequences

- The former `docs/` tree was moved verbatim; nothing was deleted. Old → new
  paths: [CHANGELOG](../CHANGELOG.md).
- Code comments and ESLint messages reference `.docs/…` paths
  (`eslint.config.js`, `src/**/*.ts`).
- `README.md` at the repository root remains as the package entry point and
  links to [`.docs/README.md`](../README.md).
- Root `AGENTS.md` is agent configuration (not documentation); it only points
  agents at [guide/agents.md](../guide/agents.md).

## Alternatives considered

- Keep `docs/` as a frozen archive and start `.docs/` fresh — rejected: two
  roots, split knowledge.
- Architecture in `docs/`, everything else in `.docs/` — rejected: literal
  compliance with both rules at the cost of a split knowledge base.
