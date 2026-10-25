/**
 * Pure sorting and rank derivation. No TUI, network, or cache dependencies.
 *
 * Missing values always stay last, in both directions. A tie is broken by the
 * stable model ID so repeated sorts are deterministic. Score and rank remain
 * distinct columns: rank 1 first is not the same operation as highest score
 * first, even though both are derived from the same benchmark.
 */

import {
  f_findBenchmark,
  k_benchmarkIds,
  type BenchmarkId,
} from "../domain/model-benchmark";
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

/**
 * Derive ranks from normalized scores for every benchmark.
 *
 * Uses competition ranking: equal scores share a rank and the next distinct
 * score skips positions (1, 1, 3). Ties are ordered by model ID only for
 * deterministic traversal; they still receive the same rank. A benchmark with
 * no score keeps `rank: null`. Existing source ranks are overwritten because
 * GPQA's published rank mixes subsets and is not usable for Diamond.
 */
export function f_assignBenchmarkRanks(
  p_models: readonly ModelRecord[],
): readonly ModelRecord[] {
  const vl_ranks = new Map<string, Map<BenchmarkId, number>>();

  for (const vl_benchmarkId of k_benchmarkIds) {
    const vl_scored: { readonly modelId: string; readonly score: number }[] = [];

    for (const vl_model of p_models) {
      const vl_benchmark = f_findBenchmark(
        vl_model.benchmarks,
        vl_benchmarkId,
      );

      if (vl_benchmark !== null && vl_benchmark.score !== null) {
        vl_scored.push({
          modelId: vl_model.id,
          score: vl_benchmark.score,
        });
      }
    }

    vl_scored.sort(
      (p_left, p_right) =>
        p_right.score - p_left.score ||
        fh_compareIds(p_left.modelId, p_right.modelId),
    );

    let vl_previousScore: number | null = null;
    let vl_previousRank = 0;

    for (const [vl_index, vl_entry] of vl_scored.entries()) {
      const vl_rank =
        vl_entry.score === vl_previousScore ? vl_previousRank : vl_index + 1;

      vl_previousScore = vl_entry.score;
      vl_previousRank = vl_rank;

      const vl_modelRanks =
        vl_ranks.get(vl_entry.modelId) ?? new Map<BenchmarkId, number>();
      vl_modelRanks.set(vl_benchmarkId, vl_rank);
      vl_ranks.set(vl_entry.modelId, vl_modelRanks);
    }
  }

  return p_models.map((p_model) => {
    const vl_modelRanks = vl_ranks.get(p_model.id);
    let vl_changed = false;

    const vl_benchmarks = p_model.benchmarks.map((p_benchmark) => {
      const vl_rank =
        p_benchmark.score === null
          ? null
          : (vl_modelRanks?.get(p_benchmark.benchmarkId) ?? null);

      if (vl_rank === p_benchmark.rank) {
        return p_benchmark;
      }

      vl_changed = true;

      return {
        ...p_benchmark,
        rank: vl_rank,
      };
    });

    if (!vl_changed) {
      return p_model;
    }

    return {
      ...p_model,
      benchmarks: vl_benchmarks,
    };
  });
}

function fh_getSortValue(
  p_model: ModelRecord,
  p_key: ModelSortKey,
): string | number | null {
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

    case "gpqaScore":
      return fh_getBenchmarkValue(p_model, "gpqa", "score");

    case "gpqaRank":
      return fh_getBenchmarkValue(p_model, "gpqa", "rank");

    case "livecodebenchScore":
      return fh_getBenchmarkValue(p_model, "livecodebench", "score");

    case "livecodebenchRank":
      return fh_getBenchmarkValue(p_model, "livecodebench", "rank");

    default: {
      const vl_exhaustiveCheck: never = p_key;
      return vl_exhaustiveCheck;
    }
  }
}

function fh_getBenchmarkValue(
  p_model: ModelRecord,
  p_benchmarkId: BenchmarkId,
  p_field: "score" | "rank",
): number | null {
  const vl_benchmark = f_findBenchmark(p_model.benchmarks, p_benchmarkId);

  if (vl_benchmark === null) {
    return null;
  }

  return p_field === "score" ? vl_benchmark.score : vl_benchmark.rank;
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
