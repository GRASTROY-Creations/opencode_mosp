/**
 * The normalized model record every adapter and service shares.
 *
 * `id` is a stable domain key (`<providerId>/<modelId>`), while `modelId` and
 * `canonicalId` preserve the registry's raw identifiers for troubleshooting and
 * matching. A record may legitimately have no price and no benchmark results;
 * those states are represented by explicit nulls and by an empty `benchmarks`
 * array, never by fabricated numbers.
 */

import {
  f_fail,
  f_isRecord,
  f_ok,
  f_parseEnum,
  f_parseNonEmptyString,
  f_parseNullablePositiveInteger,
  f_parseNullableString,
  f_parseNullableTimestamp,
  f_parseTimestamp,
  type DomainResult,
} from "./guards";
import {
  f_findBenchmark,
  f_validateModelBenchmark,
  type BenchmarkId,
  type ModelBenchmark,
} from "./model-benchmark";
import { f_validateModelPricing, type ModelPricing } from "./model-pricing";

/** Where a record was assembled from. */
export type ModelSource = "opencode" | "inference" | "merged";

/** Runtime list used by parsers. */
export const k_modelSources: readonly ModelSource[] = ["opencode", "inference", "merged"];

/** One provider-independent model row rendered by the overview. */
export interface ModelRecord {
  /** Stable domain key: `<providerId>/<modelId>`. */
  readonly id: string;
  /** Raw model identifier inside the provider (registry `modelID`). */
  readonly modelId: string;
  /** Registry-level canonical identifier, when the registry reports one. */
  readonly canonicalId: string | null;
  readonly name: string;
  readonly providerId: string;
  readonly providerName: string;
  /** First release date (ISO-8601 UTC); `null` when unknown. */
  readonly releaseDate: string | null;
  /** Context window in tokens; `null` when unknown. */
  readonly contextWindow: number | null;
  readonly pricing: ModelPricing;
  /** Only benchmarks that actually have a result; may be empty. */
  readonly benchmarks: readonly ModelBenchmark[];
  readonly source: ModelSource;
  /** When this record was last assembled/refreshed (ISO-8601 UTC). */
  readonly lastUpdatedAt: string;
}

/**
 * Build the stable domain key. Provider and model IDs must already be
 * non-empty and must not contain a slash (they are registry identifiers).
 */
export function f_createModelId(p_providerId: string, p_modelId: string): string {
  return `${p_providerId}/${p_modelId}`;
}

/** Find a model's result for one benchmark; `null` when it has none. */
export function f_getBenchmarkForModel(
  p_model: ModelRecord,
  p_benchmarkId: BenchmarkId,
): ModelBenchmark | null {
  return f_findBenchmark(p_model.benchmarks, p_benchmarkId);
}

/** Validate a normalized model record before it enters a snapshot. */
export function f_validateModelRecord(p_value: unknown): DomainResult<ModelRecord> {
  if (!f_isRecord(p_value)) {
    return f_fail("model must be an object");
  }

  const vl_id = f_parseNonEmptyString(p_value.id, "model.id");

  if (!vl_id.ok) {
    return vl_id;
  }

  const vl_modelId = f_parseNonEmptyString(p_value.modelId, "model.modelId");

  if (!vl_modelId.ok) {
    return vl_modelId;
  }

  const vl_canonicalId = f_parseNullableString(p_value.canonicalId, "model.canonicalId");

  if (!vl_canonicalId.ok) {
    return vl_canonicalId;
  }

  const vl_name = f_parseNonEmptyString(p_value.name, "model.name");

  if (!vl_name.ok) {
    return vl_name;
  }

  const vl_providerId = f_parseNonEmptyString(p_value.providerId, "model.providerId");

  if (!vl_providerId.ok) {
    return vl_providerId;
  }

  const vl_providerName = f_parseNonEmptyString(p_value.providerName, "model.providerName");

  if (!vl_providerName.ok) {
    return vl_providerName;
  }

  // `id` is the documented stable key, not an arbitrary label. Mismatches
  // would make matching and cache keys disagree.
  if (vl_id.value !== f_createModelId(vl_providerId.value, vl_modelId.value)) {
    return f_fail("model.id must equal <providerId>/<modelId>");
  }

  const vl_releaseDate = f_parseNullableTimestamp(p_value.releaseDate, "model.releaseDate");

  if (!vl_releaseDate.ok) {
    return vl_releaseDate;
  }

  const vl_contextWindow = f_parseNullablePositiveInteger(
    p_value.contextWindow,
    "model.contextWindow",
  );

  if (!vl_contextWindow.ok) {
    return vl_contextWindow;
  }

  const vl_pricing = f_validateModelPricing(p_value.pricing);

  if (!vl_pricing.ok) {
    return vl_pricing;
  }

  const vl_benchmarks = fh_validateBenchmarks(p_value.benchmarks);

  if (!vl_benchmarks.ok) {
    return vl_benchmarks;
  }

  const vl_source = f_parseEnum(p_value.source, k_modelSources, "model.source");

  if (!vl_source.ok) {
    return vl_source;
  }

  const vl_lastUpdatedAt = f_parseTimestamp(p_value.lastUpdatedAt, "model.lastUpdatedAt");

  if (!vl_lastUpdatedAt.ok) {
    return vl_lastUpdatedAt;
  }

  return f_ok({
    id: vl_id.value,
    modelId: vl_modelId.value,
    canonicalId: vl_canonicalId.value,
    name: vl_name.value,
    providerId: vl_providerId.value,
    providerName: vl_providerName.value,
    releaseDate: vl_releaseDate.value,
    contextWindow: vl_contextWindow.value,
    pricing: vl_pricing.value,
    benchmarks: vl_benchmarks.value,
    source: vl_source.value,
    lastUpdatedAt: vl_lastUpdatedAt.value,
  });
}

function fh_validateBenchmarks(p_value: unknown): DomainResult<readonly ModelBenchmark[]> {
  if (!Array.isArray(p_value)) {
    return f_fail("model.benchmarks must be an array");
  }

  const vl_entries: readonly unknown[] = p_value;
  const vl_benchmarks: ModelBenchmark[] = [];
  const vl_seenIds = new Set<BenchmarkId>();

  for (const vl_entry of vl_entries) {
    const vl_benchmark = f_validateModelBenchmark(vl_entry);

    if (!vl_benchmark.ok) {
      return vl_benchmark;
    }

    // At most one row per benchmark id. Duplicates would make score lookups
    // order-dependent and hide a bad merge.
    if (vl_seenIds.has(vl_benchmark.value.benchmarkId)) {
      return f_fail(
        `model.benchmarks contains duplicate ${vl_benchmark.value.benchmarkId} entries`,
      );
    }

    vl_seenIds.add(vl_benchmark.value.benchmarkId);
    vl_benchmarks.push(vl_benchmark.value);
  }

  return f_ok(vl_benchmarks);
}
