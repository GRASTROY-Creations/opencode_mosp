import { Plugin } from "@opencode/plugin/tui";

/**
 * TUI (CLI) plugin entry point — loaded via the package `./tui` export.
 *
 * Phase 0 skeleton: intentionally inert. The Phase 1 feasibility PoC registers
 * here: `session.panel` + `sidebar.content` slots and the `/model-overview`
 * slash command (docs/PLAN.md §7, Phase 1).
 */
export default Plugin.define({
  id: "opencode_model_overview.tui",
  setup() {
    // No UI registration yet (Phase 1 gate).
  },
});
