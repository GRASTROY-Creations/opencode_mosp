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

- Generated 2026-10-25 from the live `/v1/export` scored set
  (`bun run generate:mappings`, `scripts/generate-mappings.ts`): **37 of 82**
  catalog models matched.
- Matching policy (owner-approved "Auto-adopt exact + review table"):
  1. tail after the last `/` of the LLMBM id equals the catalog `modelId`
     (case-folded) → `matchType: "exact"`;
  2. catalog id ends `-free` and the stem matches a tail →
     `matchType: "family_fallback"` (rendered `~` in the table);
  3. everything else → `llbmId: null` (documented as unmatched; the generator
     prints near-candidates for review).
- Deliberate non-adoptions pending owner policy:
  - dot-vs-dash naming: `opencode/claude-fable-5-1` ↔
    `anthropic/claude-fable-5.1`, `claude-haiku-4-5` ↔ `claude-haiku-4.5`,
    `claude-opus-4-7/4-8`, `claude-sonnet-4-5/4-6`;
  - suffix drift: `gemini-3.1-pro` vs `-preview`, `qwen3.8-max` vs `-0902`,
    `nemotron-3-ultra-free` vs `-550b-a55b`;
  - anonymized rebrands with no candidate at all: `beam-free`, `big-pickle`,
    `flint-40b-free`, `gpt-6-luna`/`gpt-6-sol`/`gpt-6.1-sol`,
    `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`, `mistral-large-4`,
    `qwen3.5-plus`, `qwen3.8-flash`, `grok-4.7`, `gpt-5-nano`,
    `muse-wonder-1.0`.
- Shared-source conflict rule: when two mappings point at the same LLBM id,
  the `exact` mapping wins (`opencode/glm-5.3-flash` keeps
  `z-ai/glm-5.3-flash`; the `-free` sibling stays unmatched). Two distinct
  targets of the same kind remain ambiguous and are dropped.
- `bun run validate:mappings` (`scripts/validate-mappings.ts`) re-checks every
  non-null `llbmId` against the live scored set and the location catalog
  (best-effort) and exits non-zero on drift. Network-required; not part of
  `bun run check`.

## Tests

`tests/unit/llbm-adapter.test.ts` runs against
`tests/fixtures/llbm-export.sample.json` (trimmed live slice: 6 unique
`aa_coding_index` targets, a duplicate low-score row, and a `usd` noise row on
another metric). No ordinary test touches the live endpoint.
