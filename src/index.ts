import { Plugin } from "@opencode/plugin";

/**
 * Server-side plugin entry point.
 *
 * Intentionally inert: all model, pricing, and benchmark work happens in the
 * TUI plugin; this entry exists so the package exposes both plugin halves.
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
