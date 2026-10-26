/**
 * Sort vocabulary shared by the UI, commands, and persistence.
 *
 * The comparator lives in `src/services/ranking.ts`; this module only defines
 * the sort keys, directions, and defaults. The default view lists the highest
 * LLMBM coding index first.
 */

/** Direction of the active sort column. */
export type SortDirection = "asc" | "desc";

/** Every sortable column. Benchmark keys sort by the reported score. */
export type ModelSortKey =
  | "name"
  | "providerName"
  | "releaseDate"
  | "contextWindow"
  | "codingScore"
  | "intelligenceScore"
  | "inputPrice"
  | "outputPrice";

/** Registry of sort keys, used by guards and command parsing. */
export const k_modelSortKeys: readonly ModelSortKey[] = [
  "name",
  "providerName",
  "releaseDate",
  "contextWindow",
  "codingScore",
  "intelligenceScore",
  "inputPrice",
  "outputPrice",
];

/** Registry of sort directions. */
export const k_sortDirections: readonly SortDirection[] = ["asc", "desc"];

/** Default sort: LLMBM coding index. */
export const k_defaultSortKey: ModelSortKey = "codingScore";

/** Default direction: highest score first. */
export const k_defaultSortDirection: SortDirection = "desc";

/** True when the value is a supported sort key. */
export function f_isModelSortKey(p_value: unknown): p_value is ModelSortKey {
  return k_modelSortKeys.some((p_entry) => p_entry === p_value);
}

/** True when the value is a supported sort direction. */
export function f_isSortDirection(p_value: unknown): p_value is SortDirection {
  return k_sortDirections.some((p_entry) => p_entry === p_value);
}
