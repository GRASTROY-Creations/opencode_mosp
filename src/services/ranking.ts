/**
 * Pure sorting. No TUI, network, or cache dependencies.
 *
 * Missing values always stay last, in both directions. A tie is broken by the
 * stable model ID so repeated sorts are deterministic. Benchmark columns sort
 * by the reported score; no ranks are derived (Adjustment 22).
 */

import { f_findBenchmark, type BenchmarkId } from "../domain/model-benchmark";
import type { ModelRecord } from "../domain/model-record";
import type { ModelSortKey, SortDirection } from "../domain/model-sort";

const k_nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/**
 * Compare two records for one column. Exposed separately so callers can use the
 * exact comparator without allocating a sorted copy.
 */
export function f_compareModels(
  p_left: ModelRecord,
  p_right: ModelRecord,
  p_key: ModelSortKey,
  p_direction: SortDirection,
): number {
  const vl_left = fh_getSortValue(p_left, p_key);
  const vl_right = fh_getSortValue(p_right, p_key);

  // Missing values remain at the bottom regardless of direction.
  if (vl_left === null && vl_right === null) {
    return fh_compareIds(p_left.id, p_right.id);
  }

  if (vl_left === null) {
    return 1;
  }

  if (vl_right === null) {
    return -1;
  }

  const vl_comparison = fh_compareValues(p_key, vl_left, vl_right);

  if (vl_comparison === 0) {
    return fh_compareIds(p_left.id, p_right.id);
  }

  return p_direction === "asc" ? vl_comparison : -vl_comparison;
}

/** Return a sorted copy; the input array is never mutated. */
export function f_sortModels(
  p_models: readonly ModelRecord[],
  p_key: ModelSortKey,
  p_direction: SortDirection,
): readonly ModelRecord[] {
  return [...p_models].sort((p_left, p_right) =>
    f_compareModels(p_left, p_right, p_key, p_direction),
  );
}

function fh_getSortValue(p_model: ModelRecord, p_key: ModelSortKey): string | number | null {
  switch (p_key) {
    case "name":
      return p_model.name;

    case "providerName":
      return p_model.providerName;

    case "releaseDate":
      return p_model.releaseDate;

    case "contextWindow":
      return p_model.contextWindow;

    case "inputPrice":
      return p_model.pricing.inputUsdPerMillionTokens;

    case "outputPrice":
      return p_model.pricing.outputUsdPerMillionTokens;

    case "codingScore":
      return fh_getBenchmarkScore(p_model, "llbmCoding");

    case "intelligenceScore":
      return fh_getBenchmarkScore(p_model, "llbmIntelligence");

    default: {
      const vl_exhaustiveCheck: never = p_key;
      return vl_exhaustiveCheck;
    }
  }
}

function fh_getBenchmarkScore(p_model: ModelRecord, p_benchmarkId: BenchmarkId): number | null {
  return f_findBenchmark(p_model.benchmarks, p_benchmarkId)?.score ?? null;
}

function fh_compareValues(
  p_key: ModelSortKey,
  p_left: string | number,
  p_right: string | number,
): number {
  if (typeof p_left === "number" && typeof p_right === "number") {
    return p_left - p_right;
  }

  const vl_left = String(p_left);
  const vl_right = String(p_right);

  if (p_key === "name" || p_key === "providerName") {
    return k_nameCollator.compare(vl_left, vl_right);
  }

  return fh_compareIds(vl_left, vl_right);
}

/** Locale-independent tie-break so results do not depend on the host locale. */
function fh_compareIds(p_left: string, p_right: string): number {
  if (p_left < p_right) {
    return -1;
  }

  if (p_left > p_right) {
    return 1;
  }

  return 0;
}
