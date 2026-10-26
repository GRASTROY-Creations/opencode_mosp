/**
 * Project-local TUI entry for the MOSP plugin.
 *
 * OpenCode loads `<project>/.opencode/plugins/<name>/tui.ts` in the terminal
 * runtime. This thin loader exists so the real implementation stays in
 * `src/tui.tsx` and is type-checked with the rest of the repository; there is
 * exactly one copy of the plugin logic.
 *
 * Deliberately plain TypeScript (no JSX): the file is only a re-export, so the
 * host never needs to apply a JSX transform to the loader itself.
 */
export { default } from "../../../src/tui";
