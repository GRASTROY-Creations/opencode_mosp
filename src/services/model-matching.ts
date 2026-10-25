/**
 * Match benchmark rows to registry models without guessing.
 *
 * Matching order (spec §7.6):
 * 1. exact provider/model key (`<providerId>/<modelId>`);
 * 2. exact model ID (`modelId`);
 * 3. exact canonical ID;
 * 4. reviewed aliases;
 * 5. reviewed benchmark mappings (source id -> registry id, per benchmark; exact
 *    string first, casefolded only when uniquely resolvable);
 * 6. conservative normalized model/canonical IDs.
 *
 * A strategy that resolves to more than one model is ambiguous and recorded as
 * unmatched. It never falls through to a looser strategy, because doing so
 * would silently borrow another model's score.
 */

import {
  k_benchmarkMappings,
  type BenchmarkMapping,
} from "../config/benchmark-mappings";
import {
  k_modelAliases,
  type ModelAlias,
} from "../config/model-aliases";
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

interface ModelIndex {
  readonly byId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byModelId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byCanonicalId: ReadonlyMap<string, readonly ModelRecord[]>;
  readonly byNormalizedId: ReadonlyMap<string, readonly ModelRecord[]>;
}

interface AliasResolution {
  readonly matched: boolean;
  readonly models: readonly ModelRecord[];
}

interface MatchResolution {
  readonly models: readonly ModelRecord[];
  readonly strategy: MatchStrategy;
  readonly aliasMatchedWithoutTarget: boolean;
  readonly mappingMatchedWithoutTarget: boolean;
  readonly matchType: BenchmarkMatchType | null;
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
 * Attach benchmark rows to models. Returns new records; the input array and
 * records are never mutated. Unmatched rows carry a reason for status display.
 */
export function f_matchBenchmarkRecords(
  p_models: readonly ModelRecord[],
  p_benchmarks: readonly ModelBenchmark[],
  p_aliases: readonly ModelAlias[] = k_modelAliases,
  p_mappings: readonly BenchmarkMapping[] = k_benchmarkMappings,
): BenchmarkMatchResult {
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

    const vl_resolution = fh_resolveModel(
      vl_benchmark.benchmarkId,
      vl_sourceModelId,
      vl_index,
      p_aliases,
      vl_mappingIndex,
    );

    if (vl_resolution.aliasMatchedWithoutTarget) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "alias-target-missing",
      });
      continue;
    }

    if (vl_resolution.mappingMatchedWithoutTarget) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "mapping-target-missing",
      });
      continue;
    }

    if (vl_resolution.models.length === 0) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "no-match",
      });
      continue;
    }

    if (vl_resolution.models.length > 1) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "ambiguous",
      });
      continue;
    }

    const vl_target = vl_resolution.models[0];

    if (vl_target === undefined) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "no-match",
      });
      continue;
    }

    const vl_existing =
      vl_benchmarksByModel.get(vl_target.id) ?? vl_target.benchmarks;

    // One row per benchmark. A second row for the same model would make the
    // displayed score depend on source order.
    if (
      vl_existing.some(
        (p_entry) => p_entry.benchmarkId === vl_benchmark.benchmarkId,
      )
    ) {
      vl_unmatched.push({
        benchmarkId: vl_benchmark.benchmarkId,
        sourceModelId: vl_sourceModelId,
        reason: "duplicate-benchmark",
      });
      continue;
    }

    const vl_matchType = fh_matchTypeForResolution(vl_resolution);
    const vl_attached: ModelBenchmark = { ...vl_benchmark, matchType: vl_matchType };
    const vl_nextBenchmarks = [...vl_existing, vl_attached];
    vl_benchmarksByModel.set(vl_target.id, vl_nextBenchmarks);
    vl_changedModels.add(vl_target.id);
    vl_matches.push({
      benchmark: vl_attached,
      modelId: vl_target.id,
      strategy: vl_resolution.strategy,
      matchType: vl_matchType,
    });
  }

  const vl_models = p_models.map((p_model) => {
    if (!vl_changedModels.has(p_model.id)) {
      return p_model;
    }

    const vl_benchmarks = vl_benchmarksByModel.get(p_model.id) ?? [];

    return {
      ...p_model,
      benchmarks: fh_sortBenchmarks(vl_benchmarks),
    };
  });

  return {
    models: vl_models,
    matches: vl_matches,
    unmatched: vl_unmatched,
  };
}

function fh_indexModels(p_models: readonly ModelRecord[]): ModelIndex {
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

function fh_resolveModel(
  p_benchmarkId: BenchmarkId,
  p_sourceModelId: string,
  p_index: ModelIndex,
  p_aliases: readonly ModelAlias[],
  p_mappingIndex: MappingIndex,
): MatchResolution {
  const vl_exactId = p_index.byId.get(p_sourceModelId);

  if (vl_exactId !== undefined) {
    return fh_resolution(vl_exactId, "exact-id");
  }

  const vl_exactModelId = p_index.byModelId.get(p_sourceModelId);

  if (vl_exactModelId !== undefined) {
    return fh_resolution(vl_exactModelId, "exact-model-id");
  }

  const vl_canonical = p_index.byCanonicalId.get(p_sourceModelId);

  if (vl_canonical !== undefined) {
    return fh_resolution(vl_canonical, "canonical-id");
  }

  const vl_alias = fh_resolveAliases(p_sourceModelId, p_index, p_aliases);

  if (vl_alias.matched) {
    return {
      models: vl_alias.models,
      strategy: "alias",
      aliasMatchedWithoutTarget: vl_alias.models.length === 0,
      mappingMatchedWithoutTarget: false,
      matchType: null,
    };
  }

  const vl_mapping = fh_lookupMapping(p_mappingIndex, p_benchmarkId, p_sourceModelId);

  if (vl_mapping !== undefined) {
    const vl_targets = p_index.byId.get(vl_mapping.opencodeModelId) ?? [];

    return {
      models: vl_targets,
      strategy: "mapping",
      aliasMatchedWithoutTarget: false,
      mappingMatchedWithoutTarget: vl_targets.length === 0,
      matchType: vl_mapping.matchType,
    };
  }

  const vl_normalized = fh_resolveNormalized(p_sourceModelId, p_index);

  if (vl_normalized !== null) {
    return fh_resolution(vl_normalized, "normalized");
  }

  return fh_resolution([], "normalized");
}

function fh_resolution(
  p_models: readonly ModelRecord[],
  p_strategy: MatchStrategy,
): MatchResolution {
  return {
    models: p_models,
    strategy: p_strategy,
    aliasMatchedWithoutTarget: false,
    mappingMatchedWithoutTarget: false,
    matchType: null,
  };
}

/**
 * Mapping lookup index (Adjustment 18): exact `benchmark sourceId` keys win;
 * casefolded keys act as a fallback only when they resolve to a single distinct
 * source string. Conflicting entries are dropped rather than guessed.
 */
interface MappingIndex {
  readonly exact: ReadonlyMap<string, BenchmarkMapping>;
  readonly folded: ReadonlyMap<string, BenchmarkMapping>;
}

function fh_indexMappings(p_mappings: readonly BenchmarkMapping[]): MappingIndex {
  const vl_exact = new Map<string, BenchmarkMapping>();
  const vl_folded = new Map<string, BenchmarkMapping>();
  const vl_exactAmbiguous = new Set<string>();
  const vl_foldedAmbiguous = new Set<string>();

  for (const vl_mapping of p_mappings) {
    const vl_exactKey = `${vl_mapping.benchmarkId} ${vl_mapping.sourceModelId}`;
    const vl_foldedKey = `${vl_mapping.benchmarkId} ${vl_mapping.sourceModelId.toLowerCase()}`;

    if (vl_exact.has(vl_exactKey)) {
      // Two reviewed entries claim the same benchmark + source string. Drop the
      // key from both views: ambiguous reviewed data is worse than none.
      vl_exactAmbiguous.add(vl_exactKey);
      vl_foldedAmbiguous.add(vl_foldedKey);
      continue;
    }

    vl_exact.set(vl_exactKey, vl_mapping);

    const vl_foldedExisting = vl_folded.get(vl_foldedKey);

    if (
      vl_foldedExisting !== undefined &&
      vl_foldedExisting.sourceModelId !== vl_mapping.sourceModelId
    ) {
      // Distinct source strings that collide once casefolded make the fold
      // lookup ambiguous; exact matches remain usable.
      vl_foldedAmbiguous.add(vl_foldedKey);
    } else if (vl_foldedExisting === undefined) {
      vl_folded.set(vl_foldedKey, vl_mapping);
    }
  }

  for (const vl_key of vl_exactAmbiguous) {
    // Ambiguous reviewed data is worse than none: it would attach a score to
    // the wrong model. Drop every entry for that key instead of guessing.
    vl_exact.delete(vl_key);
  }

  for (const vl_key of vl_foldedAmbiguous) {
    vl_folded.delete(vl_key);
  }

  return { exact: vl_exact, folded: vl_folded };
}

function fh_lookupMapping(
  p_index: MappingIndex,
  p_benchmarkId: BenchmarkId,
  p_sourceModelId: string,
): BenchmarkMapping | undefined {
  const vl_exact = p_index.exact.get(`${p_benchmarkId} ${p_sourceModelId}`);

  if (vl_exact !== undefined) {
    return vl_exact;
  }

  return p_index.folded.get(`${p_benchmarkId} ${p_sourceModelId.toLowerCase()}`);
}

function fh_matchTypeForResolution(p_resolution: MatchResolution): BenchmarkMatchType {
  if (p_resolution.matchType !== null) {
    return p_resolution.matchType;
  }

  return p_resolution.strategy === "alias" ? "alias" : "exact";
}

function fh_resolveAliases(
  p_sourceModelId: string,
  p_index: ModelIndex,
  p_aliases: readonly ModelAlias[],
): AliasResolution {
  const vl_matches = new Map<string, ModelRecord>();

  for (const vl_alias of p_aliases) {
    if (!vl_alias.aliases.includes(p_sourceModelId)) {
      continue;
    }

    const vl_key = `${vl_alias.providerId}/${vl_alias.canonicalModelId}`;
    const vl_targets = p_index.byId.get(vl_key) ?? [];

    for (const vl_target of vl_targets) {
      vl_matches.set(vl_target.id, vl_target);
    }
  }

  return {
    matched: p_aliases.some((p_alias) =>
      p_alias.aliases.includes(p_sourceModelId),
    ),
    models: [...vl_matches.values()],
  };
}

function fh_resolveNormalized(
  p_sourceModelId: string,
  p_index: ModelIndex,
): readonly ModelRecord[] | null {
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
