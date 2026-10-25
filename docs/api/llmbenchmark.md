# LLMBM (LLMBenchmark.ai)

**Status: VERIFIED (2026-10-25).** Single benchmark source replacing the former
HF GPQA + LiveCodeBench pair (Adjustment 19/20).

## Endpoints

- `GET https://api.llmbenchmark.ai/v1/export` — **the source the plugin uses**.
  No authentication; ~8.3 MB JSON: `{ dataset: { models[378], scores[36799],
  sources, generatedAt }, priceHistory[11] }` (observed 2026-10-25).
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
  "source": "aider",                // evaluation harness name
  "metric": "polyglot_pass_rate",   // metric key — filter on this
  "value": 0.88,                    // number in `unit`
  "unit": "ratio",                  // points | ratio | usd | tokens | elo | votes | seconds …
  "observedAt": "2026-10-25",       // YYYY-MM-DD
  "sourceUrl": "https://aider.chat/…",
  "setting": "High"                 // free-form run setting; duplicates per model possible
}
```

## Metric used: `aa_coding_index`

- 114 models, unit `points`, range 2.7 (google/gemma-3-4b-it) … 81.6
  (anthropic/claude-fable-5.1) on 2026-10-25.
- Override with `OPENCODE_LLM_BENCH_METRIC` (read at refresh time, not module
  load). Alternative coding metrics seen live: `livebench_coding` (27 models,
  ratio), `swebench_resolved` (43, ratio), `aa_livecodebench` (89 models,
  ratio), `vals_livecodebench` (109, ratio), `polyglot_pass_rate` (30, ratio).
- Normalization in `f_parseLlbmExport`: `points` → score as-is (must be 0–100,
  else `score-out-of-range` warning and skip); `ratio` → `value × 100` rounded
  to 2 decimals; **all other units are skipped** with an `unsupported-unit`
  warning. Rows are stored as `ModelBenchmark` with `benchmarkId: "llbm"`,
  `variant: "llbm-<metric>"`, `scoreUnit: "percent"`, and `rank: null`
  (competition ranks are always derived locally by `f_assignBenchmarkRanks`).
- Duplicate rows for one model (different `source`/`setting`) are deduplicated
  keeping the **highest** score, with a `duplicate-score-row` warning.
- Malformed rows (missing/non-string model id, non-number value) are skipped
  with `malformed-score-row` warnings; a payload with zero usable rows fails
  the source (`LLMBM returned no score rows for metric <m>`) and the
  last-known-good cache entry survives.

## Fetch and cache

- `f_fetchLlbmBenchmarks(options)` uses the shared `f_fetchJsonWithRetry`
  policy with a 30 s timeout floor (payload is multi-MB), bounded retries with
  backoff for network/408/425/429/5xx, and host-only error messages.
- Cached through the plugin's own `llbm` envelope with the benchmark TTL
  (default 6 hours) — the adapter has **no private cache** (the old ad-hoc
  `~/.cache/opencode/benchmarks` file was removed in Adjustment 20). See
  `docs/architecture/caching.md`.
- Fetched only through `/mosp update`; panel mounts read the cache only.

## Model mapping (`src/config/llbm-mappings.ts`)

The catalog uses anonymized/rebranded IDs (`opencode/beam-free`, …), so LLMBM
rows attach through reviewed mappings keyed on the exact LLMBM `modelId`.

- Rebuilt 2026-10-25 from the live `/v1/export` scored set
  (`bun run generate:mappings`, `scripts/generate-mappings.ts`): **79 of 82**
  entries carry a source id — **47 attach today** (metric scored) and **32 are
  PENDING** (the model exists in `dataset.models` but has no `aa_coding_index`
  row yet; they attach automatically once scored). Only `beam-free`,
  `big-pickle`, and `flint-40b-free` remain `null`.
- Matching policy (owner-approved):
  1. tail after the last `/` of the LLMBM id equals the catalog `modelId`
     (case-folded) → `matchType: "exact"`;
  2. **dot equivalence**: a dash replaced by a dot at one version boundary
     (`claude-opus-4-8` → `anthropic/claude-opus-4.8`), resolving to exactly
     one live id → `exact`; ambiguous dot forms are never guessed;
  3. catalog id ends `-free` and the stem resolves by either rule →
     `family_fallback`;
  4. reviewed sibling proxies (e.g. `gpt-5-codex` → `openai/gpt-5`,
     `qwen3.8-max` → `qwen/qwen3.8-max-0902`) are owner-reviewed and added
     manually to the config, not generated.
- **Sharing rule (Adjustment 21)**: one source id may carry several reviewed
  targets — the `exact` owner attaches directly and `family_fallback`
  siblings receive a clone of the same row (rendered `~#rank score`). The
  former "exact wins, family drops" conflict rule was retired.
- `bun run validate:mappings` (`scripts/validate-mappings.ts`) classifies
  every non-null `llbmId` as **PASS** (scored) / **PENDING** (real model, no
  metric row yet) / **DRIFT** (id exists nowhere → correct or null it) and
  exits non-zero only on DRIFT. Live run 2026-10-25: 47 PASS / 32 PENDING /
  0 DRIFT. Network-required; not part of `bun run check`.
- History: the KNOWLEDGE_04/06 GPQA-era tables and the KNOWLEDGE_09
  "fully resolved" table (only 41/79 claimed strings existed as written; six
  dash-form Claude ids were corrected to their live dot-forms) were
  validated entry-by-entry against the live dataset before adoption.

## Tests

`tests/unit/llbm-adapter.test.ts` runs against
`tests/fixtures/llbm-export.sample.json` (trimmed live slice: 6 unique
`aa_coding_index` targets, a duplicate low-score row, and a `usd` noise row on
another metric). No ordinary test touches the live endpoint.
