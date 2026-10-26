# Tests — strategy and reasoning

`bun run check` runs typecheck, lint, format check and `bun test`
(`tests/unit/*.test.ts`, 161 tests on 2026-10-26). Tests never touch the
network: adapters run against trimmed live fixtures ([fixtures.md](fixtures.md)),
services against in-memory caches and injected loaders.

Live checks are separate and network-bound: `bun run validate:mappings`
(mapping drift), `bun run generate:mappings` (mapping review table).

| Suite | Proves | Goal |
|---|---|---|
| `domain.test.ts` | Validators reject malformed records; `null` ≠ `0`; benchmark ids/sort vocabulary; legacy `rank` dropped | G2 no fabrication |
| `fetch-json.test.ts` | Timeout, retry on transient errors only, `Retry-After`, sanitized errors | G3 failure isolation, security |
| `opencode-models-adapter.test.ts` | Registry payload parsing, disabled models filtered, no secret fields read | G1 |
| `llbm-adapter.test.ts` | Both metrics parsed in one pass, unit normalization, dedup keeps max, fails only when no metric scored | G2 |
| `models-dev-adapter.test.ts` | Crosswalk filtering and validation | data-source goals |
| `model-matching.test.ts` | Matching order, ambiguity ⇒ unmatched, reviewed mappings, casefold rules, sharing, merge without overwrite, both metrics per model | G2 trustworthy attachment |
| `ranking.test.ts` | Numeric/name sorting, missing last both directions, independent Coding/Intel sorting, no mutation | G4 |
| `model-filter.test.ts` | Provider/presence/free filters | G4 |
| `cache.test.ts` | Envelope validation, TTL freshness, atomic file writes | G3 |
| `mosp.test.ts` | Cache-only reads, refresh with failure isolation, last-known-good, host-first catalog, both metrics attach | G1, G3 |
| `panel-controller.test.ts` | Command parsing, sort transitions, row derivation, table/status/sidebar text, update label, empty-state hint | G4 |

Not automated: rendering inside the OpenCode host (painting model, clicks) —
manual checklist in
[guide/architecture/ui-integration.md](../guide/architecture/ui-integration.md).
