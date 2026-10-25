/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { For, Show, createSignal } from "solid-js";
import type { ModelSortKey } from "./domain/model-sort";
import {
  f_buildSidebarSummary,
  f_buildStatusLine,
  f_buildStatusLines,
  f_buildTableLines,
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
 * - model data is read host-first: the live OpenCode location catalog wins
 *   whenever it parses, with the cache as fallback; benchmarks and the
 *   models.dev crosswalk come from the cache only; opening, toggling, sorting,
 *   and filtering never trigger a network request;
 * - `update` (palette or `/mosp update`) is the single explicit path that
 *   talks to external sources, with per-source failure isolation; `/mosp
 *   redraw` re-reads host + cache and repaints the view;
 * - missing values render as an em dash and are never invented.
 *
 * Painting model (verified on opencode 2.1.4 / OpenTUI 0.6.8, 2026-10-25):
 * the host never repaints a mounted plugin subtree, so every controller
 * mutation triggers a coalesced panel remount (close → open) in
 * `panel-controller`. This file therefore renders plain mount-time text only —
 * no reactive text components or render pokes. Hover is deliberately not
 * visualized: a hover-driven repaint could only work through another remount,
 * which would flicker constantly. See docs/architecture/ui-integration.md.
 */

const k_panelName = "model-overview";

// Interaction state is shared at module scope on purpose: the host may
// re-render (or re-create) the slot component between a mouse `down` and its
// `up`. Component-local signals would be reset inside that window and the
// pressed-target guard would cancel every click (all controls went dead).
const [g_pressedTarget, g_setPressedTarget] = createSignal<string | null>(null);

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
  readonly key: ModelSortKey;
  readonly label: string;
  readonly width: number;
}

const k_columns: readonly OverviewColumn[] = [
  { key: "name", label: "Model", width: 24 },
  { key: "providerName", label: "Provider", width: 14 },
  { key: "contextWindow", label: "Ctx", width: 6 },
  { key: "inputPrice", label: "In $/M", width: 10 },
  { key: "outputPrice", label: "Out $/M", width: 10 },
  { key: "gpqaRank", label: "GPQA", width: 11 },
  { key: "livecodebenchRank", label: "LCB", width: 11 },
];

/**
 * Narrow panels drop the least important columns first so the header row
 * (the sort affordance) always fits on one line.
 */
function fh_visibleColumns(p_width: number): readonly OverviewColumn[] {
  return k_columns.filter((p_column) => {
    if (p_column.key === "contextWindow") return p_width >= 92;
    if (p_column.key === "providerName") return p_width >= 76;
    return true;
  });
}

function ModelOverviewPanel(props: {
  readonly input: PanelView;
  readonly controller: OverviewController;
}) {
  const context = usePlugin();
  // All values are read once per mount; a controller mutation remounts the
  // panel (the only path this host repaints), so plain expressions suffice.
  const vl_collapsed = props.controller.collapsed();
  const vl_rows = props.controller.rows();
  const vl_filters = props.controller.filters();
  const vl_modelCount = props.controller.snapshot()?.models.length ?? 0;
  const vl_visibleColumns = fh_visibleColumns(props.input.width);
  const vl_tableLines = f_buildTableLines(vl_rows.rows, vl_visibleColumns);
  const vl_sortKey = props.controller.sortKey();
  const vl_sortDirection = props.controller.sortDirection();
  const fh_chipColor = (p_active: boolean) =>
    p_active ? context.theme.text.base : context.theme.text.faint;
  // Activation is press-and-release on the same target: the host dispatches
  // mouse `up` to the element under the cursor at release time, so without the
  // pressed-target guard a press on one chip and release over another would
  // fire the other's action. `onMouse` is never used for activation because it
  // fires for every mouse event type, including hover moves. The registry lives
  // at module scope so a host re-render between down and up cannot cancel it.
  const fh_beginPress = (p_id: string): void => {
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
            ? "esc closes · click header to collapse · /mosp toggle"
            : "esc closes · /mosp toggle"
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
            g_setPressedTarget("panel-header");
          }}
          onMouseUp={() => fh_endPress("panel-header", props.controller.toggleCollapsed)}
        >
          <text fg={context.theme.text.base}>
            {props.controller.headerCollapseEnabled
              ? `${vl_collapsed ? "▸" : "▾"} Model Overview`
              : "Model Overview"}
          </text>
          <text fg={context.theme.text.faint}>
            {`${vl_modelCount} models${props.controller.loading() ? " · refreshing…" : ""}`}
          </text>
        </box>
        <Show when={!vl_collapsed}>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <box
              onMouseDown={() => fh_beginPress("chip-free")}
              onMouseUp={() => fh_endPress("chip-free", props.controller.toggleFreeOnly)}
            >
              <text fg={fh_chipColor(vl_filters.freeOnly)}>
                {f_formatChipLabel(vl_filters.freeOnly, false, "free")}
              </text>
            </box>
          </box>
          <box flexDirection="row" gap={1} paddingLeft={1}>
            <For each={vl_visibleColumns}>
              {(column) => {
                const vl_active = vl_sortKey === column.key;
                const vl_title = vl_active
                  ? `${column.label} ${vl_sortDirection === "asc" ? "▲" : "▼"}`
                  : column.label;
                return (
                  <box
                    width={column.width}
                    onMouseDown={() => fh_beginPress(`col:${column.key}`)}
                    onMouseUp={() =>
                      fh_endPress(`col:${column.key}`, () =>
                        props.controller.toggleSort(column.key),
                      )
                    }
                  >
                    <text fg={vl_active ? context.theme.text.base : context.theme.text.muted}>
                      {vl_title}
                    </text>
                  </box>
                );
              }}
            </For>
          </box>
          <scrollbox flexGrow={1}>
            <box flexDirection="column">
              <Show when={vl_rows.filteredCount === 0}>
                <text fg={context.theme.text.muted}>
                  {vl_rows.totalCount === 0
                    ? "No cached models — run /mosp update"
                    : "No models match the current filters"}
                </text>
              </Show>
              <text fg={context.theme.text.base}>{vl_tableLines.join("\n")}</text>
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
  const vl_summary = f_buildSidebarSummary(
    props.controller.rankingLeader(),
    props.controller.snapshot()?.models.length ?? 0,
    props.controller.ranking(),
  );
  const vl_panel = context.ui.panel.current() === undefined ? "closed" : "open";
  return (
    <box flexDirection="row" paddingLeft={1}>
      <text fg={context.theme.text.muted}>{`◫ ${vl_summary} · panel ${vl_panel} · /mosp`}</text>
    </box>
  );
}

function f_setup(context: Plugin.Context): () => void {
  const controller = f_createOverviewController(context, k_panelName);
  void controller.loadSnapshot();

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

  async function f_updateDataWithToast(): Promise<void> {
    const vl_snapshot = await controller.refresh(true);
    if (vl_snapshot === undefined) {
      context.ui.toast.show({
        title: "Model overview",
        message: "Update failed — see /mosp status for details.",
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
      controller.preferences(),
      controller.filters(),
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
      case "update":
        void f_updateDataWithToast();
        return;
      case "redraw":
        void controller.loadSnapshot();
        context.ui.toast.show({
          title: "Model overview",
          message: "View redrawn from cache.",
          variant: "info",
        });
        return;
      case "sort":
        controller.toggleSort(vl_command.key);
        context.ui.toast.show({
          title: "Model overview",
          message: `Sorting by ${f_getSortKeyLabel(vl_command.key)}.`,
          variant: "info",
        });
        return;
    }
  }

  const vl_disposePanel = context.ui.slot({
    append: "session.panel",
    render: (input) => (
      <ModelOverviewPanel input={input} controller={controller} />
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
        id: "model_overview.update",
        title: "Model overview: update data",
        group: "Model overview",
        palette: true,
        run: f_updateDataWithToast,
      },
      {
        id: "model_overview.redraw",
        title: "Model overview: redraw view",
        group: "Model overview",
        palette: true,
        run: () => {
          void controller.loadSnapshot();
        },
      },
      {
        id: "model_overview.command",
        title: "Model overview: run command",
        group: "Model overview",
        slash: { name: "mosp", arguments: true },
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
