/**
 * Sort and ranking unions shared by the UI, commands, and persistence.
 *
 * The comparator itself lives in Phase 4 (`ranking.ts`). This module only
 * defines the vocabulary and the defaults mandated by the specification:
 * primary sort `llbmRank`, ascending, LLMBM as the primary ranking mode.
 */

/** The single benchmark that drives the rank column and ranking selector. */
export type RankingMode = "llbm";

/** Direction of the active sort column. */
export type SortDirection = "asc" | "desc";

/**
 * Every sortable column. Score and rank keys are intentionally distinct:
 * "higher score" and "rank 1 first" are different operations.
 */
export type ModelSortKey =
  | "name"
  | "providerName"
  | "releaseDate"
  | "contextWindow"
  | "llbmScore"
  | "llbmRank"
  | "inputPrice"
  | "outputPrice";

/** Registry of sort keys, used by guards and command parsing. */
export const k_modelSortKeys: readonly ModelSortKey[] = [
  "name",
  "providerName",
  "releaseDate",
  "contextWindow",
  "llbmScore",
  "llbmRank",
  "inputPrice",
  "outputPrice",
];

/** Registry of ranking modes. */
export const k_rankingModes: readonly RankingMode[] = [
  "llbm",
];

/** Registry of sort directions. */
export const k_sortDirections: readonly SortDirection[] = ["asc", "desc"];

/** Specification default: rank by LLMBM. */
export const k_defaultRankingMode: RankingMode = "llbm";

/** Specification default: LLMBM rank ascending (rank 1 first). */
export const k_defaultSortKey: ModelSortKey = "llbmRank";

/** Specification default direction for the primary sort. */
export const k_defaultSortDirection: SortDirection = "asc";

/** True when the value is a supported sort key. */
export function f_isModelSortKey(p_value: unknown): p_value is ModelSortKey {
  return k_modelSortKeys.some((p_entry) => p_entry === p_value);
}

/** True when the value is a supported ranking mode. */
export function f_isRankingMode(p_value: unknown): p_value is RankingMode {
  return k_rankingModes.some((p_entry) => p_entry === p_value);
}

/** True when the value is a supported sort direction. */
export function f_isSortDirection(p_value: unknown): p_value is SortDirection {
  return k_sortDirections.some((p_entry) => p_entry === p_value);
}