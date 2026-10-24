/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { createMemo, For, Show } from "solid-js";

/**
 * Model Overview — Phase 1 feasibility proof of concept (TUI).
 *
 * Scope of this file right now:
 * - claim the `session.panel` slot with a panel named `model-overview`
 * - claim a compact strip inside `sidebar.content`
 * - expose `/model-overview` (slash, with arguments) plus palette commands
 *
 * The panel lists the models the location currently exposes through the
 * OpenCode client (`ModelInfo`). Prices shown here are the first cost tier in
 * USD per million tokens, exactly as the registry reports them. GPQA and
 * LiveCodeBench columns are intentionally absent until Phase 3–4 wires the
 * verified sources in; nothing is fabricated.
 */

const k_PANEL_NAME = "model-overview";
const k_PREFERENCES_KEY = "model-overview.preferences";
const k_MAX_VISIBLE_MODELS = 12;
const k_USAGE =
  "/model-overview [toggle | status | refresh | sort gpqa|input-price|output-price | ranking gpqa|livecodebench]";

type SortField = "gpqa" | "input-price" | "output-price";
type RankingSource = "gpqa" | "livecodebench";

interface OverviewPreferences {
  sort: SortField;
  ranking: RankingSource;
}

type OverviewCommand =
  | { readonly kind: "toggle" }
  | { readonly kind: "status" }
  | { readonly kind: "refresh" }
  | { readonly kind: "sort"; readonly field: SortField }
  | { readonly kind: "ranking"; readonly ranking: RankingSource };

/** The subset of the host's panel input this PoC renders from. */
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

function f_parseCommand(raw: string): OverviewCommand | undefined {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const [head, target] = tokens;

  if (head === undefined || head === "toggle") return { kind: "toggle" };
  if (head === "status") return { kind: "status" };
  if (head === "refresh") return { kind: "refresh" };
  if (head === "sort") {
    if (target === "gpqa" || target === "input-price" || target === "output-price") {
      return { kind: "sort", field: target };
    }
    return undefined;
  }
  if (head === "ranking") {
    if (target === "gpqa" || target === "livecodebench") {
      return { kind: "ranking", ranking: target };
    }
    return undefined;
  }
  return undefined;
}

function f_formatPrice(usdPerMillion: number): string {
  if (usdPerMillion === 0) return "free";
  return `$${usdPerMillion.toFixed(2)}/M`;
}

function f_formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
  return `${Math.round(tokens / 1000)}K ctx`;
}

function ModelOverviewPanel(props: {
  readonly input: PanelView;
  readonly preferences: OverviewPreferences;
}) {
  const context = usePlugin();
  const models = createMemo(() => context.data.location.model.list(context.location) ?? []);
  const visible = createMemo(() => models().slice(0, k_MAX_VISIBLE_MODELS));

  return (
    <Show when={props.input.name === k_PANEL_NAME}>
      <box
        flexDirection="column"
        padding={1}
        gap={1}
        border={true}
        borderStyle="single"
        borderColor={context.theme.border.base}
        backgroundColor={context.theme.background.raised.base}
        title="Model Overview — Phase 1 PoC"
        bottomTitle="esc closes · /model-overview toggle"
        bottomTitleAlignment="right"
      >
        <text fg={context.theme.text.muted}>
          {models().length} models · sort {props.preferences.sort} · ranking {props.preferences.ranking} · GPQA/LCB
          land in Phase 3–4
        </text>
        <For each={visible()}>
          {(model) => {
            const base = model.cost[0];
            const inputPrice = base ? f_formatPrice(base.input) : "n/a";
            const outputPrice = base ? f_formatPrice(base.output) : "n/a";
            const tiers = model.cost.length > 1 ? ` · ${model.cost.length} tiers` : "";
            return (
              <text fg={context.theme.text.base}>
                {model.providerID}/{model.modelID} · {f_formatContext(model.limit.context)} · in {inputPrice} · out{" "}
                {outputPrice}
                {tiers}
              </text>
            );
          }}
        </For>
        <Show when={models().length > k_MAX_VISIBLE_MODELS}>
          <text fg={context.theme.text.faint}>
            … {models().length - k_MAX_VISIBLE_MODELS} more — the sortable table arrives in Phase 4
          </text>
        </Show>
      </box>
    </Show>
  );
}

function SidebarStatus() {
  const context = usePlugin();
  const models = createMemo(() => context.data.location.model.list(context.location) ?? []);
  const state = createMemo(() => (context.ui.panel.current() === undefined ? "closed" : "open"));

  return (
    <box flexDirection="row" paddingLeft={1}>
      <text fg={context.theme.text.muted}>
        models {models().length} · overview {state()}
      </text>
    </box>
  );
}

function f_setup(context: Plugin.Context): () => void {
  const [preferences, setPreferences] = context.storage.memory<OverviewPreferences>(k_PREFERENCES_KEY, {
    initial: { sort: "gpqa", ranking: "gpqa" },
  });

  function f_toggle(): void {
    if (context.ui.panel.current() !== undefined) {
      context.ui.panel.close();
      context.ui.toast.show({ title: "Model overview", message: "Panel closed.", variant: "info" });
      return;
    }
    const opened = context.ui.panel.open(k_PANEL_NAME, { presentation: "panel" });
    if (!opened) {
      context.ui.toast.show({
        title: "Model overview",
        message: "No active session — open a session first.",
        variant: "warning",
      });
    }
  }

  function f_refresh(): void {
    context.ui.toast.show({
      title: "Model overview",
      message: "Phase 1 stub: refresh is wired to the real sources in Phase 3. No request was made.",
      variant: "info",
    });
  }

  function f_showStatus(): void {
    const models = context.data.location.model.list(context.location) ?? [];
    const panel = context.ui.panel.current();
    const lines = [
      `Plugin id: ${context.app ? "opencode_model_overview.tui" : "unknown"}`,
      `Models visible in this location: ${models.length}`,
      `Panel: ${panel?.name ?? "closed"}`,
      `Sort: ${preferences.sort} · Ranking: ${preferences.ranking}`,
      "Sources: OpenCode registry verified; HF GPQA + LiveCodeBench verified (see docs/api/).",
      "Not wired yet: benchmark columns, refresh, cache (Phase 2–4).",
    ];
    void context.ui.dialog.alert({ title: "Model overview — Phase 1 PoC", message: lines.join("\n") });
  }

  function f_runCommand(raw?: string): void {
    const command = f_parseCommand(raw ?? "");
    if (command === undefined) {
      context.ui.toast.show({
        title: "Model overview",
        message: `Unknown command. Usage: ${k_USAGE}`,
        variant: "warning",
      });
      return;
    }

    switch (command.kind) {
      case "toggle":
        f_toggle();
        return;
      case "status":
        f_showStatus();
        return;
      case "refresh":
        f_refresh();
        return;
      case "sort":
        void setPreferences((draft) => {
          draft.sort = command.field;
        });
        context.ui.toast.show({
          title: "Model overview",
          message: `Sort preference set to "${command.field}" (applied by the real table in Phase 4).`,
          variant: "info",
        });
        return;
      case "ranking":
        void setPreferences((draft) => {
          draft.ranking = command.ranking;
        });
        context.ui.toast.show({
          title: "Model overview",
          message: `Ranking source set to "${command.ranking}" (GPQA/LCB data arrives in Phase 3–4).`,
          variant: "info",
        });
        return;
    }
  }

  const disposePanel = context.ui.slot({
    append: "session.panel",
    render: (input) => <ModelOverviewPanel input={input} preferences={preferences} />,
  });
  const disposeSidebar = context.ui.slot({
    append: "sidebar.content",
    render: () => <SidebarStatus />,
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
        run: f_toggle,
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
        run: f_refresh,
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
    disposePanel();
    disposeSidebar();
  };
}

export default Plugin.define({ id: "opencode_model_overview.tui", setup: f_setup });
