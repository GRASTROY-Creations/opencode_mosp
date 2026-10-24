/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { ModelBenchmark } from "./domain/model-benchmark";
import type { ModelSortKey } from "./domain/model-sort";
import { f_getBenchmarkForModel, type ModelRecord } from "./domain/model-record";
import {
  f_formatContext,
  f_formatPrice,
  f_formatRank,
  f_formatScore,
  f_truncate,
} from "./ui/format";
import {
  f_buildSidebarSummary,
  f_buildStatusLine,
  f_buildStatusLines,
  f_createOverviewController,
  f_describeSnapshot,
  f_formatChipLabel,
  f_getSortKeyLabel,
  f_parseOverviewCommand,
  k_overviewUsage,
  type OverviewController,
} from "./ui/panel-controller";

/**
 * Model Overview — TUI entrypoint (Phase 6).
 *
 * The panel is a pure renderer over `src/ui/panel-controller.ts`:
 * - data comes from the cache only (`f_getModelOverview`); opening, toggling,
 *   sorting, searching, and filtering never trigger a network request;
 * - `refresh` (chip, palette, or `/model-overview refresh`) is the single
 *   explicit path that talks to sources, with per-source failure isolation;
 * - missing values render as an em dash and are never invented.
 */

const k_panelName = "model-overview";

// Interaction state is shared at module scope on purpose: the host may
// re-render (or re-create) the slot component between a mouse `down` and its
// `up`. Component-local signals would be reset inside that window and the
// pressed-target guard would cancel every click (all controls went dead).
// See docs/architecture/ui-integration.md ("Mouse and rendering").
const [g_pressedTarget, g_setPressedTarget] = createSignal<string | null>(null);
const [g_hoveredChip, g_setHoveredChip] = createSignal<string | null>(null);

/** The subset of the host's panel input this panel renders from. */
interface PanelView {
  readonly name: string;
  readonly sessionID: string;
  readonly width: number;
  readonly presentation: "panel" | "fullscreen";
  readonly focused: boolean;
  readonly focus: () => void;
  readonly close: () => void;
  readonly toggleFullscreen: () => void;
}

interface OverviewColumn {
  readonly key: ModelSortKey | null;
  readonly label: string;
  readonly width: number;
}

const k_columns: readonly OverviewColumn[] = [
  { key: "name", label: "Model", width: 24 },
  { key: "providerName", label: "Provider", width: 14 },
  { key: null, label: "Ctx", width: 6 },
  { key: "inputPrice", label: "In $/M", width: 10 },
  { key: "outputPrice", label: "Out $/M", width: 10 },
  { key: "gpqaRank", label: "GPQA", width: 11 },
  { key: "livecodebenchRank", label: "LCB", width: 11 },
];

/** `#rank score` when both exist; a lone value still renders. */
function f_formatBenchmarkCell(p_benchmark: ModelBenchmark | null): string {
  if (p_benchmark === null) return "—";
  const vl_parts: string[] = [];
  if (p_benchmark.rank !== null) vl_parts.push(f_formatRank(p_benchmark.rank));
  if (p_benchmark.score !== null) vl_parts.push(f_formatScore(p_benchmark.score));
  return vl_parts.length > 0 ? vl_parts.join(" ") : "—";
}

function OverviewRow(props: { readonly model: ModelRecord; readonly onMouseDown: () => void }) {
  const context = usePlugin();
  const vl_gpqa = f_getBenchmarkForModel(props.model, "gpqa");
  const vl_liveCodeBench = f_getBenchmarkForModel(props.model, "livecodebench");
  return (
    <box flexDirection="row" gap={1} paddingLeft={1} onMouseDown={props.onMouseDown}>
      <box width={24}>
        <text fg={context.theme.text.base}>{f_truncate(props.model.name, 23)}</text>
      </box>
      <box width={14}>
        <text fg={context.theme.text.muted}>{f_truncate(props.model.providerName, 13)}</text>
      </box>
      <box width={6}>
        <text fg={context.theme.text.muted}>{f_formatContext(props.model.contextWindow)}</text>
      </box>
      <box width={10}>
        <text fg={context.theme.text.base}>
          {f_formatPrice(props.model.pricing.inputUsdPerMillionTokens)}
        </text>
      </box>
      <box width={10}>
        <text fg={context.theme.text.base}>
          {f_formatPrice(props.model.pricing.outputUsdPerMillionTokens)}
        </text>
      </box>
      <box width={11}>
        <text fg={context.theme.text.base}>{f_formatBenchmarkCell(vl_gpqa)}</text>
      </box>
      <box width={11}>
        <text fg={context.theme.text.base}>{f_formatBenchmarkCell(vl_liveCodeBench)}</text>
      </box>
    </box>
  );
}

function ModelOverviewPanel(props: {
  readonly input: PanelView;
  readonly controller: OverviewController;
  /** Chip-initiated refresh: routed through the toast path in f_setup. */
  readonly onRefresh: () => void;
}) {
  const context = usePlugin();
  const [vl_searchFocused, vl_setSearchFocused] = createSignal(false);
  const vl_collapsed = () => props.controller.preferences.collapsed;
  const vl_rows = () => props.controller.rows();
  const vl_modelCount = () => props.controller.snapshot()?.models.length ?? 0;
  const fh_chipColor = (p_active: boolean) =>
    p_active ? context.theme.text.base : context.theme.text.faint;
  // Search takes focus only from its own click; every other click clears it.
  const fh_blurSearch = (): void => {
    vl_setSearchFocused(false);
  };
  // Hover is transient cursor focus. The guarded clear keeps a fast hand-off
  // from one chip to the next safe (out may fire after the next over).
  const fh_setChipHover = (p_id: string, p_hovered: boolean): void => {
    if (p_hovered) {
      g_setHoveredChip(p_id);
      return;
    }
    g_setHoveredChip((p_current) => (p_current === p_id ? null : p_current));
  };
  // Activation is press-and-release on the same target: the host dispatches
  // mouse `up` to the element under the cursor at release time, so without the
  // pressed-target guard a press on one chip and release over another would
  // fire the other's action. `onMouse` is never used for activation because it
  // fires for every mouse event type, including hover moves. The registry lives
  // at module scope so a host re-render between down and up cannot cancel it.
  const fh_beginPress = (p_id: string): void => {
    fh_blurSearch();
    g_setPressedTarget(p_id);
  };
  const fh_endPress = (p_id: string, p_action: () => void): void => {
    if (g_pressedTarget() === p_id) p_action();
    g_setPressedTarget(null);
  };

  return (
    <Show when={props.input.name === k_panelName}>
      <box
        flexDirection="column"
        gap={0}
        border={true}
        borderStyle="single"
        borderColor={context.theme.border.base}
        backgroundColor={context.theme.background.raised.base}
        title="Model Overview"
        bottomTitle={
          props.controller.headerCollapseEnabled
            ? "esc closes · click header to collapse · /model-overview toggle"
            : "esc closes · /model-overview toggle"
        }
        bottomTitleAlignment="right"
        onMouseUp={() => {
          g_setPressedTarget(null);
        }}
      >
        <box
          flexDirection="row"
          gap={1}
          paddingLeft={1}
          onMouseDown={() => {
            fh_blurSearch();
            g_setHoveredChip(null);
            g_setPressedTarget("panel-header");
          }}
          onMouseUp={() => fh_endPress("panel-header", props.controller.toggleCollapsed)}
        >
          <text fg={context.theme.text.base}>
            {props.controller.headerCollapseEnabled
              ? `${vl_collapsed() ? "▸" : "▾"} Model Overview`
              : "Model Overview"}
          </text>
          <text fg={context.theme.text.faint}>
            {vl_modelCount()} models{props.controller.loading() ? " · refreshing…" : ""}
          </text>
        </box>
        <Show when={!vl_collapsed()}>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <box
              onMouseOver={() => fh_setChipHover("gpqa", true)}
              onMouseOut={() => fh_setChipHover("gpqa", false)}
              onMouseDown={() => fh_beginPress("chip-gpqa")}
              onMouseUp={() => fh_endPress("chip-gpqa", () => props.controller.setRanking("gpqa"))}
            >
              <text fg={fh_chipColor(props.controller.preferences.ranking === "gpqa")}>
                {f_formatChipLabel(
                  props.controller.preferences.ranking === "gpqa",
                  g_hoveredChip() === "gpqa",
                  "GPQA",
                )}
              </text>
            </box>
            <box
              onMouseOver={() => fh_setChipHover("livecodebench", true)}
              onMouseOut={() => fh_setChipHover("livecodebench", false)}
              onMouseDown={() => fh_beginPress("chip-lcb")}
              onMouseUp={() =>
                fh_endPress("chip-lcb", () => props.controller.setRanking("livecodebench"))
              }
            >
              <text fg={fh_chipColor(props.controller.preferences.ranking === "livecodebench")}>
                {f_formatChipLabel(
                  props.controller.preferences.ranking === "livecodebench",
                  g_hoveredChip() === "livecodebench",
                  "LCB",
                )}
              </text>
            </box>
            <box
              onMouseOver={() => fh_setChipHover("refresh", true)}
              onMouseOut={() => fh_setChipHover("refresh", false)}
              onMouseDown={() => fh_beginPress("refresh")}
              onMouseUp={() =>
                fh_endPress("refresh", () => {
                  if (!props.controller.loading()) props.onRefresh();
                })
              }
            >
              <text fg={context.theme.text.muted}>
                {props.controller.loading()
                  ? "[refreshing…]"
                  : f_formatChipLabel(false, g_hoveredChip() === "refresh", "refresh")}
              </text>
            </box>
            <input
              placeholder="search"
              value={props.controller.search.text}
              focused={vl_searchFocused()}
              onInput={(p_value) => props.controller.setSearchText(p_value)}
              onSubmit={() => vl_setSearchFocused(false)}
              onMouseDown={() => {
                g_setPressedTarget(null);
                vl_setSearchFocused(true);
              }}
            />
          </box>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <box
              onMouseOver={() => fh_setChipHover("free", true)}
              onMouseOut={() => fh_setChipHover("free", false)}
              onMouseDown={() => fh_beginPress("chip-free")}
              onMouseUp={() => fh_endPress("chip-free", props.controller.toggleFreeOnly)}
            >
              <text fg={fh_chipColor(props.controller.filters.freeOnly)}>
                {f_formatChipLabel(
                  props.controller.filters.freeOnly,
                  g_hoveredChip() === "free",
                  "free",
                )}
              </text>
            </box>
            <box
              onMouseOver={() => fh_setChipHover("missing-gpqa", true)}
              onMouseOut={() => fh_setChipHover("missing-gpqa", false)}
              onMouseDown={() => fh_beginPress("chip-missing-gpqa")}
              onMouseUp={() =>
                fh_endPress("chip-missing-gpqa", props.controller.toggleMissingGpqa)
              }
            >
              <text fg={fh_chipColor(props.controller.filters.missingGpqa)}>
                {f_formatChipLabel(
                  props.controller.filters.missingGpqa,
                  g_hoveredChip() === "missing-gpqa",
                  "missing GPQA",
                )}
              </text>
            </box>
            <box
              onMouseOver={() => fh_setChipHover("missing-lcb", true)}
              onMouseOut={() => fh_setChipHover("missing-lcb", false)}
              onMouseDown={() => fh_beginPress("chip-missing-lcb")}
              onMouseUp={() =>
                fh_endPress("chip-missing-lcb", props.controller.toggleMissingLiveCodeBench)
              }
            >
              <text fg={fh_chipColor(props.controller.filters.missingLiveCodeBench)}>
                {f_formatChipLabel(
                  props.controller.filters.missingLiveCodeBench,
                  g_hoveredChip() === "missing-lcb",
                  "missing LCB",
                )}
              </text>
            </box>
          </box>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <For each={k_columns}>
              {(column) => {
                const vl_key = column.key;
                const vl_active = (): boolean =>
                  vl_key !== null && props.controller.preferences.sortKey === vl_key;
                return (
                  <box
                    width={column.width}
                    onMouseDown={() => {
                      if (vl_key === null) {
                        fh_blurSearch();
                      } else {
                        fh_beginPress(`col:${vl_key}`);
                      }
                    }}
                    onMouseUp={() => {
                      if (vl_key === null) return;
                      fh_endPress(`col:${vl_key}`, () => props.controller.toggleSort(vl_key));
                    }}
                  >
                    <text fg={vl_active() ? context.theme.text.base : context.theme.text.muted}>
                      {column.label}
                      {vl_active()
                        ? props.controller.preferences.sortDirection === "asc"
                          ? " ▲"
                          : " ▼"
                        : ""}
                    </text>
                  </box>
                );
              }}
            </For>
          </box>
          <scrollbox
            flexGrow={1}
            onMouseDown={() => {
              fh_blurSearch();
            }}
          >
            <box flexDirection="column">
              <Show when={vl_rows().filteredCount === 0}>
                <text fg={context.theme.text.muted}>
                  {vl_rows().totalCount === 0
                    ? "No cached models — run /model-overview refresh"
                    : "No models match the current search/filters"}
                </text>
              </Show>
              <For each={vl_rows().rows}>
                {(model) => <OverviewRow model={model} onMouseDown={fh_blurSearch} />}
              </For>
            </box>
          </scrollbox>
          <box paddingLeft={1}>
            <text fg={context.theme.text.faint}>
              {f_buildStatusLine(
                props.controller.snapshot(),
                props.controller.loading(),
                props.controller.lastError(),
              )}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
}

function SidebarStatus(props: { readonly controller: OverviewController }) {
  const context = usePlugin();
  const vl_summary = createMemo(() =>
    f_buildSidebarSummary(
      props.controller.rankingLeader(),
      props.controller.snapshot()?.models.length ?? 0,
      props.controller.preferences.ranking,
    ),
  );
  const vl_panel = createMemo(() =>
    context.ui.panel.current() === undefined ? "closed" : "open",
  );
  return (
    <box flexDirection="row" paddingLeft={1}>
      <text fg={context.theme.text.muted}>
        {`◫ ${vl_summary()} · panel ${vl_panel()} · /mo`}
      </text>
    </box>
  );
}

function f_setup(context: Plugin.Context): () => void {
  const controller = f_createOverviewController(context);
  void controller.loadFromCache();

  function f_togglePanel(): void {
    const vl_current = context.ui.panel.current();
    if (vl_current?.name === k_panelName) {
      context.ui.panel.close();
      context.ui.toast.show({ title: "Model overview", message: "Panel closed.", variant: "info" });
      return;
    }
    const vl_opened = context.ui.panel.open(k_panelName, { presentation: "panel" });
    if (!vl_opened) {
      context.ui.toast.show({
        title: "Model overview",
        message: "No active session — open a session first.",
        variant: "warning",
      });
    }
  }

  async function f_refreshWithToast(): Promise<void> {
    const vl_snapshot = await controller.refresh(true);
    if (vl_snapshot === undefined) {
      context.ui.toast.show({
        title: "Model overview",
        message: "Refresh failed — see /model-overview status for details.",
        variant: "warning",
      });
      return;
    }
    context.ui.toast.show({ title: "Model overview", message: f_describeSnapshot(vl_snapshot) });
  }

  function f_showStatus(): void {
    const vl_lines = f_buildStatusLines(
      controller.snapshot(),
      controller.rows(),
      controller.preferences,
      controller.search.text,
      controller.filters,
      controller.loading(),
      controller.lastError(),
    );
    void context.ui.dialog.alert({
      title: "Model overview status",
      message: vl_lines.join("\n"),
    });
  }

  function f_runCommand(raw?: string): void {
    const vl_command = f_parseOverviewCommand(raw ?? "");
    if (vl_command === undefined) {
      context.ui.toast.show({
        title: "Model overview",
        message: `Unknown command. Usage: ${k_overviewUsage}`,
        variant: "warning",
      });
      return;
    }
    switch (vl_command.kind) {
      case "toggle":
        f_togglePanel();
        return;
      case "status":
        f_showStatus();
        return;
      case "refresh":
        void f_refreshWithToast();
        return;
      case "sort":
        controller.toggleSort(vl_command.key);
        context.ui.toast.show({
          title: "Model overview",
          message: `Sorting by ${f_getSortKeyLabel(vl_command.key)}.`,
          variant: "info",
        });
        return;
      case "ranking":
        controller.setRanking(vl_command.ranking);
        context.ui.toast.show({
          title: "Model overview",
          message: `Ranking on ${vl_command.ranking === "gpqa" ? "GPQA" : "LiveCodeBench"}.`,
          variant: "info",
        });
        return;
    }
  }

  const vl_disposePanel = context.ui.slot({
    append: "session.panel",
    render: (input) => (
      <ModelOverviewPanel
        input={input}
        controller={controller}
        onRefresh={() => {
          void f_refreshWithToast();
        }}
      />
    ),
  });
  const vl_disposeSidebar = context.ui.slot({
    append: "sidebar.content",
    render: () => <SidebarStatus controller={controller} />,
  });

  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "model_overview.toggle",
        title: "Model overview: toggle panel",
        group: "Model overview",
        palette: true,
        suggested: true,
        run: f_togglePanel,
      },
      {
        id: "model_overview.status",
        title: "Model overview: status",
        group: "Model overview",
        palette: true,
        run: f_showStatus,
      },
      {
        id: "model_overview.refresh",
        title: "Model overview: refresh data",
        group: "Model overview",
        palette: true,
        run: f_refreshWithToast,
      },
      {
        id: "model_overview.command",
        title: "Model overview: run command",
        group: "Model overview",
        slash: { name: "model-overview", aliases: ["mo"], arguments: true },
        run: f_runCommand,
      },
    ],
  }));

  return () => {
    vl_disposePanel();
    vl_disposeSidebar();
  };
}

export default Plugin.define({ id: "opencode_model_overview.tui", setup: f_setup });
