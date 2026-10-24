import { Plugin } from "@opencode/plugin";

/**
 * Server-side plugin entry point.
 *
 * Phase 0 skeleton: intentionally inert. Model/pricing discovery and any
 * shared server behavior land here in later phases (docs/PLAN.md §7).
 * The interactive UI lives in `src/tui.tsx` (`@opencode/plugin/tui`).
 *
 * Default export is required by the OpenCode plugin loader — the one
 * sanctioned exception to the no-default-export rule (docs/naming-conventions.md).
 */
export default Plugin.define({
  id: "opencode_model_overview",
  setup() {
    // No server-side registration yet.
  },
});
