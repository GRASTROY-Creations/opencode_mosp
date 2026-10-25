/**
 * Aggregation service and cache orchestration for the model overview.
 *
 * Design rules:
 * - `f_getModelOverview` is cache-only. Opening or toggling the panel must never
 *   start a live request.
 * - `f_refreshModelOverview` refreshes sources independently. A failed source is
 *   recorded in status and never discards another source's data.
 * - A failed refresh keeps the last-known-good cache entry; its state becomes
 *   `stale` rather than disappearing.
 * - Benchmark rows are matched conservatively and ranked only after attaching.
 *
 * The OpenCode registry payload carries model prices together with the catalog,
 * so `opencode-pricing` is a derived source view rather than a second request.
 * This is documented in `docs/architecture/caching.md`.
 */

import {
  f_validateModelBenchmark,
  k_benchmarkIds,
  type BenchmarkId,
  type ModelBenchmark,
} from "../domain/model-benchmark";
import {
  type ModelPricing,
  type ModelPricingTier,
} from "../domain/model-pricing";
import {
  f_validateModelRecord,
  type ModelRecord,
} from "../domain/model-record";
import {
  f_fail,
  f_isRecord,
  f_ok,
  type DomainResult,
} from "../domain/guards";
import {
  type ModelOverviewStatus,
  type OverviewState,
  type SourceId,
  type SourceState,
  type SourceStatus,
} from "../domain/source-status";
import {
  f_adapterFail,
  type AdapterResult,
  type AdapterWarning,
} from "../providers/adapter-result";
import {
  f_parseModelsDevMeta,
  type ModelsDevCrosswalk,
  type ModelsDevModelMeta,
} from "../providers/models-dev";
import {
  f_resolveCacheTtls,
  type OverviewCache,
} from "./cache";
import {
  f_matchBenchmarkRecords,
  type BenchmarkMatch,
  type UnmatchedBenchmark,
} from "./model-matching";
import { f_assignBenchmarkRanks, f_sortModels } from "./ranking";
import { f_filterModels } from "./model-filter";

export { f_matchBenchmarkRecords, f_sortModels, f_filterModels };

/** Default request budget when a caller does not supply one. */
export const k_defaultRequestTimeoutMs = 10_000;

/** Context passed to an injected source loader. */
export interface OverviewLoadContext {
  readonly signal: AbortSignal | null;
  readonly now: Date;
  readonly timeoutMs: number;
}

/** Loads the local registry catalog (already normalized or raw `ModelInfo[]`). */
export type OverviewModelLoader = (
  p_context: OverviewLoadContext,
) => Promise<AdapterResult<readonly ModelRecord[]>>;

/** Loads one benchmark source. */
export type OverviewBenchmarkLoader = (
  p_context: OverviewLoadContext,
) => Promise<AdapterResult<readonly ModelBenchmark[]>>;

/** Loads the models.dev crosswalk (registry id -> canonical metadata). */
export type OverviewModelsDevLoader = (
  p_context: OverviewLoadContext,
) => Promise<AdapterResult<ModelsDevCrosswalk>>;

/** Options shared by cache-only reads and status queries. */
export interface OverviewReadOptions {
  readonly cache: OverviewCache;
  /** Injectable clock; defaults to the current time. */
  readonly now?: () => Date;
}

/** Options for an explicit refresh. */
export interface OverviewRefreshOptions extends OverviewReadOptions {
  readonly loadModels: OverviewModelLoader;
  readonly loadLlbm: OverviewBenchmarkLoader;
  readonly loadModelsDev: OverviewModelsDevLoader;
  /** Ignore TTLs and fetch every source again. */
  readonly force?: boolean;
  /** Override the model/pricing TTL for entries written by this refresh. */
  readonly modelTtlMs?: number;
  /** Override the benchmark TTL for entries written by this refresh. */
  readonly benchmarkTtlMs?: number;
  /** Optional total request budget passed to loaders. */
  readonly timeoutMs?: number;
  /** Optional caller cancellation passed to loaders. */
  readonly signal?: AbortSignal | null;
}

/** Warning with source attribution for display/debugging. */
export interface OverviewWarning extends AdapterWarning {
  readonly source: SourceId;
}

/** Everything the UI needs from one cache read or refresh. */
export interface ModelOverviewSnapshot {
  readonly models: readonly ModelRecord[];
  readonly status: ModelOverviewStatus;
  readonly matches: readonly BenchmarkMatch[];
  readonly unmatched: readonly UnmatchedBenchmark[];
  readonly warnings: readonly OverviewWarning[];
}

interface SourceRead<T> {
  readonly value: T | null;
  readonly fetchedAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly state: SourceState;
  readonly error: string | null;
}

interface RefreshJob {
  readonly source: SourceId;
  readonly run: () => Promise<void>;
}

/**
 * In-flight refresh promises, keyed by cache identity. Concurrent refresh
 * requests for the same cache share one network attempt.
 */
const k_inFlightRefreshes = new Map<string, Promise<ModelOverviewSnapshot>>();

/** Last attempt timestamps for the current process, per cache and source. */
const k_lastAttempts = new Map<string, Map<SourceId, string>>();

/**
 * Read the cached snapshot. This function performs no network I/O and does not
 * need loaders, which keeps panel opens and sort changes offline.
 */
export async function f_getModelOverview(
  p_options: OverviewReadOptions,
): Promise<ModelOverviewSnapshot> {
  const vl_now = fh_resolveNow(p_options.now);
  const [vl_models, vl_llbm, vl_modelsDev] =
    await fh_readAllSources(p_options.cache, vl_now);

  return await fh_assembleSnapshot(
    vl_models,
    vl_llbm,
    vl_modelsDev,
    p_options.cache.key,
    [],
  );
}

/**
 * Host-first read (Adjustment 17): the live OpenCode location catalog wins when
 * it parses and is non-empty; otherwise the cached model entry is used. The
 * benchmark sources and the models.dev crosswalk stay cache-only, and this read
 * never writes the cache.
 */
export async function f_getModelOverviewFromHost(
  p_options: OverviewReadOptions & {
    readonly hostModels: AdapterResult<readonly ModelRecord[]>;
  },
): Promise<ModelOverviewSnapshot> {
  const vl_now = fh_resolveNow(p_options.now);
  const vl_warnings: OverviewWarning[] = [];
  let vl_models: SourceRead<readonly ModelRecord[]>;

  if (p_options.hostModels.ok && p_options.hostModels.value.length > 0) {
    vl_models = fh_successfulRead(
      p_options.hostModels.value,
      vl_now.toISOString(),
      true,
    );
    vl_warnings.push(
      ...fh_mapWarnings("opencode-models", p_options.hostModels.warnings),
    );
  } else {
    vl_warnings.push({
      source: "opencode-models",
      code: "host-catalog-fallback",
      message: p_options.hostModels.ok
        ? "Host catalog returned no models; using cached snapshot"
        : `Host catalog unavailable; using cached snapshot (${p_options.hostModels.error})`,
    });
    vl_models = await fh_readModels(p_options.cache, vl_now);
  }

  const [vl_llbm, vl_modelsDev] = await Promise.all([
    fh_readBenchmarks(p_options.cache, "llbm", vl_now),
    fh_readModelsDev(p_options.cache, vl_now),
  ]);

  return await fh_assembleSnapshot(
    vl_models,
    vl_llbm,
    vl_modelsDev,
    p_options.cache.key,
    vl_warnings,
  );
}

export function f_refreshModelOverview(
  p_options: OverviewRefreshOptions,
): Promise<ModelOverviewSnapshot> {
  const vl_existing = k_inFlightRefreshes.get(p_options.cache.key);

  if (vl_existing !== undefined) {
    return vl_existing;
  }

  const vl_promise = (async (): Promise<ModelOverviewSnapshot> => {
    try {
      return await fh_performRefresh(p_options);
    } finally {
      k_inFlightRefreshes.delete(p_options.cache.key);
    }
  })();

  k_inFlightRefreshes.set(p_options.cache.key, vl_promise);

  return vl_promise;
}

/**
 * Return per-source freshness and errors from cache metadata only. Useful for
 * a sidebar strip that must stay cheap.
 */
export async function f_getOverviewStatus(
  p_options: OverviewReadOptions,
): Promise<ModelOverviewStatus> {
  const vl_now = fh_resolveNow(p_options.now);
  const [vl_models, vl_llbm, vl_modelsDev] =
    await fh_readAllSources(p_options.cache, vl_now);
  const vl_merged = f_mergeModelSources([
    vl_models.value === null ? [] : vl_models.value,
  ]);

  return fh_buildStatus(
    p_options.cache.key,
    vl_models,
    vl_llbm,
    vl_modelsDev,
    vl_merged,
  );
}

/**
 * Merge model catalogs by stable ID without losing metadata.
 *
 * - First source wins for a non-null value; later sources fill nulls.
 * - Benchmarks are unioned by benchmark ID. A row with a score is preferred
 *   over a row with no score; two conflicting scores keep the first source.
 * - Pricing fields and context tiers are filled field-by-field.
 * - `source` becomes `merged` only when an ID actually appeared more than once.
 */
export function f_mergeModelSources(
  p_sources: readonly (readonly ModelRecord[])[],
): readonly ModelRecord[] {
  const vl_byId = new Map<string, ModelRecord>();
  const vl_mergedIds = new Set<string>();

  for (const vl_source of p_sources) {
    for (const vl_model of vl_source) {
      const vl_existing = vl_byId.get(vl_model.id);

      if (vl_existing === undefined) {
        vl_byId.set(vl_model.id, vl_model);
        continue;
      }

      vl_mergedIds.add(vl_model.id);
      vl_byId.set(vl_model.id, fh_mergeModelPair(vl_existing, vl_model));
    }
  }

  return [...vl_byId.values()].map((p_model) =>
    vl_mergedIds.has(p_model.id)
      ? { ...p_model, source: "merged" }
      : p_model,
  );
}

/**
 * Resolve the request timeout at runtime. Invalid values fall back to 10s.
 * The environment is read here rather than at module load so GUI processes see
 * their actual runtime environment (direnv is not inherited automatically).
 */
export function f_resolveRequestTimeoutMs(
  p_env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const vl_raw = p_env.OPENCODE_REQUEST_TIMEOUT_MS;

  if (vl_raw === undefined || vl_raw.trim().length === 0) {
    return k_defaultRequestTimeoutMs;
  }

  const vl_value = Number(vl_raw);

  if (!Number.isFinite(vl_value) || vl_value <= 0) {
    return k_defaultRequestTimeoutMs;
  }

  return Math.round(vl_value);
}

async function fh_performRefresh(
  p_options: OverviewRefreshOptions,
): Promise<ModelOverviewSnapshot> {
  const vl_now = fh_resolveNow(p_options.now);
  const vl_nowIso = vl_now.toISOString();
  const vl_ttls = f_resolveCacheTtls();
  const vl_modelTtlMs = p_options.modelTtlMs ?? vl_ttls.modelTtlMs;
  const vl_benchmarkTtlMs =
    p_options.benchmarkTtlMs ?? vl_ttls.benchmarkTtlMs;
  const vl_timeoutMs =
    p_options.timeoutMs ?? f_resolveRequestTimeoutMs();
  const vl_context: OverviewLoadContext = {
    signal: p_options.signal ?? null,
    now: vl_now,
    timeoutMs: vl_timeoutMs,
  };
  const vl_force = p_options.force === true;
  const vl_warnings: OverviewWarning[] = [];

  let [vl_models, vl_llbm, vl_modelsDev] =
    await fh_readAllSources(p_options.cache, vl_now);

  const vl_jobs: RefreshJob[] = [];

  if (fh_shouldRefresh(vl_models, vl_force)) {
    vl_jobs.push({
      source: "opencode-models",
      run: async (): Promise<void> => {
        fh_recordAttempt(p_options.cache.key, "opencode-models", vl_nowIso);
        const vl_result = await fh_runModelLoader(
          p_options.loadModels,
          vl_context,
        );

        vl_warnings.push(...fh_mapWarnings("opencode-models", vl_result.warnings));

        if (!vl_result.ok) {
          vl_models = fh_applyFailure(vl_models, vl_result.error, vl_nowIso);
          return;
        }

        if (vl_result.value.length === 0) {
          vl_models = fh_applyFailure(
            vl_models,
            "model catalog returned no models",
            vl_nowIso,
          );
          return;
        }

        vl_models = fh_applySuccess(vl_result.value, vl_nowIso);

        const vl_write = await p_options.cache.write(
          "opencode-models",
          vl_result.value,
          vl_now,
          vl_modelTtlMs,
        );

        if (!vl_write.ok) {
          vl_warnings.push({
            source: "opencode-models",
            code: "cache-write",
            message: vl_write.error,
          });
        }
      },
    });
  }

  if (fh_shouldRefresh(vl_llbm, vl_force)) {
    vl_jobs.push({
      source: "llbm",
      run: async (): Promise<void> => {
        fh_recordAttempt(p_options.cache.key, "llbm", vl_nowIso);
        const vl_result = await fh_runBenchmarkLoader(
          p_options.loadLlbm,
          vl_context,
        );

        vl_warnings.push(...fh_mapWarnings("llbm", vl_result.warnings));

        if (!vl_result.ok) {
          vl_llbm = fh_applyFailure(vl_llbm, vl_result.error, vl_nowIso);
          return;
        }

        if (vl_result.value.length === 0) {
          vl_llbm = fh_applyFailure(
            vl_llbm,
            "LLMBM returned no benchmark rows",
            vl_nowIso,
          );
          return;
        }

        vl_llbm = fh_applySuccess(vl_result.value, vl_nowIso);

        const vl_write = await p_options.cache.write(
          "llbm",
          vl_result.value,
          vl_now,
          vl_benchmarkTtlMs,
        );

        if (!vl_write.ok) {
          vl_warnings.push({
            source: "llbm",
            code: "cache-write",
            message: vl_write.error,
          });
        }
      },
    });
  }

  if (fh_shouldRefreshModelsDev(vl_modelsDev, vl_force)) {
    vl_jobs.push({
      source: "models-dev",
      run: async (): Promise<void> => {
        fh_recordAttempt(p_options.cache.key, "models-dev", vl_nowIso);
        const vl_result = await fh_runModelsDevLoader(
          p_options.loadModelsDev,
          vl_context,
        );

        vl_warnings.push(...fh_mapWarnings("models-dev", vl_result.warnings));

        if (!vl_result.ok) {
          vl_modelsDev = fh_applyFailure(vl_modelsDev, vl_result.error, vl_nowIso);
          return;
        }

        const vl_crosswalk = vl_result.value;
        if (Object.keys(vl_crosswalk).length === 0) {
          vl_modelsDev = fh_applyFailure(
            vl_modelsDev,
            "models.dev returned no models",
            vl_nowIso,
          );
          return;
        }

        vl_modelsDev = fh_applySuccess(vl_crosswalk, vl_nowIso);

        const vl_write = await p_options.cache.write(
          "models-dev",
          vl_crosswalk,
          vl_now,
          vl_benchmarkTtlMs,
        );

        if (!vl_write.ok) {
          vl_warnings.push({
            source: "models-dev",
            code: "cache-write",
            message: vl_write.error,
          });
        }
      },
    });
  }

  await Promise.all(vl_jobs.map((p_job) => p_job.run()));

  return await fh_assembleSnapshot(
    vl_models,
    vl_llbm,
    vl_modelsDev,
    p_options.cache.key,
    vl_warnings,
  );
}

async function fh_assembleSnapshot(
  p_models: SourceRead<readonly ModelRecord[]>,
  p_llbm: SourceRead<readonly ModelBenchmark[]>,
  p_modelsDev: SourceRead<ModelsDevCrosswalk>,
  p_cacheKey: string,
  p_warnings: readonly OverviewWarning[],
): Promise<ModelOverviewSnapshot> {
  const vl_sourceModels = p_models.value === null ? [] : p_models.value;
  const vl_merged = f_mergeModelSources([vl_sourceModels]);
  const vl_benchmarks: readonly ModelBenchmark[] =
    p_llbm.value === null ? [] : p_llbm.value;
  const vl_match = await f_matchBenchmarkRecords(vl_merged, vl_benchmarks);
  const vl_ranked = f_assignBenchmarkRanks(vl_match.models);

  return {
    models: vl_ranked,
    status: fh_buildStatus(
      p_cacheKey,
      p_models,
      p_llbm,
      p_modelsDev,
      vl_ranked,
    ),
    matches: vl_match.matches,
    unmatched: vl_match.unmatched,
    warnings: p_warnings,
  };
}

function fh_buildStatus(
  p_cacheKey: string,
  p_models: SourceRead<readonly ModelRecord[]>,
  p_llbm: SourceRead<readonly ModelBenchmark[]>,
  p_modelsDev: SourceRead<ModelsDevCrosswalk>,
  p_rankedModels: readonly ModelRecord[],
): ModelOverviewStatus {
  const vl_sources: readonly SourceStatus[] = [
    fh_createStatus("opencode-models", p_models, p_cacheKey),
    fh_createPricingStatus(p_models, p_rankedModels, p_cacheKey),
    fh_createStatus("llbm", p_llbm, p_cacheKey),
    fh_createStatus("models-dev", p_modelsDev, p_cacheKey),
  ];

  return {
    state: fh_deriveOverviewState(p_models, p_llbm, vl_sources),
    lastRefreshAt: fh_latestFetchedAt([
      p_models.fetchedAt,
      p_llbm.fetchedAt,
      p_modelsDev.fetchedAt,
    ]),
    sources: vl_sources,
  };
}

function fh_createStatus<T>(
  p_source: SourceId,
  p_read: SourceRead<T>,
  p_cacheKey: string,
): SourceStatus {
  return {
    source: p_source,
    state: p_read.state,
    lastSuccessAt: p_read.fetchedAt,
    lastAttemptAt:
      fh_getLastAttempt(p_cacheKey, p_source) ?? p_read.lastAttemptAt,
    error: p_read.error,
  };
}

function fh_createPricingStatus(
  p_models: SourceRead<readonly ModelRecord[]>,
  p_rankedModels: readonly ModelRecord[],
  p_cacheKey: string,
): SourceStatus {
  const vl_hasPublishedPrice = p_rankedModels.some((p_model) =>
    fh_hasPublishedPrice(p_model.pricing),
  );

  if (p_models.value === null) {
    return {
      source: "opencode-pricing",
      state: p_models.state,
      lastSuccessAt: null,
      lastAttemptAt:
        fh_getLastAttempt(p_cacheKey, "opencode-models") ??
        p_models.lastAttemptAt,
      error: p_models.error,
    };
  }

  if (!vl_hasPublishedPrice) {
    return {
      source: "opencode-pricing",
      state: "unavailable",
      lastSuccessAt: null,
      lastAttemptAt:
        fh_getLastAttempt(p_cacheKey, "opencode-models") ??
        p_models.lastAttemptAt,
      error: null,
    };
  }

  return {
    source: "opencode-pricing",
    state: p_models.state,
    lastSuccessAt: p_models.fetchedAt,
    lastAttemptAt:
      fh_getLastAttempt(p_cacheKey, "opencode-models") ??
      p_models.lastAttemptAt,
    error: p_models.error,
  };
}

function fh_deriveOverviewState(
  p_models: SourceRead<readonly ModelRecord[]>,
  p_llbm: SourceRead<readonly ModelBenchmark[]>,
  p_sources: readonly SourceStatus[],
): OverviewState {
  if (p_models.value === null) {
    if (
      p_models.state === "error" ||
      p_llbm.state === "error"
    ) {
      return "error";
    }

    return "idle";
  }

  if (
    p_sources.some(
      (p_source) =>
        p_source.state === "error" || p_source.state === "unavailable",
    )
  ) {
    return "partial";
  }

  if (p_sources.some((p_source) => p_source.state === "stale")) {
    return "stale";
  }

  return "ready";
}

async function fh_readAllSources(
  p_cache: OverviewCache,
  p_now: Date,
): Promise<
  [
    SourceRead<readonly ModelRecord[]>,
    SourceRead<readonly ModelBenchmark[]>,
    SourceRead<ModelsDevCrosswalk>,
  ]
> {
  return Promise.all([
    fh_readModels(p_cache, p_now),
    fh_readBenchmarks(p_cache, "llbm", p_now),
    fh_readModelsDev(p_cache, p_now),
  ]);
}

async function fh_readModels(
  p_cache: OverviewCache,
  p_now: Date,
): Promise<SourceRead<readonly ModelRecord[]>> {
  const vl_read = await p_cache.read("opencode-models", p_now);

  if (!vl_read.ok) {
    return fh_failedRead(vl_read.reason);
  }

  const vl_parsed = fh_parseCachedModels(vl_read.value.envelope.payload);

  if (!vl_parsed.ok) {
    return fh_invalidPayload(vl_read.value.envelope.fetchedAt, "cached model data is invalid");
  }

  return fh_successfulRead(
    vl_parsed.value,
    vl_read.value.envelope.fetchedAt,
    vl_read.value.fresh,
  );
}

async function fh_readModelsDev(
  p_cache: OverviewCache,
  p_now: Date,
): Promise<SourceRead<ModelsDevCrosswalk>> {
  const vl_read = await p_cache.read("models-dev", p_now);

  if (!vl_read.ok) {
    return fh_failedRead(vl_read.reason);
  }

  const vl_parsed = fh_parseCachedModelsDev(vl_read.value.envelope.payload);

  if (!vl_parsed.ok) {
    return fh_invalidPayload(
      vl_read.value.envelope.fetchedAt,
      "cached models.dev crosswalk is invalid",
    );
  }

  return fh_successfulRead(
    vl_parsed.value,
    vl_read.value.envelope.fetchedAt,
    vl_read.value.fresh,
  );
}

async function fh_readBenchmarks(
  p_cache: OverviewCache,
  p_benchmarkId: BenchmarkId,
  p_now: Date,
): Promise<SourceRead<readonly ModelBenchmark[]>> {
  const vl_read = await p_cache.read(p_benchmarkId, p_now);

  if (!vl_read.ok) {
    return fh_failedRead(vl_read.reason);
  }

  const vl_parsed = fh_parseCachedBenchmarks(
    vl_read.value.envelope.payload,
    p_benchmarkId,
  );

  if (!vl_parsed.ok) {
    return fh_invalidPayload(
      vl_read.value.envelope.fetchedAt,
      "cached benchmark data is invalid",
    );
  }

  return fh_successfulRead(
    vl_parsed.value,
    vl_read.value.envelope.fetchedAt,
    vl_read.value.fresh,
  );
}

function fh_parseCachedModels(
  p_payload: unknown,
): DomainResult<readonly ModelRecord[]> {
  if (!Array.isArray(p_payload)) {
    return f_fail("cached models must be an array");
  }

  const vl_entries: readonly unknown[] = p_payload;
  const vl_models: ModelRecord[] = [];
  const vl_seenIds = new Set<string>();

  for (const [vl_index, vl_entry] of vl_entries.entries()) {
    const vl_model = f_validateModelRecord(vl_entry);

    if (!vl_model.ok) {
      return f_fail(`cached model at index ${vl_index}: ${vl_model.error}`);
    }

    if (vl_seenIds.has(vl_model.value.id)) {
      return f_fail(`cached models contain duplicate ${vl_model.value.id}`);
    }

    vl_seenIds.add(vl_model.value.id);
    vl_models.push(vl_model.value);
  }

  if (vl_models.length === 0) {
    return f_fail("cached models are empty");
  }

  return f_ok(vl_models);
}

function fh_parseCachedModelsDev(
  p_payload: unknown,
): DomainResult<ModelsDevCrosswalk> {
  if (!f_isRecord(p_payload)) {
    return f_fail("cached models.dev crosswalk must be an object");
  }

  const vl_entries: Record<string, ModelsDevModelMeta> = {};
  let vl_count = 0;

  for (const [vl_key, vl_value] of Object.entries(p_payload)) {
    if (vl_key.length === 0) {
      return f_fail("cached models.dev entry key must not be empty");
    }

    const vl_meta = f_parseModelsDevMeta(vl_value);

    if (!vl_meta.ok) {
      return f_fail(`cached models.dev entry ${vl_key}: ${vl_meta.error}`);
    }

    vl_entries[vl_key] = vl_meta.value;
    vl_count += 1;
  }

  if (vl_count === 0) {
    return f_fail("cached models.dev crosswalk is empty");
  }

  return f_ok(vl_entries);
}

function fh_parseCachedBenchmarks(
  p_payload: unknown,
  p_benchmarkId: BenchmarkId,
): DomainResult<readonly ModelBenchmark[]> {
  if (!Array.isArray(p_payload)) {
    return f_fail("cached benchmarks must be an array");
  }

  const vl_entries: readonly unknown[] = p_payload;
  const vl_benchmarks: ModelBenchmark[] = [];

  for (const [vl_index, vl_entry] of vl_entries.entries()) {
    const vl_benchmark = f_validateModelBenchmark(vl_entry);

    if (!vl_benchmark.ok) {
      return f_fail(
        `cached benchmark at index ${vl_index}: ${vl_benchmark.error}`,
      );
    }

    if (vl_benchmark.value.benchmarkId !== p_benchmarkId) {
      return f_fail(
        `cached benchmarks for ${String(p_benchmarkId)} contain ${String(vl_benchmark.value.benchmarkId)}`,
      );
    }

    vl_benchmarks.push(vl_benchmark.value);
  }

  if (vl_benchmarks.length === 0) {
    return f_fail("cached benchmarks are empty");
  }

  return f_ok(vl_benchmarks);
}

function fh_successfulRead<T>(
  p_value: T,
  p_fetchedAt: string,
  p_fresh: boolean,
): SourceRead<T> {
  return {
    value: p_value,
    fetchedAt: p_fetchedAt,
    lastAttemptAt: p_fetchedAt,
    state: p_fresh ? "fresh" : "stale",
    error: null,
  };
}

function fh_invalidPayload<T>(
  p_fetchedAt: string | null,
  p_error: string,
): SourceRead<T> {
  return {
    value: null,
    fetchedAt: p_fetchedAt,
    lastAttemptAt: p_fetchedAt,
    state: "error",
    error: p_error,
  };
}

function fh_failedRead<T>(
  p_reason: "missing" | "invalid" | "unreadable",
): SourceRead<T> {
  if (p_reason === "missing") {
    return {
      value: null,
      fetchedAt: null,
      lastAttemptAt: null,
      state: "unavailable",
      error: null,
    };
  }

  return {
    value: null,
    fetchedAt: null,
    lastAttemptAt: null,
    state: "error",
    error:
      p_reason === "invalid"
        ? "cache entry is invalid"
        : "cache entry could not be read",
  };
}

function fh_applySuccess<T>(
  p_value: T,
  p_nowIso: string,
): SourceRead<T> {
  return {
    value: p_value,
    fetchedAt: p_nowIso,
    lastAttemptAt: p_nowIso,
    state: "fresh",
    error: null,
  };
}

function fh_applyFailure<T>(
  p_read: SourceRead<T>,
  p_error: string,
  p_nowIso: string,
): SourceRead<T> {
  return {
    ...p_read,
    lastAttemptAt: p_nowIso,
    state: p_read.value === null ? "error" : "stale",
    error: p_error,
  };
}

function fh_shouldRefresh<T>(
  p_read: SourceRead<readonly T[]>,
  p_force: boolean,
): boolean {
  return (
    p_force ||
    p_read.state !== "fresh" ||
    p_read.value === null ||
    p_read.value.length === 0
  );
}

function fh_shouldRefreshModelsDev(
  p_read: SourceRead<ModelsDevCrosswalk>,
  p_force: boolean,
): boolean {
  return (
    p_force ||
    p_read.state !== "fresh" ||
    p_read.value === null ||
    Object.keys(p_read.value).length === 0
  );
}

async function fh_runModelLoader(
  p_loader: OverviewModelLoader,
  p_context: OverviewLoadContext,
): Promise<AdapterResult<readonly ModelRecord[]>> {
  try {
    return await p_loader(p_context);
  } catch {
    return f_adapterFail("model refresh failed unexpectedly");
  }
}

async function fh_runModelsDevLoader(
  p_loader: OverviewModelsDevLoader,
  p_context: OverviewLoadContext,
): Promise<AdapterResult<ModelsDevCrosswalk>> {
  try {
    return await p_loader(p_context);
  } catch {
    return f_adapterFail("models.dev refresh failed unexpectedly");
  }
}

async function fh_runBenchmarkLoader(
  p_loader: OverviewBenchmarkLoader,
  p_context: OverviewLoadContext,
): Promise<AdapterResult<readonly ModelBenchmark[]>> {
  try {
    return await p_loader(p_context);
  } catch {
    return f_adapterFail("benchmark refresh failed unexpectedly");
  }
}

function fh_mapWarnings(
  p_source: SourceId,
  p_warnings: readonly AdapterWarning[],
): readonly OverviewWarning[] {
  return p_warnings.map((p_warning) => ({
    source: p_source,
    code: p_warning.code,
    message: p_warning.message,
  }));
}

function fh_recordAttempt(
  p_cacheKey: string,
  p_source: SourceId,
  p_at: string,
): void {
  const vl_attempts =
    k_lastAttempts.get(p_cacheKey) ?? new Map<SourceId, string>();
  vl_attempts.set(p_source, p_at);
  k_lastAttempts.set(p_cacheKey, vl_attempts);
}

function fh_getLastAttempt(
  p_cacheKey: string,
  p_source: SourceId,
): string | null {
  return k_lastAttempts.get(p_cacheKey)?.get(p_source) ?? null;
}

function fh_latestFetchedAt(
  p_values: readonly (string | null)[],
): string | null {
  let vl_latest: string | null = null;

  for (const vl_value of p_values) {
    if (vl_value === null) {
      continue;
    }

    if (vl_latest === null || Date.parse(vl_value) > Date.parse(vl_latest)) {
      vl_latest = vl_value;
    }
  }

  return vl_latest;
}

function fh_mergeModelPair(
  p_existing: ModelRecord,
  p_incoming: ModelRecord,
): ModelRecord {
  return {
    ...p_existing,
    canonicalId: p_existing.canonicalId ?? p_incoming.canonicalId,
    releaseDate: p_existing.releaseDate ?? p_incoming.releaseDate,
    contextWindow: p_existing.contextWindow ?? p_incoming.contextWindow,
    pricing: fh_mergePricing(p_existing.pricing, p_incoming.pricing),
    benchmarks: fh_mergeBenchmarks(
      p_existing.benchmarks,
      p_incoming.benchmarks,
    ),
    lastUpdatedAt:
      p_existing.lastUpdatedAt >= p_incoming.lastUpdatedAt
        ? p_existing.lastUpdatedAt
        : p_incoming.lastUpdatedAt,
  };
}

function fh_mergePricing(
  p_existing: ModelPricing,
  p_incoming: ModelPricing,
): ModelPricing {
  return {
    inputUsdPerMillionTokens:
      p_existing.inputUsdPerMillionTokens ??
      p_incoming.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens:
      p_existing.outputUsdPerMillionTokens ??
      p_incoming.outputUsdPerMillionTokens,
    cacheReadUsdPerMillionTokens:
      p_existing.cacheReadUsdPerMillionTokens ??
      p_incoming.cacheReadUsdPerMillionTokens,
    cacheWriteUsdPerMillionTokens:
      p_existing.cacheWriteUsdPerMillionTokens ??
      p_incoming.cacheWriteUsdPerMillionTokens,
    currency: "USD",
    source: p_existing.source ?? p_incoming.source,
    observedAt: p_existing.observedAt ?? p_incoming.observedAt,
    tiers: fh_mergePricingTiers(p_existing.tiers, p_incoming.tiers),
  };
}

function fh_mergePricingTiers(
  p_existing: readonly ModelPricingTier[],
  p_incoming: readonly ModelPricingTier[],
): readonly ModelPricingTier[] {
  const vl_byThreshold = new Map<number, ModelPricingTier>();

  for (const vl_tier of p_existing) {
    vl_byThreshold.set(vl_tier.contextThresholdTokens, vl_tier);
  }

  for (const vl_tier of p_incoming) {
    const vl_current = vl_byThreshold.get(vl_tier.contextThresholdTokens);

    if (vl_current === undefined) {
      vl_byThreshold.set(vl_tier.contextThresholdTokens, vl_tier);
      continue;
    }

    vl_byThreshold.set(vl_tier.contextThresholdTokens, {
      contextThresholdTokens: vl_current.contextThresholdTokens,
      inputUsdPerMillionTokens:
        vl_current.inputUsdPerMillionTokens ??
        vl_tier.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens:
        vl_current.outputUsdPerMillionTokens ??
        vl_tier.outputUsdPerMillionTokens,
      cacheReadUsdPerMillionTokens:
        vl_current.cacheReadUsdPerMillionTokens ??
        vl_tier.cacheReadUsdPerMillionTokens,
      cacheWriteUsdPerMillionTokens:
        vl_current.cacheWriteUsdPerMillionTokens ??
        vl_tier.cacheWriteUsdPerMillionTokens,
    });
  }

  return [...vl_byThreshold.values()].sort(
    (p_left, p_right) =>
      p_left.contextThresholdTokens - p_right.contextThresholdTokens,
  );
}

function fh_mergeBenchmarks(
  p_existing: readonly ModelBenchmark[],
  p_incoming: readonly ModelBenchmark[],
): readonly ModelBenchmark[] {
  const vl_byId = new Map<BenchmarkId, ModelBenchmark>();

  for (const vl_benchmark of p_existing) {
    vl_byId.set(vl_benchmark.benchmarkId, vl_benchmark);
  }

  for (const vl_benchmark of p_incoming) {
    const vl_current = vl_byId.get(vl_benchmark.benchmarkId);

    if (vl_current === undefined) {
      vl_byId.set(vl_benchmark.benchmarkId, vl_benchmark);
      continue;
    }

    // A scored row is more informative than a placeholder row. Two different
    // scores keep the first source rather than inventing an average.
    if (vl_current.score === null && vl_benchmark.score !== null) {
      vl_byId.set(vl_benchmark.benchmarkId, vl_benchmark);
    }
  }

  return k_benchmarkIds
    .map((p_benchmarkId) => vl_byId.get(p_benchmarkId))
    .filter((p_benchmark): p_benchmark is ModelBenchmark =>
      p_benchmark !== undefined,
    );
}

function fh_hasPublishedPrice(p_pricing: ModelPricing): boolean {
  return (
    p_pricing.inputUsdPerMillionTokens !== null ||
    p_pricing.outputUsdPerMillionTokens !== null ||
    p_pricing.tiers.some(
      (p_tier) =>
        p_tier.inputUsdPerMillionTokens !== null ||
        p_tier.outputUsdPerMillionTokens !== null,
    )
  );
}

function fh_resolveNow(p_now: (() => Date) | undefined): Date {
  const vl_now = p_now?.() ?? new Date();

  if (!(vl_now instanceof Date) || !Number.isFinite(vl_now.getTime())) {
    return new Date();
  }

  return vl_now;
}