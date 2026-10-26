/** @jsxImportSource @opentui/solid */
import type { RGBA } from "@opentui/core";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { For, Show, createSignal, type JSX } from "solid-js";
import type { ModelSortKey } from "./domain/model-sort";
import {
  f_buildSidebarSummary,
  f_buildStatusLine,
  f_buildStatusLines,
  f_buildEmptyMessage,
  f_buildTableLines,
  f_createOverviewController,
  f_describeSnapshot,
  f_formatChipLabel,
  f_formatUpdateLabel,
  f_getSortKeyLabel,
  f_parseOverviewCommand,
  k_overviewUsage,
  type OverviewController,
} from "./ui/panel-controller";

/**
 * MOSP — TUI entrypoint.
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
 * which would flicker constantly. See .docs/guide/architecture/ui-integration.md.
 */

const k_panelName = "mosp";

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
  { key: "codingScore", label: "Coding", width: 8 },
  { key: "intelligenceScore", label: "Intel", width: 8 },
];

/**
 * Narrow panels drop the least important columns first so the header row
 * (the sort affordance) always fits on one line.
 */
function fh_visibleColumns(p_width: number): readonly OverviewColumn[] {
  return k_columns.filter((p_column) => {
    if (p_column.key === "contextWindow") return p_width >= 98;
    if (p_column.key === "providerName") return p_width >= 82;
    return true;
  });
}

function ModelOverviewPanel(props: {
  readonly input: PanelView;
  readonly controller: OverviewController;
  /** Toolbar `[update]` action; same path as `/mosp update` (toasts included). */
  readonly onUpdate: () => void;
}): JSX.Element {
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
  const vl_loading = props.controller.loading();
  const fh_chipColor = (p_active: boolean): RGBA =>
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
        title="MOSP"
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
            {props.controller.headerCollapseEnabled ? `${vl_collapsed ? "▸" : "▾"} MOSP` : "MOSP"}
          </text>
          <text fg={context.theme.text.faint}>
            {`${vl_modelCount} models${vl_loading ? " · refreshing…" : ""}`}
          </text>
        </box>
        <Show when={!vl_collapsed}>
          <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
            <box
              onMouseDown={() => fh_beginPress("chip-free")}
              onMouseUp={() => fh_endPress("chip-free", props.controller.toggleFreeOnly)}
            >
              <text fg={fh_chipColor(vl_filters.freeOnly)}>
                {f_formatChipLabel(vl_filters.freeOnly, "free")}
              </text>
            </box>
            {/* Spacer pushes the update button to the right edge. */}
            <box flexGrow={1} />
            <box
              onMouseDown={() => fh_beginPress("chip-update")}
              onMouseUp={() =>
                fh_endPress("chip-update", () => {
                  // Presses during a running update are ignored (refresh is deduplicated too).
                  if (!vl_loading) props.onUpdate();
                })
              }
            >
              <text fg={vl_loading ? context.theme.text.faint : context.theme.text.base}>
                {f_formatUpdateLabel(vl_loading)}
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
                <text fg={context.theme.text.muted}>{f_buildEmptyMessage(vl_rows.totalCount)}</text>
              </Show>
              <text fg={context.theme.text.base}>{vl_tableLines.join("\n")}</text>
            </box>
          </scrollbox>
          <box paddingLeft={1}>
            <text fg={context.theme.text.faint}>
              {f_buildStatusLine(
                props.controller.snapshot(),
                vl_loading,
                props.controller.lastError(),
              )}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
}

function SidebarStatus(props: { readonly controller: OverviewController }): JSX.Element {
  const context = usePlugin();
  const vl_summary = f_buildSidebarSummary(
    props.controller.leader(),
    props.controller.snapshot()?.models.length ?? 0,
  );
  const vl_panel = context.ui.panel.current() === undefined ? "closed" : "open";
  return (
    <box flexDirection="row" paddingLeft={1}>
      <text fg={context.theme.text.muted}>{`◫ ${vl_summary} · panel ${vl_panel} · /mosp`}</text>
    </box>
  );
}

function fh_setup(context: Plugin.Context): () => void {
  const controller = f_createOverviewController(context, k_panelName);
  void controller.loadSnapshot();

  function fh_togglePanel(): void {
    const vl_current = context.ui.panel.current();
    if (vl_current?.name === k_panelName) {
      context.ui.panel.close();
      context.ui.toast.show({ title: "MOSP", message: "Panel closed.", variant: "info" });
      return;
    }
    const vl_opened = context.ui.panel.open(k_panelName, { presentation: "panel" });
    if (!vl_opened) {
      context.ui.toast.show({
        title: "MOSP",
        message: "No active session — open a session first.",
        variant: "warning",
      });
    }
  }

  async function fh_updateDataWithToast(): Promise<void> {
    const vl_snapshot = await controller.refresh(true);
    if (vl_snapshot === undefined) {
      context.ui.toast.show({
        title: "MOSP",
        message: "Update failed — see /mosp status for details.",
        variant: "warning",
      });
      return;
    }
    context.ui.toast.show({ title: "MOSP", message: f_describeSnapshot(vl_snapshot) });
  }

  function fh_showStatus(): void {
    const vl_lines = f_buildStatusLines(
      controller.snapshot(),
      controller.rows(),
      controller.preferences(),
      controller.filters(),
      controller.loading(),
      controller.lastError(),
    );
    void context.ui.dialog.alert({
      title: "MOSP status",
      message: vl_lines.join("\n"),
    });
  }

  function fh_runCommand(raw?: string): void {
    const vl_command = f_parseOverviewCommand(raw ?? "");
    if (vl_command === undefined) {
      context.ui.toast.show({
        title: "MOSP",
        message: `Unknown command. Usage: ${k_overviewUsage}`,
        variant: "warning",
      });
      return;
    }
    switch (vl_command.kind) {
      case "toggle":
        fh_togglePanel();
        return;
      case "status":
        fh_showStatus();
        return;
      case "update":
        void fh_updateDataWithToast();
        return;
      case "redraw":
        void controller.loadSnapshot();
        context.ui.toast.show({
          title: "MOSP",
          message: "View redrawn from cache.",
          variant: "info",
        });
        return;
      case "sort":
        controller.toggleSort(vl_command.key);
        context.ui.toast.show({
          title: "MOSP",
          message: `Sorting by ${f_getSortKeyLabel(vl_command.key)}.`,
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
        onUpdate={() => {
          void fh_updateDataWithToast();
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
        id: "mosp.toggle",
        title: "MOSP: toggle panel",
        group: "MOSP",
        palette: true,
        suggested: true,
        run: fh_togglePanel,
      },
      {
        id: "mosp.status",
        title: "MOSP: status",
        group: "MOSP",
        palette: true,
        run: fh_showStatus,
      },
      {
        id: "mosp.update",
        title: "MOSP: update data",
        group: "MOSP",
        palette: true,
        run: fh_updateDataWithToast,
      },
      {
        id: "mosp.redraw",
        title: "MOSP: redraw view",
        group: "MOSP",
        palette: true,
        run: () => {
          void controller.loadSnapshot();
        },
      },
      {
        id: "mosp.command",
        title: "MOSP: run command",
        group: "MOSP",
        slash: { name: "mosp", arguments: true },
        run: fh_runCommand,
      },
    ],
  }));

  return () => {
    vl_disposePanel();
    vl_disposeSidebar();
  };
}

export default Plugin.define({ id: "opencode_mosp.tui", setup: fh_setup });
