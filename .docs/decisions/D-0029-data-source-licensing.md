# D-0029 — Benchmark data has no published commercial terms (open risk)

- **Date:** 2026-10-26 · **Status:** **open — owner action required**
- **Requirement:** Licenses rule 7 — external libraries *or content* may only
  be used under licenses that allow commercial use.

## Findings (read-only checks, 2026-10-26)

| Source | Used for | Terms found |
|---|---|---|
| LLMBenchmark.ai `/v1/export` | Coding / Intel scores (`src/providers/llbm.ts`) | None. `GET /openapi.json` `info` has no `license` or `termsOfService`; `https://llmbenchmark.ai/terms` → 404. |
| Artificial Analysis (origin of `aa_coding_index`, `aa_intelligence_index`) | upstream of the scores | `https://artificialanalysis.ai/terms` → 404; no terms located. |
| models.dev `api.json` | cached crosswalk (`src/providers/models-dev.ts`) | Repository `sst/models.dev` is MIT. |
| OpenCode model registry | catalog, prices | Local host data via `@opencode/plugin` (MIT). |

A similar aggregator (benchlm.ai) licenses its data CC BY-NC 4.0, so
non-commercial-only terms for benchmark aggregations are plausible; this is
**not** evidence about LLMBenchmark.ai, only a reason to verify.

## Decision

Keep the integration (it fetches at runtime on the user's machine and stores
nothing in the repository except the trimmed test fixture
`tests/fixtures/llbm-export.sample.json`). Before any commercial
distribution the owner must obtain written terms from LLMBenchmark.ai and, if
required, Artificial Analysis.

## If terms turn out to be non-commercial

Alternatives, in order of effort: show only the source link and let the user
fetch; replace the source with one under a commercial-friendly license; ship
without benchmark columns (the rest of the table is unaffected —
benchmark loading is isolated, see `.docs/guide/architecture/data-flow.md`).
