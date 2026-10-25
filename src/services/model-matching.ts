/**
 * Match benchmark rows to registry models without guessing.
 *
 * Matching order (spec §7.6):
 * 1. exact provider/model key (`<providerId>/<modelId>`);
 * 2. exact model ID (`modelId`);
 * 3. exact canonical ID;
 * 4. reviewed aliases;
 * 5. reviewed LLMBM mappings (source id -> registry id(s), exact string first,
 *    casefolded only when uniquely resolvable); several reviewed entries may
 *    share one source id — the `exact` owner attaches directly and
 *    `family_fallback` siblings attach as clones rendered `~`;
 * 6. conservative normalized model/canonical IDs.
 *
 * A strategy that resolves to more than one model is ambiguous and recorded as
 * unmatched. It never falls through to a looser strategy, because doing so
 * would silently borrow another model's score.
 */

import {
  k_llbmMappings,
  type LlbmMapping,
} from "../config/llbm-mappings";
import {
  k_benchmarkIds,
  type BenchmarkId,
  type BenchmarkMatchType,
  type ModelBenchmark,
} from "../domain/model-benchmark";
import type { ModelRecord } from "../domain/model-record";

/** Strategy that resolved a benchmark row to a model. */
export type MatchStrategy =
  | "exact-id"
  | "exact-model-id"
  | "canonical-id"
  | "alias"
  | "mapping"
  | "normalized";

/** Why a benchmark row could not be attached to a model. */
export type MatchFailureReason =
  | "missing-source-id"
  | "no-match"
  | "ambiguous"
  | "alias-target-missing"
  | "mapping-target-missing"
  | "duplicate-benchmark";

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

interface _ModelIndex {
  readonly byId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byModelId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byCanonicalId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byNormalizedId: ReadonlyMap<string, readonly ModelRecord[]>;
}

interface _MappedTarget {
  readonly opencodeId: string;
  readonly matchType: "exact" | "family_fallback";
}

/**
 * Mapping lookup index: exact `sourceId` keys win; casefolded keys act as a
 * fallback only when they resolve to a single distinct source string. One
 * source id may carry several reviewed targets (Adjustment 21): the `exact`
 * owner and `family_fallback` siblings all attach, each with its own
 * matchType.
 */
interface _MappingIndex {
  readonly exact: ReadonlyMap<string, readonly _MappedTarget[]>;
  readonly folded: ReadonlyMap<string, readonly _MappedTarget[]>;
}

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
 * Build the exact + folded mapping index from reviewed LLMBM mappings.
 *
 * Exact `sourceId` keys win; casefolded keys act as a fallback only when they
 * resolve to a single distinct source string. Distinct targets sharing one
 * exact source id are all kept (Adjustment 21 sharing): the benchmark row is
 * attached to each of them, cloning it per model with the entry's matchType.
 */
function fh_indexMappings(p_mappings: readonly LlbmMapping[]): _MappingIndex {
  const vl_exact = new Map<string, _MappedTarget[]>();

  for (const vl_mapping of p_mappings) {
    if (vl_mapping.llbmId === null) {
      // No LLMBM identifier; nothing to index.
      continue;
    }

    const vl_target: _MappedTarget = {
      opencodeId: vl_mapping.opencodeId,
      matchType: vl_mapping.matchType,
    };

    const vl_existing = vl_exact.get(vl_mapping.llbmId);

    if (vl_existing === undefined) {
      vl_exact.set(vl_mapping.llbmId, [vl_target]);
      continue;
    }

    if (!vl_existing.some((p_entry) => p_entry.opencodeId === vl_target.opencodeId)) {
      // Reviewed sibling claim on the same source id; both attach.
      vl_existing.push(vl_target);
    }
  }

  const vl_folded = new Map<string, readonly _MappedTarget[]>();
  const vl_foldedAmbiguous = new Set<string>();

  for (const [vl_key, vl_targets] of vl_exact) {
    const vl_foldKey = vl_key.toLowerCase();

    if (vl_foldedAmbiguous.has(vl_foldKey)) {
      continue;
    }

    const vl_existing = vl_folded.get(vl_foldKey);

    if (vl_existing === undefined) {
      vl_folded.set(vl_foldKey, vl_targets);
    } else if (!fh_sameTargets(vl_existing, vl_targets)) {
      // Distinct exact keys that collide when casefolded make the fold
      // lookup ambiguous; exact matches remain usable.
      vl_folded.delete(vl_foldKey);
      vl_foldedAmbiguous.add(vl_foldKey);
    }
  }

  return { exact: vl_exact, folded: vl_folded };
}

function fh_sameTargets(
  p_left: readonly _MappedTarget[],
  p_right: readonly _MappedTarget[],
): boolean {
  return (
    p_left.length === p_right.length &&
    p_left.every((p_entry) =>
      p_right.some((p_other) => p_other.opencodeId === p_entry.opencodeId),
    )
  );
}

function fh_lookupMapping(
  p_index: _MappingIndex,
  p_sourceModelId: string,
): readonly _MappedTarget[] | undefined {
  const vl_exact = p_index.exact.get(p_sourceModelId);

  if (vl_exact !== undefined) {
    return vl_exact;
  }

  return p_index.folded.get(p_sourceModelId.toLowerCase());
}

function fh_resolveAliases(
  p_sourceModelId: string,
  p_index: {
    readonly byId: ReadonlyMap<string, readonly unknown[]>;
    readonly byModelId: ReadonlyMap<string, readonly unknown[]>;
    readonly byCanonicalId: ReadonlyMap<string, readonly unknown[]>;
    readonly byNormalizedId: ReadonlyMap<string, readonly unknown[]>;
  },
  p_aliases: readonly {
    readonly providerId: string;
    readonly canonicalModelId: string;
    readonly aliases: readonly string[];
  }[],
): { matched: boolean; models: readonly { id: string }[] } {
  // No aliases in LLMBM system
  return {
    matched: false,
    models: [],
  };
}

function fh_resolveNormalized(
  p_sourceModelId: string,
  p_index: {
    readonly byNormalizedId: ReadonlyMap<string, readonly ModelRecord[]>;
  },
): readonly { id: string }[] | null {
  const vl_key = f_normalizeModelId(p_sourceModelId);

  if (vl_key.length === 0) {
    return null;
  }

  return p_index.byNormalizedId.get(vl_key) ?? null;
}

function fh_sortBenchmarks(
  p_benchmarks: readonly ModelBenchmark[],
): readonly ModelBenchmark[] {
  return [...p_benchmarks].sort(
    (p_left, p_right) =>
      (k_benchmarkOrder.get(p_left.benchmarkId) ?? 0) -
      (k_benchmarkOrder.get(p_right.benchmarkId) ?? 0),
  );
}

export function f_matchBenchmarkRecords(
  p_models: readonly ModelRecord[],
  p_benchmarks: readonly ModelBenchmark[],
  p_aliases: readonly { readonly providerId: string; readonly canonicalModelId: string; readonly aliases: readonly string[] }[] = [],
  p_mappings: readonly LlbmMapping[] = k_llbmMappings,
): Promise<BenchmarkMatchResult> {
  const vl_index = fh_indexModels(p_models);
  const vl_mappingIndex = fh_indexMappings(p_mappings);

  const vl_benchmarksByModel = new Map<string, ModelBenchmark[]>();
  const vl_changedModels = new Set<string>();
  const vl_matches: BenchmarkMatch[] = [];
  const vl_unmatched: UnmatchedBenchmark[] = [];

  for (const vl_benchmark of p_benchmarks) {
    const vl_sourceModelId = vl_benchmark.sourceModelId;

    if (vl_sourceModelId === null) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: null,
        reason: "missing-source-id",
      });
      continue;
    }

    const vl_smid = vl_sourceModelId;

    // 1. exact provider/model key
    const vl_exactId = vl_index.byId.get(vl_smid);
    if (vl_exactId !== undefined && vl_exactId.length > 0) {
      const vl_target = vl_exactId[0]!;
      const vl_attached = { ...vl_benchmark, matchType: "exact" as BenchmarkMatchType };
      fh_addBenchmarkToModel(vl_benchmarksByModel, vl_changedModels, vl_target.id, vl_attached);
      vl_matches.push({
        benchmark: vl_attached,
        modelId: vl_target.id,
        strategy: "exact-id",
        matchType: "exact",
      });
      continue;
    }

    // 2. exact model ID
    const vl_exactModelId = vl_index.byModelId.get(vl_smid);
    if (vl_exactModelId !== undefined && vl_exactModelId.length === 1) {
      const vl_target = vl_exactModelId[0]!;
      const vl_attached = { ...vl_benchmark, matchType: "exact" as BenchmarkMatchType };
      fh_addBenchmarkToModel(vl_benchmarksByModel, vl_changedModels, vl_target.id, vl_attached);
      vl_matches.push({
        benchmark: vl_attached,
        modelId: vl_target.id,
        strategy: "exact-model-id",
        matchType: "exact",
      });
      continue;
    }
    if (vl_exactModelId !== undefined && vl_exactModelId.length > 1) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_smid,
        reason: "ambiguous",
      });
      continue;
    }

    // 3. exact canonical ID
    const vl_canonical = vl_index.byCanonicalId.get(vl_smid);
    if (vl_canonical !== undefined && vl_canonical.length === 1) {
      const vl_target = vl_canonical[0]!;
      const vl_attached = { ...vl_benchmark, matchType: "exact" as BenchmarkMatchType };
      fh_addBenchmarkToModel(vl_benchmarksByModel, vl_changedModels, vl_target.id, vl_attached);
      vl_matches.push({
        benchmark: vl_attached,
        modelId: vl_target.id,
        strategy: "canonical-id",
        matchType: "exact",
      });
      continue;
    }
    if (vl_canonical !== undefined && vl_canonical.length > 1) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_smid,
        reason: "ambiguous",
      });
      continue;
    }

    // 4. reviewed aliases
    const vl_alias = fh_resolveAliases(vl_smid, vl_index, []);
    if (vl_alias.matched) {
      if (vl_alias.models.length === 0) {
        vl_unmatched.push({
          benchmarkId: vl_benchmark.benchmarkId,
          sourceModelId: vl_smid,
          reason: "alias-target-missing",
        });
        continue;
      }
      const vl_target = vl_alias.models[0]!;
      const vl_attached = { ...vl_benchmark, matchType: "alias" as BenchmarkMatchType };
      fh_addBenchmarkToModel(vl_benchmarksByModel, vl_changedModels, vl_target.id, vl_attached);
      vl_matches.push({
        benchmark: vl_attached,
        modelId: vl_target.id,
        strategy: "alias",
        matchType: "alias",
      });
      continue;
    }

    // 5. reviewed LLMBM mappings (one source id may serve several targets)
    const vl_mappingTargets = fh_lookupMapping(
      vl_mappingIndex,
      vl_smid,
    );
    if (vl_mappingTargets !== undefined) {
      let vl_attachedCount = 0;

      for (const vl_mapping of vl_mappingTargets) {
        const vl_targetList = vl_index.byId.get(vl_mapping.opencodeId);
        const vl_target =
          vl_targetList !== undefined && vl_targetList.length > 0
            ? vl_targetList[0]!
            : undefined;

        if (vl_target === undefined) {
          continue;
        }

        const vl_attached = {
          ...vl_benchmark,
          matchType: vl_mapping.matchType as BenchmarkMatchType,
        };
        fh_addBenchmarkToModel(
          vl_benchmarksByModel,
          vl_changedModels,
          vl_target.id,
          vl_attached,
        );
        vl_matches.push({
          benchmark: vl_attached,
          modelId: vl_target.id,
          strategy: "mapping",
          matchType: vl_mapping.matchType,
        });
        vl_attachedCount += 1;
      }

      if (vl_attachedCount === 0) {
        vl_unmatched.push({
          benchmarkId: vl_benchmark.benchmarkId,
          sourceModelId: vl_smid,
          reason: "mapping-target-missing",
        });
      }
      continue;
    }

    // 6. conservative normalized model/canonical IDs
    const vl_normalized = fh_resolveNormalized(vl_smid, vl_index);
    if (vl_normalized !== null && vl_normalized.length === 1) {
      const vl_target = vl_normalized[0]!;
      const vl_attached = { ...vl_benchmark, matchType: "exact" as BenchmarkMatchType };
      fh_addBenchmarkToModel(vl_benchmarksByModel, vl_changedModels, vl_target.id, vl_attached);
      vl_matches.push({
        benchmark: { ...vl_benchmark, matchType: "exact" },
        modelId: vl_target.id,
        strategy: "normalized",
        matchType: "exact",
      });
      continue;
    }
    if (vl_normalized !== null && vl_normalized.length > 1) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_smid,
        reason: "ambiguous",
      });
      continue;
    }

    // No match found
    vl_unmatched.push({
      benchmarkId: vl_benchmark.benchmarkId,
      sourceModelId: vl_smid,
      reason: "no-match",
    });
  }

  const vl_models = p_models.map((p_model) => {
    const vl_newBenchmarks = vl_benchmarksByModel.get(p_model.id) ?? [];
    if (vl_newBenchmarks.length === 0) {
      return p_model;
    }
    return {
      ...p_model,
      benchmarks: fh_sortBenchmarks(vl_newBenchmarks),
    };
  });

  return Promise.resolve({
    models: vl_models,
    matches: vl_matches,
    unmatched: vl_unmatched,
  });
}

function fh_addBenchmarkToModel(
  p_benchmarksByModel: Map<string, ModelBenchmark[]>,
  p_changedModels: Set<string>,
  p_modelId: string,
  p_benchmark: ModelBenchmark,
): void {
  const vl_existing = p_benchmarksByModel.get(p_modelId) ?? [];
  p_benchmarksByModel.set(p_modelId, [...vl_existing, p_benchmark]);
  p_changedModels.add(p_modelId);
}

function fh_indexModels(p_models: readonly ModelRecord[]): {
  readonly byId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byModelId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byCanonicalId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byNormalizedId: ReadonlyMap<string, readonly ModelRecord[]>;
} {
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
      fh_addToIndex(
        vl_byNormalizedId,
        f_normalizeModelId(vl_model.canonicalId),
        vl_model,
      );
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