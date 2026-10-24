/**
 * Project-local server half of the Model Overview plugin.
 *
 * OpenCode discovers a project plugin as a directory with the same layout as a
 * published package:
 *
 *   .opencode/plugins/model-overview/index.ts  ← server entry (this file)
 *   .opencode/plugins/model-overview/tui.ts    ← TUI entry
 *
 * Phase 1 has no server-side behaviour, so this only re-exports the inert
 * `Plugin.define` stub. Keeping it here documents the layout and prevents the
 * TUI-only module from being mistaken for a server plugin.
 */
export { default } from "../../../src/index";
