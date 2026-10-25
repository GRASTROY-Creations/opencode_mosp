/**
 * Renderer-agnostic controller for the model overview panel.
 *
 * The SolidJS layer in `src/tui.tsx` only renders what this module derives;
 * every non-trivial decision lives here and is unit-testable without a host.
 *
 * Reactivity model (important):
 * - The host runtime embeds its own Solid copy (the installed binary is
 *   self-contained), while this plugin imports Solid from the project. Stores
 *   created by the host (`context.storage.*`) therefore cannot drive reactive
 *   updates inside this module.
 * - Consequence: all render-relevant state lives in controller-owned signals
 *   (below). Host stores are written through for persistence only and read
 *   once at creation time. See `docs/architecture/ui-integration.md`.
 *
 * Data rules:
 * - Panel reads are host-first (`f_getModelOverviewFromHost`): the live
 *   OpenCode location catalog wins whenever it parses; the cached model entry
 *   is the fallback. No keystroke or toggle ever triggers a network request.
 * - Benchmarks and the models.dev crosswalk are cache-only; live fetching
 *   happens exclusively through `update` (`/mosp update` or the palette
 *   action); `/mosp redraw` re-reads the host catalog plus cache and repaints.
 * - Missing values stay `null`; formatting renders them as an em dash.
 */

import type { Plugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, type Accessor } from "solid-js";
import type { ModelBenchmark } from "../domain/model-benchmark";
import { f_getBenchmarkForModel, type ModelRecord } from "../domain/model-record";
import {
  f_isModelSortKey,
  f_isSortDirection,
  k_defaultSortDirection,
  k_defaultSortKey,
  k_modelSortKeys,
  type ModelSortKey,
  type SortDirection,
} from "../domain/model-sort";
import { f_adapterFail, type AdapterResult } from "../providers/adapter-result";
import { f_fetchLlbmBenchmarks } from "../providers/llbm";
import { f_fetchModelsDevCrosswalk, type ModelsDevCrosswalk } from "../providers/models-dev";
import { f_parseOpencodeModels } from "../providers/opencode-models";
import {
  f_createFileCache,
  f_getDefaultCacheDirectory,
  f_resolveCacheTtls,
  type OverviewCache,
} from "../services/cache";
import { f_filterModels, type ModelFilterOptions } from "../services/model-filter";
import {
  f_getModelOverviewFromHost,
  f_refreshModelOverview,
  f_resolveRequestTimeoutMs,
  type ModelOverviewSnapshot,
  type OverviewLoadContext,
} from "../services/model-overview";
import { f_sortModels } from "../services/ranking";
import {
  f_formatContext,
  f_formatPrice,
  f_formatRank,
  f_formatScore,
  f_formatTimestamp,
  f_truncate,
} from "./format";

/** Durable view preferences (survive collapse, restart, and refresh). */
export const k_preferencesStorageKey = "model-overview.preferences";
/** Ephemeral filter toggles. */
export const k_filtersStorageKey = "model-overview.filters";

export interface OverviewViewPreferences {
  sortKey: ModelSortKey;
  sortDirection: SortDirection;
  collapsed: boolean;
}

export const k_defaultViewPreferences: OverviewViewPreferences = {
  sortKey: k_defaultSortKey,
  sortDirection: k_defaultSortDirection,
  collapsed: false,
};

export interface OverviewFilters {
  freeOnly: boolean;
}

export const k_defaultFilters: OverviewFilters = {
  freeOnly: false,
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

/** A column description for the single-text table body. */
export interface TableColumn {
  readonly key: ModelSortKey;
  readonly width: number;
}

/**
 * `#rank score` when both exist; a lone value still renders. Proxy matches
 * (version/family stand-ins) get a `~` prefix and are never shown as exact.
 */
function fh_benchmarkText(p_benchmark: ModelBenchmark | null): string {
  if (p_benchmark === null) return "—";
  const vl_parts: string[] = [];
  if (p_benchmark.rank !== null) vl_parts.push(f_formatRank(p_benchmark.rank));
  if (p_benchmark.score !== null) vl_parts.push(f_formatScore(p_benchmark.score));
  if (vl_parts.length === 0) return "—";
  const vl_text = vl_parts.join(" ");
  const vl_isProxy = p_benchmark.matchType === "family_fallback";
  return vl_isProxy ? `~${vl_text}` : vl_text;
}

/** One cell's display text for a row, keyed by its column. */
function fh_tableCell(p_model: ModelRecord, p_key: ModelSortKey): string {
  switch (p_key) {
    case "name":
      return p_model.name;
    case "providerName":
      return p_model.providerName;
    case "contextWindow":
      return f_formatContext(p_model.contextWindow);
    case "inputPrice":
      return f_formatPrice(p_model.pricing.inputUsdPerMillionTokens);
    case "outputPrice":
      return f_formatPrice(p_model.pricing.outputUsdPerMillionTokens);
    case "llbmRank":
    case "llbmScore":
      return fh_benchmarkText(f_getBenchmarkForModel(p_model, "llbm"));
    case "releaseDate":
      return p_model.releaseDate ?? "—";
  }
}

/**
 * Render rows as fixed-width text lines for a single `<text>` node.
 *
 * The host's reconciler does not reliably reorder `<For>` children inside this
 * panel (moves can silently no-op in scrollbox trees), so the table body is a
 * plain text block: sorting/searching become in-place text updates, which
 * always render. A leading space matches the header row's left padding.
 */
export function f_buildTableLines(
  p_rows: readonly ModelRecord[],
  p_columns: readonly TableColumn[],
): string[] {
  return p_rows.map(
    (p_model) =>
      ` ${p_columns
        .map((p_column) =>
          f_truncate(fh_tableCell(p_model, p_column.key), p_column.width).padEnd(
            p_column.width,
          ),
        )
        .join(" ")}`,
  );
}

export interface OverviewDerivedRows {
  rows: readonly ModelRecord[];
  totalCount: number;
  filteredCount: number;
}

export type OverviewCommand =
  | { kind: "toggle" }
  | { kind: "status" }
  | { kind: "update" }
  | { kind: "redraw" }
  | { kind: "sort"; key: ModelSortKey };

export const k_overviewUsage = "/mosp [toggle | status | update | redraw | sort <column>]";

const k_sortTokenAliases: Readonly<Record<string, ModelSortKey>> = {
  ctx: "contextWindow",
  llbm: "llbmRank",
  "input-price": "inputPrice",
  "output-price": "outputPrice",
};

/** Numeric and date columns read best descending on first selection. */
export function f_getDefaultSortDirection(p_key: ModelSortKey): SortDirection {
  if (
    p_key === "releaseDate" ||
    p_key === "llbmScore" ||
    p_key === "contextWindow"
  ) {
    return "desc";
  }
  return "asc";
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

/** Map controller state onto the service-layer filter options. */
export function f_buildFilterOptions(p_filters: OverviewFilters): ModelFilterOptions {
  return {
    freeOnly: p_filters.freeOnly,
  };
}

/** Filter then sort without mutating any input. */
export function f_deriveOverviewRows(
  p_models: readonly ModelRecord[],
  p_preferences: OverviewViewPreferences,
  p_filters: OverviewFilters,
): OverviewDerivedRows {
  const vl_filtered = f_filterModels(p_models, { freeOnly: p_filters.freeOnly });
  return {
    rows: f_sortModels(vl_filtered, p_preferences.sortKey, p_preferences.sortDirection),
    totalCount: p_models.length,
    filteredCount: vl_filtered.length,
  };
}

/** Parse the `/mosp` argument string; `undefined` means "invalid". */
export function f_parseOverviewCommand(p_raw: string): OverviewCommand | undefined {
  const vl_tokens = p_raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((p_token) => p_token.length > 0);
  const [vl_head, vl_target] = vl_tokens;
  if (vl_head === undefined || vl_head === "toggle") return { kind: "toggle" };
  if (vl_head === "status") return { kind: "status" };
  if (vl_head === "update") return { kind: "update" };
  if (vl_head === "redraw") return { kind: "redraw" };
  if (vl_head === "sort" && vl_target !== undefined) {
    const vl_key = fh_resolveSortToken(vl_target);
    return vl_key !== undefined ? { kind: "sort", key: vl_key } : undefined;
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
    case "llbmRank":
    case "llbmScore":
      return "LLBM";
    case "contextWindow":
      return "Ctx";
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
  if (p_source === "models-dev") return "models.dev";
  if (p_source === "llbm") return "llbm";
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
    return p_loading ? "refreshing…" : "no cached data — run /mosp update";
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
  p_filters: OverviewFilters,
  p_loading: boolean,
  p_lastError: string | null,
): string[] {
  const vl_lines: string[] = [];
  vl_lines.push(`status: ${f_buildStatusLine(p_snapshot, p_loading, p_lastError)}`);
  vl_lines.push(
    `sort: ${f_getSortKeyLabel(p_preferences.sortKey)} ${p_preferences.sortDirection === "asc" ? "ascending" : "descending"}`,
  );
  vl_lines.push(`models: ${p_rows.filteredCount} of ${p_rows.totalCount} shown`);
  vl_lines.push(`filters: ${fh_describeFilters(p_filters)}`);
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
  return vl_active.length > 0 ? vl_active.join(", ") : "none";
}

/** Compact sidebar strip: leader for the active ranking plus a hint. */
export function f_buildSidebarSummary(
  p_leader: ModelRecord | null,
  p_total: number,
): string {
  if (p_leader === null) return `${p_total} models · no LLBM data`;
  const vl_benchmark = f_getBenchmarkForModel(p_leader, "llbm");
  const vl_rank = f_formatRank(vl_benchmark?.rank ?? null);
  const vl_score = f_formatScore(vl_benchmark?.score ?? null);
  return `${p_total} models · LLBM ${vl_rank} ${f_truncate(p_leader.name, 18)} ${vl_score}`;
}

/** Short snapshot description for update toasts. */
export function f_describeSnapshot(p_snapshot: ModelOverviewSnapshot): string {
  return `${p_snapshot.status.state} · ${p_snapshot.models.length} models · ${p_snapshot.warnings.length} warning(s)`;
}

export interface OverviewController {
  readonly cache: OverviewCache;
  /** Controller-owned reactive state — the only source used for rendering. */
  readonly sortKey: Accessor<ModelSortKey>;
  readonly sortDirection: Accessor<SortDirection>;
  readonly collapsed: Accessor<boolean>;
  readonly filters: Accessor<OverviewFilters>;
  /** Plain snapshot of the current prefs (status dialogs, derivations). */
  readonly preferences: () => OverviewViewPreferences;
  readonly snapshot: Accessor<ModelOverviewSnapshot | undefined>;
  readonly loading: Accessor<boolean>;
  readonly lastError: Accessor<string | null>;
  readonly rows: Accessor<OverviewDerivedRows>;
  readonly rankingLeader: Accessor<ModelRecord | null>;
  /** Whether header-click collapse is enabled (env-gated, default off). */
  readonly headerCollapseEnabled: boolean;
  readonly toggleFreeOnly: () => void;
  readonly clearFilters: () => void;
  readonly toggleSort: (p_key: ModelSortKey) => void;
  readonly toggleCollapsed: () => void;
  readonly loadSnapshot: () => Promise<void>;
  readonly refresh: (p_force: boolean) => Promise<ModelOverviewSnapshot | undefined>;
}

/** Build the controller bound to a host `Plugin.Context` and its panel name. */
export function f_createOverviewController(
  p_context: Plugin.Context,
  p_panelName: string,
): OverviewController {
  const vl_cache = f_createFileCache(f_getDefaultCacheDirectory());
  const vl_headerCollapseEnabled = f_resolveHeaderCollapseEnabled();

  // Host stores: persistence only (write-through + one-time read), because our
  // Solid instance cannot observe host-created stores. See module header.
  const [vl_preferences, vl_setPreferences] = p_context.storage.store<OverviewViewPreferences>(
    k_preferencesStorageKey,
    { initial: { ...k_defaultViewPreferences } },
  );
  const [vl_filtersStore, vl_setFiltersStore] = p_context.storage.memory<OverviewFilters>(
    k_filtersStorageKey,
    { initial: { ...k_defaultFilters } },
  );

  // Resolve initial values once, folding legacy/partial shapes back to defaults.
  const vl_storedSortKey: unknown = vl_preferences.sortKey;
  const vl_storedSortDirection: unknown = vl_preferences.sortDirection;
  const vl_storedCollapsed: unknown = vl_preferences.collapsed;
  const vl_initialSortKey: ModelSortKey = f_isModelSortKey(vl_storedSortKey)
    ? vl_storedSortKey
    : k_defaultSortKey;
  const vl_initialSortDirection: SortDirection = f_isSortDirection(vl_storedSortDirection)
    ? vl_storedSortDirection
    : k_defaultSortDirection;
  const vl_initialCollapsed = f_resolveCollapsedState(
    vl_headerCollapseEnabled,
    typeof vl_storedCollapsed === "boolean" ? vl_storedCollapsed : false,
  );
  if (
    !f_isModelSortKey(vl_storedSortKey) ||
    !f_isSortDirection(vl_storedSortDirection) ||
    typeof vl_storedCollapsed !== "boolean" ||
    (!vl_headerCollapseEnabled && vl_storedCollapsed === true)
  ) {
    void vl_setPreferences((draft) => {
      draft.sortKey = vl_initialSortKey;
      draft.sortDirection = vl_initialSortDirection;
      draft.collapsed = vl_initialCollapsed;
    });
  }
  const vl_initialFilters: OverviewFilters = {
    freeOnly: typeof vl_filtersStore.freeOnly === "boolean" ? vl_filtersStore.freeOnly : false,
  };

  // Controller-owned signals: the rendering source of truth.
  const [vl_sortKey, vl_setSortKey] = createSignal<ModelSortKey>("llbmRank");
  const [vl_sortDirection, vl_setSortDirection] = createSignal<SortDirection>("asc");
  const [vl_collapsed, vl_setCollapsed] = createSignal<boolean>(false);
  const [vl_filters, vl_setFilters] = createSignal<OverviewFilters>(vl_initialFilters);
  const [vl_snapshot, vl_setSnapshot] = createSignal<ModelOverviewSnapshot | undefined>(undefined);
  const [vl_loading, vl_setLoading] = createSignal(false);
  const [vl_lastError, vl_setLastError] = createSignal<string | null>(null);

  const fh_preferencesSnapshot = (): OverviewViewPreferences => ({
    sortKey: vl_sortKey(),
    sortDirection: vl_sortDirection(),
    collapsed: vl_collapsed(),
  });

  const vl_rows = createMemo(() => {
    const vl_derived = f_deriveOverviewRows(
      vl_snapshot()?.models ?? [],
      fh_preferencesSnapshot(),
      vl_filters(),
    );
    return vl_derived;
  });
  const vl_rankingLeader = createMemo(() => {
    const vl_models = vl_snapshot()?.models ?? [];
    // Default to LLMBM rank
    const vl_key: ModelSortKey = "llbmRank";
    return f_sortModels(vl_models, vl_key, "asc")[0] ?? null;
  });

  // The host never repaints a mounted plugin subtree (verified 2026-10-25:
  // imperative node writes execute, but pixels only refresh on a new mount).
  // Every mutation therefore paints through a fresh mount: coalesce repaint
  // requests per microtask and remount the panel (close → open). Only repaints
  // when THIS plugin's panel is the active one; `presentation: "panel"` matches
  // the toggle path. See docs/architecture/ui-integration.md.
  let vl_repaintQueued = false;

  function fh_pokeRender(): void {
    if (vl_repaintQueued) {
      return;
    }

    vl_repaintQueued = true;
    queueMicrotask(() => {
      vl_repaintQueued = false;

      const vl_current = p_context.ui.panel.current();

      if (vl_current === undefined || vl_current.name !== p_panelName) {
        return;
      }

      p_context.ui.panel.close();
      p_context.ui.panel.open(p_panelName, { presentation: "panel" });
    });
  }

  function f_toggleFreeOnly(): void {
    const vl_next = !vl_filters().freeOnly;
    vl_setFilters((p_current) => ({ ...p_current, freeOnly: vl_next }));
    void vl_setFiltersStore((draft) => {
      draft.freeOnly = vl_next;
    });
    fh_pokeRender();
  }

  function f_clearFilters(): void {
    vl_setFilters({ freeOnly: false });
    void vl_setFiltersStore((draft) => {
      draft.freeOnly = false;
    });
    fh_pokeRender();
  }

  function f_toggleSort(p_key: ModelSortKey): void {
    const vl_next = f_nextSortState(fh_preferencesSnapshot(), p_key);
    vl_setSortKey(vl_next.sortKey);
    vl_setSortDirection(vl_next.sortDirection);
    void vl_setPreferences((draft) => {
      draft.sortKey = vl_next.sortKey;
      draft.sortDirection = vl_next.sortDirection;
    });
    fh_pokeRender();
  }

  function f_toggleCollapsed(): void {
    if (!vl_headerCollapseEnabled) return;
    const vl_next = !vl_collapsed();
    vl_setCollapsed(vl_next);
    void vl_setPreferences((draft) => {
      draft.collapsed = vl_next;
    });
    fh_pokeRender();
  }

  /** Provider display names keyed by provider id, from the host catalog. */
  function fh_providerNames(): Record<string, string> {
    const vl_providerNames: Record<string, string> = {};

    for (const vl_provider of p_context.data.location.provider.list(p_context.location) ?? []) {
      const vl_id = vl_provider.id;
      const vl_name = vl_provider.name;
      if (typeof vl_id === "string" && vl_id.length > 0 && typeof vl_name === "string" && vl_name.length > 0) {
        vl_providerNames[vl_id] = vl_name;
      }
    }

    return vl_providerNames;
  }

  /**
   * Host-first catalog read (Adjustment 17): the live location catalog without
   * syncing. This is a local host read; it never touches the network directly.
   */
  function fh_readHostCatalog(): AdapterResult<readonly ModelRecord[]> {
    try {
      return f_parseOpencodeModels(
        p_context.data.location.model.list(p_context.location) ?? [],
        {
          observedAt: new Date().toISOString(),
          providerNames: fh_providerNames(),
        },
      );
    } catch {
      return f_adapterFail("host catalog read failed");
    }
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
    return f_parseOpencodeModels(
      p_context.data.location.model.list(p_context.location) ?? [],
      {
        observedAt: p_loadContext.now.toISOString(),
        providerNames: fh_providerNames(),
      },
    );
  }

  async function fh_loadLlbm(
    p_loadContext: OverviewLoadContext,
  ): Promise<AdapterResult<readonly ModelBenchmark[]>> {
    return f_fetchLlbmBenchmarks({
      timeoutMs: p_loadContext.timeoutMs,
      ...(p_loadContext.signal !== null ? { signal: p_loadContext.signal } : {}),
    });
  }

  async function fh_loadModelsDev(
    p_loadContext: OverviewLoadContext,
  ): Promise<AdapterResult<ModelsDevCrosswalk>> {
    return f_fetchModelsDevCrosswalk({
      timeoutMs: p_loadContext.timeoutMs,
      ...(p_loadContext.signal !== null ? { signal: p_loadContext.signal } : {}),
    });
  }

  async function f_loadSnapshot(): Promise<void> {
    try {
      vl_setSnapshot(
        await f_getModelOverviewFromHost({
          cache: vl_cache,
          hostModels: fh_readHostCatalog(),
        }),
      );
      fh_pokeRender();
    } catch {
      vl_setLastError("snapshot read failed");
      fh_pokeRender();
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
        loadLlbm: fh_loadLlbm,
        loadModelsDev: fh_loadModelsDev,
        force: p_force,
        modelTtlMs: vl_ttls.modelTtlMs,
        benchmarkTtlMs: vl_ttls.benchmarkTtlMs,
        timeoutMs: f_resolveRequestTimeoutMs(),
      });
      vl_setSnapshot(vl_next);
      return vl_next;
    } catch {
      vl_setLastError("refresh failed unexpectedly");
      await f_loadSnapshot();
      return vl_snapshot();
    } finally {
      vl_setLoading(false);
      fh_pokeRender();
    }
  }

  return {
    cache: vl_cache,
    sortKey: vl_sortKey,
    sortDirection: vl_sortDirection,
    collapsed: vl_collapsed,
    filters: vl_filters,
    preferences: fh_preferencesSnapshot,
    snapshot: vl_snapshot,
    loading: vl_loading,
    lastError: vl_lastError,
    rows: vl_rows,
    rankingLeader: vl_rankingLeader,
    headerCollapseEnabled: vl_headerCollapseEnabled,
    toggleFreeOnly: f_toggleFreeOnly,
    clearFilters: f_clearFilters,
    toggleSort: f_toggleSort,
    toggleCollapsed: f_toggleCollapsed,
    loadSnapshot: f_loadSnapshot,
    refresh: f_refresh,
  };
}