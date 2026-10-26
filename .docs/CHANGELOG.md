# `.docs/` changelog

Newest entries first. Each entry: date · decision/adjustment · what changed.
Entries are never edited after the fact; corrections are new entries.

## 2026-10-26 — Adjustment 24: knowledge base created (D-0025 … D-0031)

Owner applied the GRASTROY Creations standards (General, Agents, Coding
Standard, Licenses, Security). The former `docs/` tree was moved **verbatim**
into `.docs/` (plain file moves; no content removed) and the old directory was
removed once empty.

### Path migration (old → new)

| Former path | New path |
|---|---|
| `docs/KNOWLEDGE_01.md` … `docs/KNOWLEDGE_09.md` | `.docs/decisions/history/KNOWLEDGE_01.md` … `KNOWLEDGE_09.md` |
| `docs/PLAN.md` | `.docs/decisions/history/PLAN.md` |
| `docs/llmbm-migration-plan.md` | `.docs/decisions/history/llmbm-migration-plan.md` |
| `docs/api/llmbenchmark.md` | `.docs/guide/sources/llmbenchmark.md` |
| `docs/api/models-dev.md` | `.docs/guide/sources/models-dev.md` |
| `docs/api/opencode-models.md` | `.docs/guide/sources/opencode-models.md` |
| `docs/api/opencode-pricing.md` | `.docs/guide/sources/opencode-pricing.md` |
| `docs/architecture/caching.md` | `.docs/guide/architecture/caching.md` |
| `docs/architecture/data-flow.md` | `.docs/guide/architecture/data-flow.md` |
| `docs/architecture/ui-integration.md` | `.docs/guide/architecture/ui-integration.md` |
| `docs/development.md` | `.docs/guide/development.md` |
| `docs/naming-conventions.md` | `.docs/guide/naming-conventions.md` |
| `tests/fixtures/README.md` | `.docs/test/fixtures.md` (a one-line pointer stays in `tests/fixtures/README.md`) |

### Edits made during the move

- In the moved **guide** and **test** files, references to the old `docs/…`
  paths were rewritten to the new `.docs/…` paths (path text only; no
  statements changed). The same rewrite was applied to code comments, the
  ESLint naming-rule messages, `README.md`, and `bunfig.toml`.
- Files in `decisions/history/` were **not** edited: their internal `docs/…`
  references describe the layout at the time they were written; use the table
  above to resolve them.
- `guide/development.md`: the gate list and CI snippet gained
  `bun run format:check` ("all three gates" → "all four gates", D-0031).
- `test/fixtures.md`: content unchanged apart from path rewrites.
- `decisions/history/PLAN.md` is frozen at Adjustment 23. Later decisions are
  recorded as individual files in [decisions/](decisions/README.md).

### New documents

- Root index [README.md](README.md) and this changelog.
- [goals/](goals/README.md): product, platforms, data sources.
- [guide/](guide/README.md): agents, coding standard, versioning, licenses,
  architecture index + MVC mapping, sources index.
- [decisions/](decisions/README.md): index D-0001 … D-0024 (pointing at the
  matching history sections) and new records D-0025 … D-0031.
- [test/README.md](test/README.md), [examples/](examples/README.md).
