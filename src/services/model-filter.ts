/**
 * Table filters over normalized records.
 *
 * Filters are composable and never mutate the catalog. A missing benchmark
 * result is not a score: presence checks require a non-null `score`, so a
 * placeholder row cannot satisfy a "present" filter.
 */

import { f_findBenchmark, type BenchmarkId } from "../domain/model-benchmark";
import { f_isFreeModelPricing } from "../domain/model-pricing";
import type { ModelRecord } from "../domain/model-record";

/** `all` checks whether any benchmark result exists. */
export type BenchmarkPresenceScope = "all" | BenchmarkId;

/** Keep models that either have or lack the selected benchmark result. */
export interface BenchmarkPresenceFilter {
  readonly scope: BenchmarkPresenceScope;
  readonly state: "present" | "missing";
}

/** Optional filters; an omitted/empty option means "no restriction". */
export interface ModelFilterOptions {
  /** Exact provider IDs; empty or omitted shows every provider. */
  readonly providerIds?: readonly string[];
  /** Require a result (or its absence) for one benchmark or for any result. */
  readonly benchmarkPresence?: BenchmarkPresenceFilter;
  /** Keep only models whose published base and tier prices are all zero. */
  readonly freeOnly?: boolean;
}

/** Apply provider, benchmark-presence, and free-model filters. */
export function f_filterModels(
  p_models: readonly ModelRecord[],
  p_options: ModelFilterOptions = {},
): readonly ModelRecord[] {
  const vl_providerIds = new Set(p_options.providerIds ?? []);
  const vl_presence = p_options.benchmarkPresence;
  const vl_freeOnly = p_options.freeOnly === true;

  return p_models.filter((p_model) => {
    if (vl_providerIds.size > 0 && !vl_providerIds.has(p_model.providerId)) {
      return false;
    }

    if (vl_presence !== undefined && !fh_matchesPresence(p_model, vl_presence)) {
      return false;
    }

    if (vl_freeOnly && !f_isFreeModelPricing(p_model.pricing)) {
      return false;
    }

    return true;
  });
}

function fh_matchesPresence(p_model: ModelRecord, p_filter: BenchmarkPresenceFilter): boolean {
  const vl_present =
    p_filter.scope === "all"
      ? p_model.benchmarks.some((p_entry) => p_entry.score !== null)
      : fh_hasBenchmarkScore(p_model, p_filter.scope);

  return p_filter.state === "present" ? vl_present : !vl_present;
}

function fh_hasBenchmarkScore(p_model: ModelRecord, p_benchmarkId: BenchmarkId): boolean {
  const vl_benchmark = f_findBenchmark(p_model.benchmarks, p_benchmarkId);

  return vl_benchmark !== null && vl_benchmark.score !== null;
}
