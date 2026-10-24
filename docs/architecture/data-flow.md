# Data Flow

**Status:** Phase 3 complete (2026-10-24). Later phases add matching, ranking,
aggregation, caching, and UI on top of these boundaries.

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

## Failure isolation

Each source has an independent adapter result. A GPQA or LiveCodeBench failure
must leave registry/pricing data usable and mark only that source stale or
unavailable. The retry helper never retries authentication failures and never
includes query strings, headers, or credentials in errors.

## Next phases

- **Phase 4:** `src/services/model-matching.ts` and `ranking.ts` consume the
  separate `ModelRecord[]` + `ModelBenchmark[]` outputs.
- **Phase 5:** aggregation and per-source cache wrap the adapters; live fetches
  remain explicit/background, never on panel open or keystroke.
