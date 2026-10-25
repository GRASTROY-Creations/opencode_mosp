# Data Flow

**Status:** Phase 6 complete (2026-10-24). The UI renders only cached snapshots;
live fetches happen solely through explicit refreshes.

## Pipeline

```text
OpenCode registry ─┐
HF GPQA leaderboard ├─► source adapter ─► domain records ─► matching ─► ranking ─► aggregation/cache ─► UI
LiveCodeBench JSON ─┤
models.dev api.json ┘
```

| Source | Adapter | Output |
|---|---|---|
| Local model registry (`context.model.list()` / `context.data.location.model.list()`) | `src/providers/opencode-models.ts` (+ `opencode-pricing.ts`) | `ModelRecord[]` with `source: "opencode"`, no benchmarks — **host-first** on every panel mount (Adjustment 17); the cached entry is the fallback |
| HF GPQA Diamond | `src/providers/huggingface-gpqa.ts` | `ModelBenchmark[]` (`gpqa`, `gpqa_diamond`) |
| LiveCodeBench generation snapshot | `src/providers/livecodebench.ts` | `ModelBenchmark[]` (`livecodebench`, `generation`) |
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
source-ID first, then a casefolded fallback that only applies when the folded
key resolves to a single distinct source — collisions drop both entries), then
conservative normalization (trim, lowercase, `_` → `-` only). Provider prefixes,
version suffixes, and punctuation are not stripped automatically.

- A strategy that resolves to more than one model is recorded as `ambiguous`;
  matching stops there and never falls through to a looser strategy.
- A reviewed alias whose target is absent, a reviewed mapping whose target is
  absent (`mapping-target-missing`), a row without a source ID, and a duplicate
  benchmark for a model are all recorded as unmatched.
- Existing benchmark rows are never overwritten.
- `src/config/model-aliases.ts` stays empty (no legacy alias rows).
  `src/config/benchmark-mappings.ts` was seeded on 2026-10-25 (Adjustment 17)
  with the three owner-confirmed GPQA rows — `moonshotai/Kimi-K2.6` →
  `opencode/kimi-k2.6` (alias), `moonshotai/Kimi-K2.5` → `opencode/kimi-k2.5`
  (alias), `Qwen/Qwen3.5-397B-A17B` → `opencode/qwen3.5-plus` (family_proxy);
  exact live source strings, org prefixes included. The KNOWLEDGE_04.md and
  KNOWLEDGE_06.md candidate tables were validated against the live sources and
  attached ZERO rows as written, so nothing else was adopted. The service
  accepts injected registries for tests and future reviewed mappings.
- Every attached row records a `matchType`: mapping entries carry their own
  kind (`alias`, `version_proxy`, `family_proxy`); legacy strategies attach as
  `exact`, reviewed aliases as `alias`. `version_proxy`/`family_proxy` cells
  render with a `~` prefix and are never presented as the model's own score.
- `bun run validate:mappings` (`scripts/validate-mappings.ts`) re-fetches the
  live GPQA/LiveCodeBench sources (plus the location catalog unless
  `--skip-catalog`) and exits non-zero when a seeded mapping's live strings
  drift. Network-required; deliberately not part of `bun run check`.

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
- **Adjustment 16 (done):** the fifth source `models-dev` caches the trimmed
  models.dev crosswalk (name/family/release date per opencode model) for the
  future mapping stage; displayed data still comes exclusively from the
  OpenCode registry. See `docs/api/models-dev.md`.
- **Phase 7 (next):** testing, security, and CI hardening.
