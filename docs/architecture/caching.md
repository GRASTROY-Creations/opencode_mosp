# Caching and aggregation

Phase 5 introduced a per-source cache and the aggregation service
(`src/services/cache.ts`, `src/services/model-overview.ts`). This document is
the reference for what is stored, where it lives, and how staleness is handled.

## Principles

1. **No network I/O on panel open.** Mounts use `f_getModelOverviewFromHost`:
   the host's in-memory location catalog wins whenever it parses, the
   `opencode-models` cache entry is the fallback, and benchmark sources plus
   the models.dev crosswalk stay cache-only. `f_getModelOverview` and
   `f_getOverviewStatus` read the cache alone. Live fetches happen exclusively
   through `f_refreshModelOverview` (`/mosp update`).
2. **Per-source isolation.** Each source is read, refreshed, and marked stale
   independently. One failure never discards another source's rows.
3. **Last-known-good wins.** A failed refresh keeps the previous cached entry
   and labels the source `stale`; it never replaces data with an empty success.
4. **Validate before use.** Cached payloads are re-validated against the domain
   contracts on every read. Invalid data becomes an error state, never a
   fabricated row.
5. **Missing is `null`.** Cache absence is reported as `unavailable`/`error`;
   it is never converted into zeros or placeholder models.

## Stored sources

| Source key | Payload | Written by | Default TTL |
|---|---|---|---|
| `opencode-models` | `ModelRecord[]` from the registry adapter (fallback for host-first reads) | model refresh | 1 hour |
| `llbm` | `ModelBenchmark[]` (LLMBM export: `llbmCoding` rows from `aa_coding_index` plus `llbmIntelligence` rows from `aa_intelligence_index`, one entry for both) | LLMBM refresh | 6 hours |
| `models-dev` | `ModelsDevCrosswalk` (`opencode/<modelId>` → name/family/release date) | models.dev refresh | 6 hours |

`opencode-pricing` is a **derived status view**, not a cache entry: the
registry payload carries model prices together with the catalog, so pricing is
refreshed and cached as part of `opencode-models`. Its status mirrors the model
source when at least one published price exists, and becomes `unavailable`
otherwise.

`models-dev` stores a **trimmed crosswalk only** (name/family/release date per
opencode model). Registry data stays authoritative for displayed
name/cost/context; the crosswalk is the future benchmark-mapping bridge and is
not part of the snapshot's model rows.

## Envelope

Each entry is stored as a versioned envelope:

```jsonc
{
  "schemaVersion": 2,          // k_cacheSchemaVersion (2 since Adjustment 22: two benchmark ids, no rank)
  "source": "llbm",             // must match the file/key
  "fetchedAt": "2026-10-24T12:00:00.000Z",
  "ttlMs": 21600000,
  "payload": [ /* untrusted source rows */ ]
}
```

Reads reject an envelope when the schema version differs, the source does not
match the requested key, `fetchedAt` is not parseable, `ttlMs` is negative or
non-finite, or the `payload` key is missing. Freshness is
`now <= fetchedAt + ttlMs` (boundary inclusive). Bumping the schema version
invalidates old entries cleanly.

## Location and writes

- `f_getDefaultCacheDirectory()` resolves, in order:
  1. `OPENCODE_MODEL_OVERVIEW_CACHE_DIR`
  2. `$XDG_CACHE_HOME/opencode-model-overview`
  3. `~/.cache/opencode-model-overview`
- The file cache writes one `<source>.json` per source. Writes create the
  directory with mode `0o700`, write a unique temporary file with mode `0o600`,
  and `rename` it into place, so a crash never leaves a half-written entry.
  Temporary files are cleaned up best-effort.
- Write failures never discard fetched data: the snapshot is still returned and
  a `cache-write` warning is attached.
- Error strings from cache I/O are sanitized ("cache write failed"); the cache
  path never appears in status output.

## TTL configuration

| Variable | Meaning | Default |
|---|---|---|
| `OPENCODE_MODEL_CACHE_TTL_SECONDS` | Model/pricing freshness window | 3600 |
| `OPENCODE_BENCHMARK_CACHE_TTL_SECONDS` | Benchmark freshness window (also governs the models.dev crosswalk) | 21600 |
| `OPENCODE_REQUEST_TIMEOUT_MS` | Per-refresh request budget | 10000 |

Values are read at refresh time (not module load), so GUI processes see their
actual runtime environment. Invalid or non-positive values fall back to the
defaults. Per-call `modelTtlMs` / `benchmarkTtlMs` options override the
environment for tests and tooling.

## Refresh flow

`f_refreshModelOverview(options)`:

1. Read all three cache-backed sources (models, llbm, models-dev).
2. For each source, decide `fh_shouldRefresh` — forced, not fresh, empty, or
   missing.
3. Run the selected source jobs in parallel through injected loaders.
4. On success with a non-empty payload: mark `fresh`, update `fetchedAt`, and
   write the cache entry.
5. On failure or an empty payload: keep the previous value, mark `stale` when a
   value exists, `error` otherwise, and record a sanitized error.
6. Merge model sources, attach matched benchmarks (scores only; no ranks are
   derived), and build status.

Concurrent refreshes for the same cache key share one in-flight promise, so
repeated clicks or commands never multiply requests.

## Status derivation

Source states are `fresh | stale | unavailable | error`. The aggregate overview
state is:

| Condition | Overview state |
|---|---|
| No models and no benchmark data, no error | `idle` |
| No models but an error or benchmark data exists | `error` |
| Models exist and any source is `error`/`unavailable` | `partial` |
| Models exist and any source is `stale` | `stale` |
| All sources fresh | `ready` |

`lastRefreshAt` is the newest `fetchedAt` across sources. `lastAttemptAt` also
tracks failed attempts made during the current process.

## Testing

`tests/unit/cache.test.ts` covers round-trips, the freshness boundary, invalid
writes, corrupt/mismatched envelopes, atomic overwrite, and environment
resolution. `tests/unit/model-overview.test.ts` covers ready/partial/stale/error
aggregation, last-known-good preservation, empty-payload rejection, loader
exception sanitization, concurrent dedup, force refresh, cache-write warnings,
and merge behavior. Neither suite performs network I/O.
