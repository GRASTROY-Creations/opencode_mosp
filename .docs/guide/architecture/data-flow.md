# Data Flow

**Status:** current as of Adjustment 22 (2026-10-26). The UI renders
host-first models plus cached snapshots; live fetches happen solely through
explicit `/mosp update`.

## Pipeline

```text
OpenCode registry ──┐
LLMBM /v1/export    ├─► source adapter ─► domain records ─► matching ─► aggregation/cache ─► sort/filter ─► UI
models.dev api.json ┘
```

| Source | Adapter | Output |
|---|---|---|
| Local model registry (`context.data.location.model.list()`) | `src/providers/opencode-models.ts` (+ `opencode-pricing.ts`) | `ModelRecord[]` with `source: "opencode"`, no benchmarks — **host-first** on every panel mount (Adjustment 17); the cached entry is the fallback |
| LLMBM export snapshot (`aa_coding_index` + `aa_intelligence_index`) | `src/providers/llbm.ts` | `ModelBenchmark[]` with `benchmarkId` `llbmCoding` / `llbmIntelligence`, `variant: "llbm-<metric>"` |
| models.dev provider catalog (`opencode` provider) | `src/providers/models-dev.ts` | `ModelsDevCrosswalk` — cached bridge for future mappings; **not displayed** (registry stays authoritative) |

`src/utils/fetch-json.ts` owns the network policy: AbortController timeout,
bounded retries, exponential backoff, `Retry-After`, and host-only error
messages. Adapters return `AdapterResult<T>` instead of throwing source
failures; warnings describe rows that were skipped while the source stayed
usable.

## Boundaries

- Remote JSON enters as `unknown`; every field is validated before it becomes a
  domain value.
- A broken envelope fails the source. A malformed row is skipped with a
  warning; conflicting duplicate identities are left ambiguous/unmatched.
- Missing prices, scores, sample counts, and dates are `null`; absence is never
  converted to `0`. Genuine zero prices/scores are preserved.
- Benchmark adapters emit only rows that exist. The aggregator attaches them to
  models later; unmatched benchmark rows are not forced onto similar names.
- Registry `settings`, `headers`, `body`, and variant credentials are never
  read, logged, or persisted.
- Benchmark scores always carry their protocol: the LLMBM metric lives in the
  benchmark `variant` (`llbm-<metric>`) and each row keeps its `observedAt`.
- Only reported scores are shown; no rank is derived (Adjustment 22).

## Matching (`src/services/model-matching.ts`)

Benchmark rows are matched independently (per benchmark id, so one source
model feeds both LLMBM columns), in this order:

1. exact `<providerId>/<modelId>` key;
2. exact `modelId`;
3. exact `canonicalId`;
4. reviewed LLMBM mapping (`src/config/llbm-mappings.ts`): exact source id
   first, then a casefolded fallback that only applies when the folded key
   resolves to a single distinct source (collisions drop the fold; exact keys
   remain usable);
5. conservative normalization (trim, lowercase, `_` → `-` only). Provider
   prefixes, version suffixes, and punctuation are never stripped.

- A strategy that resolves to more than one model is recorded as `ambiguous`;
  matching stops there and never falls through to a looser strategy.
- A mapping source id may carry several reviewed targets (Adjustment 21
  sharing): the `exact` owner attaches directly and each `family_fallback`
  sibling attaches as a clone of the same row.
- A reviewed mapping whose target is absent (`mapping-target-missing`) and a
  row without a source id (`missing-source-id`) are recorded as unmatched.
- Attached rows are **merged** into the model's existing `benchmarks`; a second
  row for a benchmark id the model already carries is dropped and recorded as
  `duplicate-benchmark` — existing rows are never overwritten.
- Every attached row records a `matchType`: mapping entries carry their own
  kind (`exact`, `family_fallback`); id strategies attach as `exact`.
  `family_fallback` cells render with a `~` prefix and are never presented as
  the model's own score.
- Mapping coverage (2026-10-26): 82 entries, 80 with a source id — 74 carry a
  value (coding 47, intelligence 74), 6 PENDING, 2 `null`. Details and the
  generation policy: `.docs/guide/sources/llmbenchmark.md`.
- `bun run validate:mappings` re-fetches the live export (plus the location
  catalog unless `--skip-catalog`) and classifies every non-null `llbmId` as
  **PASS** (scored in at least one metric), **PENDING** (real model, no score
  yet), or **DRIFT** (exists nowhere / target left the catalog). It exits
  non-zero only on DRIFT. Network-required; deliberately not part of
  `bun run check`.

## Sorting and filtering

`src/services/ranking.ts` is pure: it never fetches, mutates, or depends on the
TUI. Missing values (absent benchmarks, prices, dates) stay last in both
directions; ties break by model ID for deterministic output. Names use a fixed
`en` collator with numeric handling. Benchmark columns (`codingScore`,
`intelligenceScore`) sort by the reported score; the default view is
`codingScore` descending.

`src/services/model-filter.ts` composes exact provider IDs, benchmark
presence/absence (one benchmark or any), and explicit-free pricing. Filters
are AND-combined and never mutate the catalog. The UI exposes only the free
filter chip.

## Failure isolation

Each source has an independent adapter result. An LLMBM or models.dev failure
must leave registry/pricing data usable and mark only that source stale or
unavailable. The retry helper never retries authentication failures and never
includes query strings, headers, or credentials in errors.

## Aggregation and caching

`src/services/model-overview.ts` assembles snapshots and
`src/services/cache.ts` persists per-source payloads:

- `f_getModelOverview` / `f_getOverviewStatus` are cache-only reads;
  `f_getModelOverviewFromHost` is the host-first variant used on panel mount.
  Panel opens never start a live request.
- `f_refreshModelOverview` refreshes stale/missing/forced sources in parallel,
  preserves last-known-good entries on failure, and deduplicates concurrent
  refreshes per cache key.
- `f_mergeModelSources` fills null metadata, merges pricing tiers by threshold,
  and unions benchmarks by ID without inventing values.
- Status derivation and storage rules are documented in
  `.docs/guide/architecture/caching.md`.

## History

Phase-by-phase history (GPQA/LiveCodeBench era, LLMBM migration, mapping
rebuilds) is recorded in `.docs/decisions/history/PLAN.md` (Adjustments 16–22).
