/**
 * Match benchmark rows to registry models without guessing.
 *
 * Matching order (spec §7.6), applied to each row's `sourceModelId`:
 * 1. exact provider/model key (`<providerId>/<modelId>`);
 * 2. exact model ID (`modelId`);
 * 3. exact canonical ID;
 * 4. reviewed LLMBM mappings (source id -> registry id(s), exact string first,
 *    casefolded only when uniquely resolvable); several reviewed entries may
 *    share one source id — the `exact` owner attaches directly and
 *    `family_fallback` siblings attach as clones rendered `~`;
 * 5. conservative normalized model/canonical IDs.
 *
 * A strategy that resolves to more than one model is ambiguous and recorded as
 * unmatched. It never falls through to a looser strategy, because doing so
 * would silently borrow another model's score. Rows are matched per
 * benchmark id, so one source model can feed both LLMBM columns.
 */

import { k_llbmMappings, type LlbmMapping } from "../config/llbm-mappings";
import {
  k_benchmarkIds,
  type BenchmarkId,
  type BenchmarkMatchType,
  type ModelBenchmark,
} from "../domain/model-benchmark";
import type { ModelRecord } from "../domain/model-record";

/** Strategy that resolved a benchmark row to a model. */
export type MatchStrategy =
  "exact-id" | "exact-model-id" | "canonical-id" | "mapping" | "normalized";

/** Why a benchmark row could not be attached to a model. */
export type MatchFailureReason =
  "missing-source-id" | "no-match" | "ambiguous" | "mapping-target-missing" | "duplicate-benchmark";

/** A benchmark row successfully attached during this match run. */
export interface BenchmarkMatch {
  readonly benchmark: ModelBenchmark;
  /** Stable domain key of the target model. */
  readonly modelId: string;
  readonly strategy: MatchStrategy;
  /** Relation kind recorded on the attached benchmark row. */
  readonly matchType: BenchmarkMatchType;
}

/** A benchmark row that was deliberately left unattached. */
export interface UnmatchedBenchmark {
  readonly benchmarkId: BenchmarkId;
  readonly sourceModelId: string | null;
  readonly reason: MatchFailureReason;
}

/** Result of matching one or more benchmark sources to a model catalog. */
export interface BenchmarkMatchResult {
  readonly models: readonly ModelRecord[];
  readonly matches: readonly BenchmarkMatch[];
  readonly unmatched: readonly UnmatchedBenchmark[];
}

type _Index = ReadonlyMap<string, readonly ModelRecord[]>;

interface _ModelIndex {
  readonly byId: _Index;
  readonly byModelId: _Index;
  readonly byCanonicalId: _Index;
  readonly byNormalizedId: _Index;
}

interface _MappedTarget {
  readonly opencodeId: string;
  readonly matchType: BenchmarkMatchType;
}

/**
 * Mapping lookup index: exact `llbmId` keys win; casefolded keys act as a
 * fallback only when they resolve to a single distinct source string. One
 * source id may carry several reviewed targets (Adjustment 21): the `exact`
 * owner and `family_fallback` siblings all attach, each with its own
 * matchType.
 */
interface _MappingIndex {
  readonly exact: ReadonlyMap<string, readonly _MappedTarget[]>;
  readonly folded: ReadonlyMap<string, readonly _MappedTarget[]>;
}

/** Outcome of the id-based strategies (1-3, 5) for one source id. */
type _Resolution =
  | { readonly kind: "match"; readonly model: ModelRecord }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "none" };

const k_benchmarkOrder = new Map<BenchmarkId, number>(
  k_benchmarkIds.map((p_id, p_index) => [p_id, p_index] as const),
);

/**
 * Conservative source-ID normalization. Only trims, lowercases, and converts
 * underscores to dashes. Provider prefixes, version suffixes, and punctuation
 * are preserved: removing them can merge distinct models.
 */
export function f_normalizeModelId(p_modelId: string): string {
  return p_modelId.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Attach benchmark rows to the models they belong to.
 *
 * Attached rows are merged into each model's existing `benchmarks`; a second
 * row for a benchmark id the model already carries is reported as
 * `duplicate-benchmark` and dropped (never overwritten). Inputs are not
 * mutated.
 */
export function f_matchBenchmarkRecords(
  p_models: readonly ModelRecord[],
  p_benchmarks: readonly ModelBenchmark[],
  p_mappings: readonly LlbmMapping[] = k_llbmMappings,
): BenchmarkMatchResult {
  const vl_index = fh_indexModels(p_models);
  const vl_mappingIndex = fh_indexMappings(p_mappings);

  const vl_benchmarksByModel = new Map<string, ModelBenchmark[]>(
    p_models.map((p_model) => [p_model.id, [...p_model.benchmarks]] as const),
  );
  const vl_matches: BenchmarkMatch[] = [];
  const vl_unmatched: UnmatchedBenchmark[] = [];

  const fh_reject = (p_benchmark: ModelBenchmark, p_reason: MatchFailureReason): void => {
    vl_unmatched.push({
      benchmarkId: p_benchmark.benchmarkId,
      sourceModelId: p_benchmark.sourceModelId,
      reason: p_reason,
    });
  };

  const fh_attach = (
    p_model: ModelRecord,
    p_benchmark: ModelBenchmark,
    p_strategy: MatchStrategy,
    p_matchType: BenchmarkMatchType,
  ): void => {
    const vl_rows = vl_benchmarksByModel.get(p_model.id) ?? [];

    if (vl_rows.some((p_row) => p_row.benchmarkId === p_benchmark.benchmarkId)) {
      fh_reject(p_benchmark, "duplicate-benchmark");
      return;
    }

    const vl_attached: ModelBenchmark = { ...p_benchmark, matchType: p_matchType };
    vl_rows.push(vl_attached);
    vl_benchmarksByModel.set(p_model.id, vl_rows);
    vl_matches.push({
      benchmark: vl_attached,
      modelId: p_model.id,
      strategy: p_strategy,
      matchType: p_matchType,
    });
  };

  for (const vl_benchmark of p_benchmarks) {
    const vl_sourceModelId = vl_benchmark.sourceModelId;

    if (vl_sourceModelId === null) {
      fh_reject(vl_benchmark, "missing-source-id");
      continue;
    }

    // 1-3. exact registry keys, strictest first.
    const vl_exactSteps: readonly [_Index, string, MatchStrategy][] = [
      [vl_index.byId, vl_sourceModelId, "exact-id"],
      [vl_index.byModelId, vl_sourceModelId, "exact-model-id"],
      [vl_index.byCanonicalId, vl_sourceModelId, "canonical-id"],
    ];
    let vl_resolved = false;

    for (const [vl_map, vl_key, vl_strategy] of vl_exactSteps) {
      const vl_result = fh_resolve(vl_map, vl_key);

      if (vl_result.kind === "none") {
        continue;
      }

      if (vl_result.kind === "ambiguous") {
        fh_reject(vl_benchmark, "ambiguous");
      } else {
        fh_attach(vl_result.model, vl_benchmark, vl_strategy, "exact");
      }

      vl_resolved = true;
      break;
    }

    if (vl_resolved) {
      continue;
    }

    // 4. reviewed LLMBM mappings (one source id may serve several targets).
    const vl_mappingTargets = fh_lookupMapping(vl_mappingIndex, vl_sourceModelId);

    if (vl_mappingTargets !== undefined) {
      let vl_found = false;

      for (const vl_target of vl_mappingTargets) {
        const vl_model = vl_index.byId.get(vl_target.opencodeId)?.[0];

        if (vl_model !== undefined) {
          fh_attach(vl_model, vl_benchmark, "mapping", vl_target.matchType);
          vl_found = true;
        }
      }

      if (!vl_found) {
        fh_reject(vl_benchmark, "mapping-target-missing");
      }
      continue;
    }

    // 5. conservative normalized model/canonical IDs.
    const vl_normalizedKey = f_normalizeModelId(vl_sourceModelId);
    const vl_normalized =
      vl_normalizedKey.length === 0
        ? ({ kind: "none" } as const)
        : fh_resolve(vl_index.byNormalizedId, vl_normalizedKey);

    if (vl_normalized.kind === "match") {
      fh_attach(vl_normalized.model, vl_benchmark, "normalized", "exact");
    } else {
      fh_reject(vl_benchmark, vl_normalized.kind === "ambiguous" ? "ambiguous" : "no-match");
    }
  }

  const vl_models = p_models.map((p_model) => {
    const vl_rows = vl_benchmarksByModel.get(p_model.id) ?? [];

    return vl_rows.length === p_model.benchmarks.length
      ? p_model
      : { ...p_model, benchmarks: fh_sortBenchmarks(vl_rows) };
  });

  return {
    models: vl_models,
    matches: vl_matches,
    unmatched: vl_unmatched,
  };
}

function fh_resolve(p_index: _Index, p_key: string): _Resolution {
  const vl_models = p_index.get(p_key) ?? [];
  const vl_model = vl_models[0];

  if (vl_model === undefined) {
    return { kind: "none" };
  }

  if (vl_models.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "match", model: vl_model };
}

/**
 * Build the exact + folded mapping index from reviewed LLMBM mappings.
 *
 * Distinct targets sharing one exact source id are all kept (Adjustment 21
 * sharing): the benchmark row is attached to each of them, cloned per model
 * with the entry's matchType. Distinct exact keys that collide when casefolded
 * drop only the folded lookup; the exact keys stay usable.
 */
function fh_indexMappings(p_mappings: readonly LlbmMapping[]): _MappingIndex {
  const vl_exact = new Map<string, _MappedTarget[]>();

  for (const vl_mapping of p_mappings) {
    if (vl_mapping.llbmId === null) {
      // Reviewed "no LLMBM equivalent"; nothing to index.
      continue;
    }

    const vl_targets = vl_exact.get(vl_mapping.llbmId) ?? [];

    if (!vl_targets.some((p_entry) => p_entry.opencodeId === vl_mapping.opencodeId)) {
      vl_targets.push({
        opencodeId: vl_mapping.opencodeId,
        matchType: vl_mapping.matchType,
      });
    }

    vl_exact.set(vl_mapping.llbmId, vl_targets);
  }

  const vl_folded = new Map<string, readonly _MappedTarget[]>();
  const vl_foldedAmbiguous = new Set<string>();

  for (const [vl_key, vl_targets] of vl_exact) {
    const vl_foldKey = vl_key.toLowerCase();

    if (vl_foldedAmbiguous.has(vl_foldKey)) {
      continue;
    }

    if (vl_folded.has(vl_foldKey)) {
      vl_folded.delete(vl_foldKey);
      vl_foldedAmbiguous.add(vl_foldKey);
      continue;
    }

    vl_folded.set(vl_foldKey, vl_targets);
  }

  return { exact: vl_exact, folded: vl_folded };
}

function fh_lookupMapping(
  p_index: _MappingIndex,
  p_sourceModelId: string,
): readonly _MappedTarget[] | undefined {
  return p_index.exact.get(p_sourceModelId) ?? p_index.folded.get(p_sourceModelId.toLowerCase());
}

function fh_sortBenchmarks(p_benchmarks: readonly ModelBenchmark[]): readonly ModelBenchmark[] {
  return [...p_benchmarks].sort(
    (p_left, p_right) =>
      (k_benchmarkOrder.get(p_left.benchmarkId) ?? 0) -
      (k_benchmarkOrder.get(p_right.benchmarkId) ?? 0),
  );
}

function fh_indexModels(p_models: readonly ModelRecord[]): _ModelIndex {
  const vl_byId = new Map<string, ModelRecord[]>();
  const vl_byModelId = new Map<string, ModelRecord[]>();
  const vl_byCanonicalId = new Map<string, ModelRecord[]>();
  const vl_byNormalizedId = new Map<string, ModelRecord[]>();

  for (const vl_model of p_models) {
    fh_addToIndex(vl_byId, vl_model.id, vl_model);
    fh_addToIndex(vl_byModelId, vl_model.modelId, vl_model);
    fh_addToIndex(vl_byNormalizedId, f_normalizeModelId(vl_model.modelId), vl_model);

    if (vl_model.canonicalId !== null) {
      fh_addToIndex(vl_byCanonicalId, vl_model.canonicalId, vl_model);
      fh_addToIndex(vl_byNormalizedId, f_normalizeModelId(vl_model.canonicalId), vl_model);
    }
  }

  return {
    byId: vl_byId,
    byModelId: vl_byModelId,
    byCanonicalId: vl_byCanonicalId,
    byNormalizedId: vl_byNormalizedId,
  };
}

function fh_addToIndex(
  p_index: Map<string, ModelRecord[]>,
  p_key: string,
  p_model: ModelRecord,
): void {
  const vl_existing = p_index.get(p_key);

  if (vl_existing === undefined) {
    p_index.set(p_key, [p_model]);
    return;
  }

  if (!vl_existing.some((p_entry) => p_entry.id === p_model.id)) {
    vl_existing.push(p_model);
  }
}
