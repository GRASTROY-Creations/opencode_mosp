# LLMBM (LLMBenchmark.ai)

**Status: VERIFIED (2026-10-26).** Single benchmark source (replaced the former
HF GPQA + LiveCodeBench pair in Adjustments 19/20). Since Adjustment 22 two of
its metrics are shown side by side; no ranks are derived.

## Endpoints

- `GET https://api.llmbenchmark.ai/v1/export` — **the source the plugin uses**.
  No authentication; ~8.3 MB JSON: `{ dataset: { models[378], scores, sources,
  generatedAt }, … }` (observed 2026-10-26).
- `GET https://api.llmbenchmark.ai/v1/scores?metric=<m>` — **dead path**:
  without `metric` it returns HTTP 422; with any tried metric (`coding`,
  `intelligence`, `overall`, `agentic`) it returns HTTP 200 with an empty list.
  Do not use it.
- Other listed endpoints (`/openapi.json`): `/health`, `/v1/sources`,
  `/v1/models`. `/v1/models` entries carry `id`, `slug`, `name`, `provider`,
  `contextLength`, `pricing`, `releasedAt`, `huggingFaceId`, `profile` — not
  consumed (the OpenCode registry stays authoritative for catalog metadata).

## Score row shape (verified)

```jsonc
{
  "modelId": "openai/gpt-5",        // provider-scoped source identifier
  "source": "artificialanalysis",   // evaluation harness name
  "metric": "aa_coding_index",      // metric key — filter on this
  "value": 74.9,                    // number in `unit`
  "unit": "points",                 // points | ratio | usd | tokens | elo | votes | seconds …
  "observedAt": "2026-10-26",       // YYYY-MM-DD
  "sourceUrl": "https://artificialanalysis.ai/models",
  "setting": "High"                 // optional free-form run setting; duplicates per model possible
}
```

## Metrics used (Adjustment 22)

| Column | Benchmark id | Export metric | Scored models (2026-10-26) |
|---|---|---|---|
| `Coding` | `llbmCoding` | `aa_coding_index` | 114 |
| `Intel` | `llbmIntelligence` | `aa_intelligence_index` | 215 |

Both are Artificial Analysis indexes on the same 0–100 `points` scale. The
mapping is fixed in `k_llbmMetricByBenchmark` (`src/domain/model-benchmark.ts`);
the former `OPENCODE_LLM_BENCH_METRIC` override was removed.

Normalization in `f_parseLlbmExport` (one pass over the export for both
metrics):

- `points` → score as-is (must be 0–100, else `score-out-of-range` warning and
  skip); `ratio` → `value × 100` rounded to 2 decimals; **all other units are
  skipped** with an `unsupported-unit` warning.
- Rows are stored as `ModelBenchmark` with `benchmarkId` per metric,
  `variant: "llbm-<metric>"`, `scoreUnit: "percent"`. There is **no rank
  field**: the UI shows the reported value only.
- Duplicate rows for one model and metric (different `source`/`setting`) keep
  the **highest** score, with a `duplicate-score-row` warning.
- Malformed rows (missing/non-string model id, non-number value) are skipped
  with `malformed-score-row` warnings.
- One empty metric is normal (its column shows `—`); only a payload with zero
  usable rows in **both** metrics fails the source (`LLMBM returned no score
  rows for any supported metric`), and the last-known-good cache entry
  survives.

## Fetch and cache

- `f_fetchLlbmBenchmarks(options)` uses the shared `f_fetchJsonWithRetry`
  policy with a 30 s timeout floor (payload is multi-MB), bounded retries with
  backoff for network/408/425/429/5xx, and host-only error messages.
- Rows for both metrics share one `llbm` cache envelope with the benchmark TTL
  (default 6 hours); the adapter has **no private cache**. Cache schema
  version 2 (Adjustment 22) discards older rank-bearing entries. See
  `.docs/guide/architecture/caching.md`.
- Fetched only through `/mosp update`; panel mounts read the cache only.

## Model mapping (`src/config/llbm-mappings.ts`)

The catalog uses anonymized/rebranded IDs (`opencode/beam-free`, …), so LLMBM
rows attach through reviewed mappings keyed on the exact LLMBM `modelId`. One
mapping entry serves both columns.

State 2026-10-26 (`bun run validate:mappings`): **82 entries, 80 with a
source id — 74 PASS** (coding 47, intelligence 74; every coding-scored entry
is also intelligence-scored), **6 PENDING**, **0 DRIFT**.

| Catalog model | Status |
|---|---|
| `beam-free` | PENDING → `reflection/beam-1.0-501b-a23b` (`family_fallback`, owner-approved 2026-10-26) |
| `gpt-5.4-pro`, `gpt-5.5-pro`, `muse-wonder-1.0`, `qwen3.5-plus`, `qwen3.8-flash` | PENDING — in `dataset.models`, no AA metric yet |
| `big-pickle`, `flint-40b-free` | `null` — no candidate in the dataset |

PENDING entries attach automatically once LLMBM scores them.

- Generation policy (`bun run generate:mappings`, owner-approved), matching
  against the union of both metrics' scored ids, then `dataset.models`:
  1. tail after the last `/` of the LLMBM id equals the catalog `modelId`
     (case-folded) → `matchType: "exact"`;
  2. **dot equivalence**: a dash replaced by a dot at one version boundary
     (`claude-opus-4-8` → `anthropic/claude-opus-4.8`), resolving to exactly
     one live id → `exact`; ambiguous dot forms are never guessed;
  3. catalog id ends `-free` and the stem resolves by either rule →
     `family_fallback`;
  4. reviewed sibling proxies (e.g. `gpt-5-codex` → `openai/gpt-5`,
     `qwen3.8-max` → `qwen/qwen3.8-max-0902`, `beam-free` → Reflection Beam)
     are owner-reviewed and added manually, never generated.
- **Sharing rule (Adjustment 21)**: one source id may carry several reviewed
  targets — the `exact` owner attaches directly and `family_fallback`
  siblings receive a clone of the same row (rendered `~score`).
- `bun run validate:mappings` (`scripts/validate-mappings.ts`, shared helpers
  in `scripts/live-data.ts`) parses the export through the production adapter
  and classifies every non-null `llbmId` as **PASS** (scored in at least one
  metric) / **PENDING** (real model, no score yet) / **DRIFT** (id exists
  nowhere, or the registry target left the catalog). Exits non-zero only on
  DRIFT; `--skip-catalog` skips the OpenCode CLI check. Network-required; not
  part of `bun run check`.
- History: the KNOWLEDGE_04/06 GPQA-era tables and the KNOWLEDGE_09
  "fully resolved" table were validated entry-by-entry against the live
  dataset before adoption (Adjustment 21).

## Tests

`tests/unit/llbm-adapter.test.ts` runs against
`tests/fixtures/llbm-export.sample.json` (trimmed live slice: 6 unique
`aa_coding_index` targets with a duplicate low-score row, 3
`aa_intelligence_index` rows including one intelligence-only model, and a
`usd` noise row on another metric). No ordinary test touches the live
endpoint.
