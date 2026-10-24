/**
 * Renderer-agnostic controller for the model overview panel.
 *
 * The SolidJS layer in `src/tui.tsx` only renders what this module derives;
 * every non-trivial decision lives here and is unit-testable without a host.
 *
 * Data rules:
 * - Panel reads are cache-only (`f_getModelOverview`); no keystroke or toggle
 *   ever triggers a network request.
 * - Live fetching happens exclusively through `refresh` (explicit command,
 *   palette action, or refresh chip).
 * - Missing values stay `null`; formatting renders them as an em dash.
 */

import type { Plugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, type Accessor } from "solid-js";
import type { Store } from "solid-js/store";
import type { ModelBenchmark } from "../domain/model-benchmark";
import { f_getBenchmarkForModel, type ModelRecord } from "../domain/model-record";
import {
  f_isModelSortKey,
  f_isRankingMode,
  f_isSortDirection,
  k_defaultRankingMode,
  k_defaultSortDirection,
  k_defaultSortKey,
  k_modelSortKeys,
  type ModelSortKey,
  type RankingMode,
  type SortDirection,
} from "../domain/model-sort";
import type { AdapterResult } from "../providers/adapter-result";
import { f_fetchGpqaBenchmarks } from "../providers/huggingface-gpqa";
import { f_fetchLiveCodeBench } from "../providers/livecodebench";
import { f_parseOpencodeModels } from "../providers/opencode-models";
import {
  f_createFileCache,
  f_getDefaultCacheDirectory,
  f_resolveCacheTtls,
  type OverviewCache,
} from "../services/cache";
import { f_filterModels, type ModelFilterOptions } from "../services/model-filter";
import {
  f_getModelOverview,
  f_refreshModelOverview,
  f_resolveRequestTimeoutMs,
  type ModelOverviewSnapshot,
  type OverviewLoadContext,
} from "../services/model-overview";
import { f_sortModels } from "../services/ranking";
import { f_formatRank, f_formatScore, f_formatTimestamp, f_truncate } from "./format";

/** Durable view preferences (survive collapse, restart, and refresh). */
export const k_preferencesStorageKey = "model-overview.preferences";
/** Ephemeral search text. */
export const k_searchStorageKey = "model-overview.search";
/** Ephemeral filter toggles. */
export const k_filtersStorageKey = "model-overview.filters";

export interface OverviewViewPreferences {
  sortKey: ModelSortKey;
  sortDirection: SortDirection;
  ranking: RankingMode;
  collapsed: boolean;
}

export const k_defaultViewPreferences: OverviewViewPreferences = {
  sortKey: k_defaultSortKey,
  sortDirection: k_defaultSortDirection,
  ranking: k_defaultRankingMode,
  collapsed: false,
};

export interface OverviewSearchState {
  text: string;
}

export const k_defaultSearchState: OverviewSearchState = { text: "" };

export interface OverviewFilters {
  freeOnly: boolean;
  missingGpqa: boolean;
  missingLiveCodeBench: boolean;
}

export const k_defaultFilters: OverviewFilters = {
  freeOnly: false,
  missingGpqa: false,
  missingLiveCodeBench: false,
};

/**
 * Opt-in env flag for header-click collapse. The gesture stays implemented but
 * is disabled by default so a stray click can never hide the table.
 */
export const k_headerCollapseEnvVar = "OPENCODE_MODEL_OVERVIEW_HEADER_COLLAPSE";

/** Only an explicit truthy value enables header-click collapse. */
export function f_resolveHeaderCollapseEnabled(
  p_env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const vl_value = p_env[k_headerCollapseEnvVar];
  if (vl_value === undefined) return false;
  const vl_normalized = vl_value.trim().toLowerCase();
  return (
    vl_normalized === "1" ||
    vl_normalized === "true" ||
    vl_normalized === "on" ||
    vl_normalized === "yes"
  );
}

/** Effective collapsed state: the panel is never collapsed unless enabled. */
export function f_resolveCollapsedState(p_enabled: boolean, p_stored: boolean): boolean {
  return p_enabled && p_stored;
}

export interface OverviewDerivedRows {
  rows: readonly ModelRecord[];
  totalCount: number;
  filteredCount: number;
}

export type OverviewCommand =
  | { kind: "toggle" }
  | { kind: "status" }
  | { kind: "refresh" }
  | { kind: "sort"; key: ModelSortKey }
  | { kind: "ranking"; ranking: RankingMode };

export const k_overviewUsage =
  "/model-overview [toggle | status | refresh | sort <column> | ranking gpqa|livecodebench]";

const k_sortTokenAliases: Readonly<Record<string, ModelSortKey>> = {
  gpqa: "gpqaRank",
  lcb: "livecodebenchRank",
  livecodebench: "livecodebenchRank",
  "input-price": "inputPrice",
  "output-price": "outputPrice",
};

/** Numeric and date columns read best descending on first selection. */
export function f_getDefaultSortDirection(p_key: ModelSortKey): SortDirection {
  if (p_key === "releaseDate" || p_key === "gpqaScore" || p_key === "livecodebenchScore") {
    return "desc";
  }
  return "asc";
}

function fh_benchmarkForSortKey(p_key: ModelSortKey): RankingMode | null {
  if (p_key === "gpqaRank" || p_key === "gpqaScore") return "gpqa";
  if (p_key === "livecodebenchRank" || p_key === "livecodebenchScore") return "livecodebench";
  return null;
}

/** Selecting the active column toggles direction; a new column gets its default. */
export function f_nextSortState(
  p_preferences: OverviewViewPreferences,
  p_key: ModelSortKey,
): { sortKey: ModelSortKey; sortDirection: SortDirection } {
  if (p_preferences.sortKey === p_key) {
    return {
      sortKey: p_key,
      sortDirection: p_preferences.sortDirection === "asc" ? "desc" : "asc",
    };
  }
  return { sortKey: p_key, sortDirection: f_getDefaultSortDirection(p_key) };
}

/** Switch ranking; move the sort column when it belonged to the other benchmark. */
export function f_nextRankingState(
  p_preferences: OverviewViewPreferences,
  p_ranking: RankingMode,
): { ranking: RankingMode; sortKey: ModelSortKey; sortDirection: SortDirection } {
  const vl_current = fh_benchmarkForSortKey(p_preferences.sortKey);
  if (vl_current !== null && vl_current !== p_ranking) {
    return {
      ranking: p_ranking,
      sortKey: p_ranking === "gpqa" ? "gpqaRank" : "livecodebenchRank",
      sortDirection: "asc",
    };
  }
  return {
    ranking: p_ranking,
    sortKey: p_preferences.sortKey,
    sortDirection: p_preferences.sortDirection,
  };
}

/** Map controller state onto the service-layer filter options. */
export function f_buildFilterOptions(
  p_search: OverviewSearchState,
  p_filters: OverviewFilters,
): ModelFilterOptions {
  const vl_presence: ModelFilterOptions["benchmarkPresence"] = p_filters.missingGpqa
    ? { scope: "gpqa", state: "missing" }
    : p_filters.missingLiveCodeBench
      ? { scope: "livecodebench", state: "missing" }
      : undefined;
  return {
    searchText: p_search.text,
    freeOnly: p_filters.freeOnly,
    ...(vl_presence !== undefined ? { benchmarkPresence: vl_presence } : {}),
  };
}

/** Filter then sort without mutating any input. */
export function f_deriveOverviewRows(
  p_models: readonly ModelRecord[],
  p_preferences: OverviewViewPreferences,
  p_search: OverviewSearchState,
  p_filters: OverviewFilters,
): OverviewDerivedRows {
  const vl_filtered = f_filterModels(p_models, f_buildFilterOptions(p_search, p_filters));
  return {
    rows: f_sortModels(vl_filtered, p_preferences.sortKey, p_preferences.sortDirection),
    totalCount: p_models.length,
    filteredCount: vl_filtered.length,
  };
}

/** Parse the `/model-overview` argument string; `undefined` means "invalid". */
export function f_parseOverviewCommand(p_raw: string): OverviewCommand | undefined {
  const vl_tokens = p_raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((p_token) => p_token.length > 0);
  const [vl_head, vl_target] = vl_tokens;
  if (vl_head === undefined || vl_head === "toggle") return { kind: "toggle" };
  if (vl_head === "status") return { kind: "status" };
  if (vl_head === "refresh") return { kind: "refresh" };
  if (vl_head === "sort" && vl_target !== undefined) {
    const vl_key = fh_resolveSortToken(vl_target);
    return vl_key !== undefined ? { kind: "sort", key: vl_key } : undefined;
  }
  if (vl_head === "ranking" && (vl_target === "gpqa" || vl_target === "livecodebench")) {
    return { kind: "ranking", ranking: vl_target };
  }
  return undefined;
}

function fh_resolveSortToken(p_token: string): ModelSortKey | undefined {
  const vl_alias = k_sortTokenAliases[p_token];
  if (vl_alias !== undefined) return vl_alias;
  const vl_normalized = p_token.replace(/-/g, "");
  return k_modelSortKeys.find((p_key) => p_key.toLowerCase() === vl_normalized);
}

export function f_getSortKeyLabel(p_key: ModelSortKey): string {
  switch (p_key) {
    case "name":
      return "Model";
    case "providerName":
      return "Provider";
    case "releaseDate":
      return "Released";
    case "gpqaRank":
    case "gpqaScore":
      return "GPQA";
    case "livecodebenchRank":
    case "livecodebenchScore":
      return "LCB";
    case "inputPrice":
      return "In $/M";
    case "outputPrice":
      return "Out $/M";
  }
}

/**
 * Chip label: `[>>label]` when selected, `[>label]` when hovered by the
 * cursor, plain `[label]` otherwise. Selection wins over hover.
 */
export function f_formatChipLabel(
  p_selected: boolean,
  p_hovered: boolean,
  p_label: string,
): string {
  if (p_selected) return `[>>${p_label}]`;
  if (p_hovered) return `[>${p_label}]`;
  return `[${p_label}]`;
}

function fh_shortSource(p_source: string): string {
  if (p_source === "opencode-models") return "models";
  if (p_source === "opencode-pricing") return "pricing";
  return p_source;
}

/** One-line freshness/aggregate summary shown in the panel footer. */
export function f_buildStatusLine(
  p_snapshot: ModelOverviewSnapshot | undefined,
  p_loading: boolean,
  p_lastError: string | null,
): string {
  if (p_lastError !== null) return `error: ${p_lastError}`;
  if (p_snapshot === undefined) {
    return p_loading ? "refreshing…" : "no cached data — run /model-overview refresh";
  }
  const vl_sources = p_snapshot.status.sources
    .map((p_source) => `${fh_shortSource(p_source.source)}: ${p_source.state}`)
    .join(" · ");
  const vl_warnings =
    p_snapshot.warnings.length > 0 ? ` · ${p_snapshot.warnings.length} warning(s)` : "";
  const vl_head = p_loading ? "refreshing · " : "";
  return `${vl_head}${p_snapshot.status.state} · ${vl_sources} · updated ${f_formatTimestamp(p_snapshot.status.lastRefreshAt)}${vl_warnings}`;
}

/** Multi-line status dialog contents. */
export function f_buildStatusLines(
  p_snapshot: ModelOverviewSnapshot | undefined,
  p_rows: OverviewDerivedRows,
  p_preferences: OverviewViewPreferences,
  p_searchText: string,
  p_filters: OverviewFilters,
  p_loading: boolean,
  p_lastError: string | null,
): string[] {
  const vl_lines: string[] = [];
  vl_lines.push(`status: ${f_buildStatusLine(p_snapshot, p_loading, p_lastError)}`);
  vl_lines.push(
    `sort: ${f_getSortKeyLabel(p_preferences.sortKey)} ${p_preferences.sortDirection === "asc" ? "ascending" : "descending"} · ranking: ${p_preferences.ranking === "gpqa" ? "GPQA" : "LiveCodeBench"}`,
  );
  vl_lines.push(`models: ${p_rows.filteredCount} of ${p_rows.totalCount} shown`);
  vl_lines.push(
    `search: ${p_searchText.trim() === "" ? "(none)" : p_searchText.trim()} · filters: ${fh_describeFilters(p_filters)}`,
  );
  if (p_snapshot !== undefined) {
    for (const vl_source of p_snapshot.status.sources) {
      const vl_error = vl_source.error !== null ? ` (${vl_source.error})` : "";
      vl_lines.push(
        `${fh_shortSource(vl_source.source)}: ${vl_source.state}${vl_error} · last success ${f_formatTimestamp(vl_source.lastSuccessAt)}`,
      );
    }
  }
  return vl_lines;
}

function fh_describeFilters(p_filters: OverviewFilters): string {
  const vl_active: string[] = [];
  if (p_filters.freeOnly) vl_active.push("free");
  if (p_filters.missingGpqa) vl_active.push("missing GPQA");
  if (p_filters.missingLiveCodeBench) vl_active.push("missing LCB");
  return vl_active.length > 0 ? vl_active.join(", ") : "none";
}

/** Compact sidebar strip: leader for the active ranking plus a hint. */
export function f_buildSidebarSummary(
  p_leader: ModelRecord | null,
  p_total: number,
  p_ranking: RankingMode,
): string {
  const vl_label = p_ranking === "gpqa" ? "GPQA" : "LCB";
  if (p_leader === null) return `${p_total} models · no ${vl_label} data`;
  const vl_benchmark = f_getBenchmarkForModel(p_leader, p_ranking);
  const vl_rank = f_formatRank(vl_benchmark?.rank ?? null);
  const vl_score = f_formatScore(vl_benchmark?.score ?? null);
  return `${p_total} models · ${vl_label} ${vl_rank} ${f_truncate(p_leader.name, 18)} ${vl_score}`;
}

/** Short snapshot description for refresh toasts. */
export function f_describeSnapshot(p_snapshot: ModelOverviewSnapshot): string {
  return `${p_snapshot.status.state} · ${p_snapshot.models.length} models · ${p_snapshot.warnings.length} warning(s)`;
}

export interface OverviewController {
  readonly cache: OverviewCache;
  readonly preferences: Store<OverviewViewPreferences>;
  readonly search: Store<OverviewSearchState>;
  readonly filters: Store<OverviewFilters>;
  readonly snapshot: Accessor<ModelOverviewSnapshot | undefined>;
  readonly loading: Accessor<boolean>;
  readonly lastError: Accessor<string | null>;
  readonly rows: Accessor<OverviewDerivedRows>;
  readonly rankingLeader: Accessor<ModelRecord | null>;
  /** Whether header-click collapse is enabled (env-gated, default off). */
  readonly headerCollapseEnabled: boolean;
  readonly setSearchText: (p_text: string) => void;
  readonly toggleFreeOnly: () => void;
  readonly toggleMissingGpqa: () => void;
  readonly toggleMissingLiveCodeBench: () => void;
  readonly clearFilters: () => void;
  readonly toggleSort: (p_key: ModelSortKey) => void;
  readonly setRanking: (p_ranking: RankingMode) => void;
  readonly toggleCollapsed: () => void;
  readonly loadFromCache: () => Promise<void>;
  readonly refresh: (p_force: boolean) => Promise<ModelOverviewSnapshot | undefined>;
}

/** Build the controller bound to a host `Plugin.Context`. */
export function f_createOverviewController(p_context: Plugin.Context): OverviewController {
  const vl_cache = f_createFileCache(f_getDefaultCacheDirectory());
  const vl_headerCollapseEnabled = f_resolveHeaderCollapseEnabled();
  const [vl_preferences, vl_setPreferences] = p_context.storage.store<OverviewViewPreferences>(
    k_preferencesStorageKey,
    { initial: { ...k_defaultViewPreferences } },
  );
  const [vl_search, vl_setSearch] = p_context.storage.memory<OverviewSearchState>(
    k_searchStorageKey,
    { initial: { ...k_defaultSearchState } },
  );
  const [vl_filters, vl_setFilters] = p_context.storage.memory<OverviewFilters>(
    k_filtersStorageKey,
    { initial: { ...k_defaultFilters } },
  );

  // Fold a legacy/partial stored shape back to defaults exactly once.
  const vl_storedSortKey: unknown = vl_preferences.sortKey;
  const vl_storedSortDirection: unknown = vl_preferences.sortDirection;
  const vl_storedRanking: unknown = vl_preferences.ranking;
  const vl_storedCollapsed: unknown = vl_preferences.collapsed;
  if (
    !f_isModelSortKey(vl_storedSortKey) ||
    !f_isSortDirection(vl_storedSortDirection) ||
    !f_isRankingMode(vl_storedRanking) ||
    typeof vl_storedCollapsed !== "boolean" ||
    (!vl_headerCollapseEnabled && vl_storedCollapsed === true)
  ) {
    void vl_setPreferences((draft) => {
      draft.sortKey = f_isModelSortKey(vl_storedSortKey) ? vl_storedSortKey : k_defaultSortKey;
      draft.sortDirection = f_isSortDirection(vl_storedSortDirection)
        ? vl_storedSortDirection
        : k_defaultSortDirection;
      draft.ranking = f_isRankingMode(vl_storedRanking) ? vl_storedRanking : k_defaultRankingMode;
      draft.collapsed = f_resolveCollapsedState(
        vl_headerCollapseEnabled,
        typeof vl_storedCollapsed === "boolean" ? vl_storedCollapsed : false,
      );
    });
  }

  const [vl_snapshot, vl_setSnapshot] = createSignal<ModelOverviewSnapshot | undefined>(undefined);
  const [vl_loading, vl_setLoading] = createSignal(false);
  const [vl_lastError, vl_setLastError] = createSignal<string | null>(null);

  const vl_rows = createMemo(() =>
    f_deriveOverviewRows(vl_snapshot()?.models ?? [], vl_preferences, vl_search, vl_filters),
  );
  const vl_rankingLeader = createMemo(() => {
    const vl_models = vl_snapshot()?.models ?? [];
    const vl_key: ModelSortKey =
      vl_preferences.ranking === "gpqa" ? "gpqaRank" : "livecodebenchRank";
    return f_sortModels(vl_models, vl_key, "asc")[0] ?? null;
  });

  function f_setSearchText(p_text: string): void {
    void vl_setSearch((draft) => {
      draft.text = p_text;
    });
  }

  function f_toggleFreeOnly(): void {
    void vl_setFilters((draft) => {
      draft.freeOnly = !draft.freeOnly;
    });
  }

  function f_toggleMissingGpqa(): void {
    void vl_setFilters((draft) => {
      draft.missingGpqa = !draft.missingGpqa;
      if (draft.missingGpqa) draft.missingLiveCodeBench = false;
    });
  }

  function f_toggleMissingLiveCodeBench(): void {
    void vl_setFilters((draft) => {
      draft.missingLiveCodeBench = !draft.missingLiveCodeBench;
      if (draft.missingLiveCodeBench) draft.missingGpqa = false;
    });
  }

  function f_clearFilters(): void {
    void vl_setFilters((draft) => {
      draft.freeOnly = false;
      draft.missingGpqa = false;
      draft.missingLiveCodeBench = false;
    });
  }

  function f_toggleSort(p_key: ModelSortKey): void {
    void vl_setPreferences((draft) => {
      const vl_next = f_nextSortState(draft, p_key);
      draft.sortKey = vl_next.sortKey;
      draft.sortDirection = vl_next.sortDirection;
    });
  }

  function f_setRanking(p_ranking: RankingMode): void {
    void vl_setPreferences((draft) => {
      const vl_next = f_nextRankingState(draft, p_ranking);
      draft.ranking = vl_next.ranking;
      draft.sortKey = vl_next.sortKey;
      draft.sortDirection = vl_next.sortDirection;
    });
  }

  function f_toggleCollapsed(): void {
    if (!vl_headerCollapseEnabled) return;
    void vl_setPreferences((draft) => {
      draft.collapsed = !draft.collapsed;
    });
  }

  async function fh_loadModels(
    p_loadContext: OverviewLoadContext,
  ): Promise<AdapterResult<readonly ModelRecord[]>> {
    try {
      // Ask the host to sync the location catalog; keep whatever is present on failure.
      await p_context.data.location.model.sync(p_context.location);
    } catch {
      // Keep the last catalog; parsing below still uses the current list snapshot.
    }
    const vl_models = p_context.data.location.model.list(p_context.location) ?? [];
    const vl_providerNames: Record<string, string> = {};
    for (const vl_provider of p_context.data.location.provider.list(p_context.location) ?? []) {
      const vl_id = vl_provider.id;
      const vl_name = vl_provider.name;
      if (typeof vl_id === "string" && vl_id.length > 0 && typeof vl_name === "string" && vl_name.length > 0) {
        vl_providerNames[vl_id] = vl_name;
      }
    }
    return f_parseOpencodeModels(vl_models, {
      observedAt: p_loadContext.now.toISOString(),
      providerNames: vl_providerNames,
    });
  }

  async function fh_loadGpqa(
    p_loadContext: OverviewLoadContext,
  ): Promise<AdapterResult<readonly ModelBenchmark[]>> {
    return f_fetchGpqaBenchmarks({
      timeoutMs: p_loadContext.timeoutMs,
      ...(p_loadContext.signal !== null ? { signal: p_loadContext.signal } : {}),
    });
  }

  async function fh_loadLiveCodeBench(
    p_loadContext: OverviewLoadContext,
  ): Promise<AdapterResult<readonly ModelBenchmark[]>> {
    return f_fetchLiveCodeBench({
      timeoutMs: p_loadContext.timeoutMs,
      ...(p_loadContext.signal !== null ? { signal: p_loadContext.signal } : {}),
    });
  }

  async function f_loadFromCache(): Promise<void> {
    try {
      vl_setSnapshot(await f_getModelOverview({ cache: vl_cache }));
    } catch {
      vl_setLastError("cache read failed");
    }
  }

  async function f_refresh(p_force: boolean): Promise<ModelOverviewSnapshot | undefined> {
    if (vl_loading()) return vl_snapshot();
    vl_setLoading(true);
    vl_setLastError(null);
    try {
      const vl_ttls = f_resolveCacheTtls();
      const vl_next = await f_refreshModelOverview({
        cache: vl_cache,
        loadModels: fh_loadModels,
        loadGpqa: fh_loadGpqa,
        loadLiveCodeBench: fh_loadLiveCodeBench,
        force: p_force,
        modelTtlMs: vl_ttls.modelTtlMs,
        benchmarkTtlMs: vl_ttls.benchmarkTtlMs,
        timeoutMs: f_resolveRequestTimeoutMs(),
      });
      vl_setSnapshot(vl_next);
      return vl_next;
    } catch {
      vl_setLastError("refresh failed unexpectedly");
      await f_loadFromCache();
      return vl_snapshot();
    } finally {
      vl_setLoading(false);
    }
  }

  return {
    cache: vl_cache,
    preferences: vl_preferences,
    search: vl_search,
    filters: vl_filters,
    snapshot: vl_snapshot,
    loading: vl_loading,
    lastError: vl_lastError,
    rows: vl_rows,
    rankingLeader: vl_rankingLeader,
    headerCollapseEnabled: vl_headerCollapseEnabled,
    setSearchText: f_setSearchText,
    toggleFreeOnly: f_toggleFreeOnly,
    toggleMissingGpqa: f_toggleMissingGpqa,
    toggleMissingLiveCodeBench: f_toggleMissingLiveCodeBench,
    clearFilters: f_clearFilters,
    toggleSort: f_toggleSort,
    setRanking: f_setRanking,
    toggleCollapsed: f_toggleCollapsed,
    loadFromCache: f_loadFromCache,
    refresh: f_refresh,
  };
}
