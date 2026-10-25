# Data Flow

**Status:** Phase 6 complete (2026-10-24). The UI renders only cached snapshots;
live fetches happen solely through explicit refreshes.

## Pipeline

```text
OpenCode registry ─┐
HF GPQA leaderboard ├─► source adapter ─► domain records ─► matching ─► ranking ─► aggregation/cache ─► UI
LiveCodeBench JSON ─┘
```

| Source | Adapter | Output |
|---|---|---|
| Local model registry (`context.model.list()` / `context.data.location.model.list()`) | `src/providers/opencode-models.ts` (+ `opencode-pricing.ts`) | `ModelRecord[]` with `source: "opencode"`, no benchmarks |
| HF GPQA Diamond | `src/providers/huggingface-gpqa.ts` | `ModelBenchmark[]` (`gpqa`, `gpqa_diamond`) |
| LiveCodeBench generation snapshot | `src/providers/livecodebench.ts` | `ModelBenchmark[]` (`livecodebench`, `generation`) |

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
- Missing prices, scores, ranks, sample counts, and dates are `null`; absence is
  never converted to `0`. Genuine zero prices/scores are preserved.
- Benchmark adapters emit only rows that exist. The aggregator attaches them to
  models later; unmatched benchmark rows are not forced onto similar names.
- Registry `settings`, `headers`, `body`, and variant credentials are never
  read, logged, or persisted.
- Benchmark scores always carry their protocol: GPQA variant, or LiveCodeBench
  window + sample count.

## Matching (`src/services/model-matching.ts`)

Benchmark rows are matched independently, in this order: exact
`<providerId>/<modelId>` key, exact `modelId`, exact `canonicalId`, reviewed
alias, reviewed benchmark mapping (`src/config/benchmark-mappings.ts`, exact
source-ID lookup per benchmark), then conservative normalization (trim,
lowercase, `_` → `-` only). Provider prefixes, version suffixes, and
punctuation are not stripped automatically.

- A strategy that resolves to more than one model is recorded as `ambiguous`;
  matching stops there and never falls through to a looser strategy.
- A reviewed alias whose target is absent, a reviewed mapping whose target is
  absent (`mapping-target-missing`), a row without a source ID, and a duplicate
  benchmark for a model are all recorded as unmatched.
- Existing benchmark rows are never overwritten.
- `src/config/model-aliases.ts` and `src/config/benchmark-mappings.ts` are the
  reviewed registries. Both are intentionally empty for the 2026-10-25 catalog:
  no benchmark row corresponds to a current (largely anonymized) registry
  model, and the KNOWLEDGE_04.md candidate table attached ZERO rows when
  validated against the live sources. The service accepts injected registries
  for tests and future reviewed mappings.
- Every attached row records a `matchType`: mapping entries carry their own
  kind (`alias`, `version_proxy`, `family_proxy`); legacy strategies attach as
  `exact`, reviewed aliases as `alias`. `version_proxy`/`family_proxy` cells
  render with a `~` prefix and are never presented as the model's own score.

## Ranking and filtering

`src/services/ranking.ts` is pure: it never fetches, mutates, or depends on the
TUI. Missing values (including absent benchmarks, prices, ranks, and dates)
stay last in both directions; ties break by model ID for deterministic output.
Names use a fixed `en` collator with numeric handling. `f_assignBenchmarkRanks`
derives competition ranks from scores (ties share a rank, e.g. 1, 1, 3); a
null score keeps `rank: null`, and source-supplied ranks are recomputed because
GPQA's published rank mixes subsets.

`src/services/model-filter.ts` composes case-insensitive search (name,
provider, IDs), exact provider IDs, benchmark presence/absence (one benchmark
or any), and explicit-free pricing. Filters are AND-combined and never mutate
the catalog.

## Failure isolation

Each source has an independent adapter result. A GPQA or LiveCodeBench failure
must leave registry/pricing data usable and mark only that source stale or
unavailable. The retry helper never retries authentication failures and never
includes query strings, headers, or credentials in errors.

## Aggregation and caching

`src/services/model-overview.ts` assembles snapshots and
`src/services/cache.ts` persists per-source payloads:

- `f_getModelOverview` / `f_getOverviewStatus` are cache-only reads; panel opens
  and keystrokes never start a live request.
- `f_refreshModelOverview` refreshes stale/missing/forced sources in parallel,
  preserves last-known-good entries on failure, and deduplicates concurrent
  refreshes per cache key.
- `f_mergeModelSources` fills null metadata, merges pricing tiers by threshold,
  and unions benchmarks by ID without inventing values.
- Status derivation and storage rules are documented in
  `docs/architecture/caching.md`.

## Next phases

- **Phase 4 (done):** matching, deterministic sorting/ranks, and filters are
  implemented in `src/services/`.
- **Phase 5 (done):** aggregation and per-source caching wrap the adapters;
  live fetches remain explicit/background, never on panel open or keystroke.
- **Phase 6 (done):** the PoC panel was replaced by the real UI
  (`src/ui/panel-controller.ts` + `src/tui.tsx`), wired to
  `f_getModelOverview` for cache-only reads and `f_refreshModelOverview` for
  explicit refreshes. See `docs/architecture/ui-integration.md`.
- **Phase 7 (next):** testing, security, and CI hardening.
