# UI integration — verified TUI API and model overview panel

**Verified:** 2026-10-24 against `@opencode/plugin@2.1.4` type definitions
(`dist/tui/*.d.ts`) and `@opentui/solid@0.6.8` (`src/types/elements.d.ts`,
`src/jsx-runtime.ts`). Everything below marked *verified* comes from those
types/sources, not from prose docs.

## Entry point and loading

```ts
import { Plugin, usePlugin } from "@opencode/plugin/tui";

export default Plugin.define({
  id: "opencode_model_overview.tui",
  setup(context) { /* register slots, keymap layers, storage */ },
});
```

- `setup` may return a cleanup function; the host calls it on unload.
- **Development loading (this repo):** `.opencode/plugins/model-overview/`
  is a plugin directory with the published-package layout: `index.ts` (inert
  server half) and `tui.ts` (TUI entry). The TUI entry re-exports `src/tui.tsx`,
  so the real code stays in `src/` and is type-checked.
  > **Important:** a flat file such as `.opencode/plugins/model-overview.ts`
  > is discovered as a **server** plugin only. TUI code placed there fails at
  > startup — the server runtime transpiles `.tsx` with a React JSX default and
  > reports `Cannot find package 'react'`. TUI plugins must live in a
  > subdirectory as `tui.ts`. Do not reintroduce a flat loader.
- **Distribution:** package `exports` maps `./tui` to `src/tui.tsx`; terminal-only
  plugins are listed in the user's `cli.json` (`plugins`). A published package
  does not need the `.opencode/plugins` shim.
- JSX **must** use `jsxImportSource: "@opentui/solid"`; the OpenTUI intrinsics
  (`box`, `text`, `input`, `scrollbox`, …) are declared by that `jsx-runtime`,
  not by `solid-js`.

## Architecture split (Phase 6)

- `src/ui/panel-controller.ts` — all state and pure logic, renderer-agnostic:
  preference/filter stores (persistence mirrors) plus controller-owned signals,
  snapshot signals, derived row memo
  (filter → sort), ranking-leader memo, cache reads, refresh flow, command
  parsing, and all display strings. Imported host types are **type-only**, so
  the module is unit-testable without the TUI runtime.
- `src/ui/format.ts` — pure display formatters (missing → `—`, never `0`).
- `src/tui.tsx` — SolidJS rendering only: panel table, chips, sidebar strip,
  dialogs, toasts, slot/keymap registration. No data logic.
- Reads are **cache-only** (`f_getModelOverview`); network access happens only
  through an explicit refresh (`f_refreshModelOverview` with the provider
  adapters). Opening the panel, toggling, sorting, and typing never fetch.

## Slots (`context.ui.slot`)

| Path | Input |
|---|---|
| `app` | `{}` |
| `home.footer` | `{}` |
| `home.footer.status` | `{}` |
| `prompt.footer`, `prompt.footer.status`, `prompt.footer.file` | `{ sessionID?, mode, showDetails }` |
| `session.composer.top` | `{ sessionID }` |
| **`session.panel`** | `PanelInput` (see below) |
| **`sidebar.content`** | `{ sessionID }` |
| `sidebar.footer` | `{ sessionID }` |

A claim names exactly one placement: `prepend | append | before | after |
replace`. Additive claims coexist; `replace` suppresses the original content and
descendant claims but keeps the boundary, so sibling `before`/`after` claims
still compose. At one anchor the last-enabled claim wins; an ancestor
replacement beats a descendant. Unknown paths degrade to the nearest surviving
ancestor. Returns a disposer.

### `PanelInput` (session.panel)

```ts
{
  name: string;            // set by ui.panel.open — contributions filter on it
  sessionID: string;
  width: number;           // read-only; the host owns sizing
  presentation: "panel" | "fullscreen";
  focused: boolean;
  focus(): void;
  close(): void;
  toggleFullscreen(): void;
}
```

Panel visibility is host state:

```ts
ui.panel.open("model-overview", { presentation: "panel" }): boolean
ui.panel.close(): void                    // only this plugin's panel
ui.panel.current(): { name, sessionID } | undefined   // reactive
```

`open` returns `false` when no session is active (handled with a warning
toast). The panel contribution renders only when the incoming slot `name`
matches `model-overview`.

## Keymap layer (`context.keymap.layer`)

The factory is pure and runs reactively; it returns:

```ts
{
  mode?: "global" | <input mode>,   // global = all modes
  priority?: number,
  commands: [{
    id, title, description, group,
    palette?: true,                 // command palette entry
    slash?: { name, aliases?, arguments?: true },  // prompt slash command
    bind?: false | string,          // config-bound shortcut; omitted = none
    suggested?: boolean | (() => boolean),
    run(input?: string, event?: KeyEvent): void | false | Promise<void>,
  }],
  bindings?: string[],              // ids of config-bound commands
}
```

- `slash.arguments: true` passes the raw argument string to `run(input)`.
- `keymap.dispatch(id, input)` triggers a command programmatically.
- `keymap.shortcuts(id)` returns formatted shortcuts for display.
- The `bindings` array enables commands whose key syntax comes from the
  **user's** configuration. We deliberately assign no `bind` ourselves:
  guessing key syntax or colliding with a host binding is worse than
  palette/slash-only. Users can bind `model_overview.*` ids in their config.

Registered commands (no binds):

| id | Purpose |
|---|---|
| `model_overview.toggle` | open/close the panel (suggested in palette) |
| `model_overview.status` | dialog with snapshot + per-source freshness |
| `model_overview.refresh` | `f_refreshModelOverview` with force, toast summary |
| `model_overview.command` | slash `/mosp` with raw args |

## Storage (`context.storage`)

- `store(key, { initial })` → durable, disk-persisted, live-synced across TUI
  instances; returns `[Store<T>, update]` where `update` mutates a draft.
- `memory(key, { initial })` → ephemeral, survives plugin hot reloads; gone
  when the TUI exits.

Keys used by the panel (preferences are never mixed with cached data):

| Key | Kind | Shape |
|---|---|---|
| `model-overview.preferences` | `store` | `{ sortKey, sortDirection, ranking, collapsed }` |
| `model-overview.filters` | `memory` | `{ freeOnly }` |

A stored shape from an older version is normalized once back to defaults at
startup. Benchmark/model data lives only in the file cache
(`docs/architecture/caching.md`).

## Mouse and rendering

- The `@opentui/solid` reconciler assigns unknown props with `node[name] =
  value`; `Renderable` defines setters for `onMouse`, `onMouseDown`,
  `onMouseUp`, `onMouseDrag`, `onMouseOver`, `onMouseOut`, `onMouseScroll`.
- **Pitfall (verified in `@opentui/core` 0.6.8 source):** `onMouse` is a
  catch-all listener that fires for *every* mouse event type, including hover
  moves — never bind activation to it. Activation uses `onMouseDown` (record the
  pressed target) plus `onMouseUp` (run the action only when the pressed target
  matches). The host dispatches `up` to the element under the cursor at release
  time, so the pressed-target guard prevents "press A, release over B" from
  firing B; the panel root also clears the pressed target on `up` as a safety
  net. Hover feedback is deliberately not visualized: mounted subtrees never
   repaint, so a hover-only update could never become visible (see below).
- **Press registry lives at module scope** (`g_pressedTarget`, not a
  component-local signal): the host can re-render or re-create a slot component
  between `down` and `up` (for example after the auto-focus that follows a
  press), and component-local bookkeeping is reset by that, silently cancelling
  every click. `onMouse` remains unused for activation.
- `input` maps `onInput`/`onChange`/`onSubmit` (value string) and the special
  `focused` prop; `scrollbox` supports `focused`, `stickyScroll`, `stickyStart`.
- **Painting model (verified empirically on opencode 2.1.4 / OpenTUI 0.6.8,
  2026-10-25):** the host never repaints a mounted plugin subtree. Host-store
  reactivity, plugin-owned signals, imperative `TextRenderable.content` writes
  (a `ReactiveText` probe component), `renderer.requestRender()`, and
  `invalidateIntrinsicSize()` were all proven to EXECUTE — diagnostic logs
  recorded correct new content — yet the screen stayed stale until a remount.
  The design therefore is: the controller coalesces every state mutation into a
  per-microtask panel remount (`fh_pokeRender` → `panel.close()` +
  `panel.open()` when our panel is active). The panel renders plain
  mount-time text; the table body is a single `f_buildTableLines` string.
  Costs: a brief flicker per interaction, scroll/focus reset, and the sidebar
  strip repaints only on its own mount.
- The table body avoids `<For>` row moves entirely: the reconciler's move path
  in scrollbox trees is unreliable (`_insertNode` silently appends when the
  anchor lookup fails, `_getParentNode` re-parents nodes to the `scrollbox`
  itself), which was the root cause of the earlier `<For>`-moves, `<Index>`,
  and keyed-`<Show>` attempts.
- Tokens used: `theme.text.base | muted | faint`, `theme.border.base`,
  `theme.background.raised.base` (all `RGBA`).
- `usePlugin()` returns the `Context` inside slot components — the supported way
  to reach `data`, `ui`, `theme` from a component.

## Panel behaviour (Phase 6)

1. `session.panel` renders a bordered, titled table with a header row that is
   clickable only when header-click collapse is enabled (see item 7) and a
   filter row containing only the `[free]` chip (search, the benchmark-presence
   and `[redraw]` chips were removed; data updates run through
   `/mosp update`, view repaints through `/mosp redraw`). Selectable chips
   render through `f_formatChipLabel(selected, false, label)`: `[>>free]` when
   active, `[free]` otherwise (hover state is never visualized).
2. Columns: Model, Provider, Ctx, In $/M, Out $/M, LLBM — each column header
   is clickable and shows `▲`/`▼` when active. Ctx sorts numerically and defaults
   to descending; release-date and benchmark-score columns also default to
   descending, everything else ascending; missing values always sort last. The
   price columns are 10 cells wide so `Out $/M ▲` stays on one line (an 8-wide
   column wrapped the arrow). Missing values render as `—`; benchmark cells show
   `#rank score`; `family_fallback`-mapped rows get a `~` prefix and are never
   presented as the model's own score.
3. Rows come from the controller's derived memo: the active filters (only the
   free chip remains in the UI; provider/presence filters stay available at the
   service layer), then the non-mutating comparator; missing values sort last
   in both directions.
4. Footer shows aggregate state, shortened per-source states, last refresh, and
   warning count; empty cache shows `no cached data — run /mosp
   update`, filtered-to-nothing shows a distinct message.
5. `sidebar.content` shows `◫ N models · LLBM #rank name score · panel
   open|closed · /mosp` (or `no LLBM data` when nothing is ranked). The leader
   is the best-ranked model by the active LLBM metric.
6. When header-click collapse is enabled, collapse state survives panel toggles;
   sorting and the free filter always survive toggles and collapse; repeated
   toggles never fetch.
7. Header-click collapse is **opt-in** via `OPENCODE_MODEL_OVERVIEW_HEADER_COLLAPSE`
   (`1|true|on|yes`, trimmed, case-insensitive; anything else or unset = disabled).
   While disabled (default) the `▸`/`▾` indicator is hidden, the header click is a
   no-op, and a stale persisted `collapsed: true` is normalized back to expanded on
   load. `/mosp toggle` opens/closes the whole panel and is unaffected.
8. Activation is press-and-release on the same target. Chips, sort headers, and
   the collapse header only fire when the release happens over the same target
   that was pressed — hovering alone never activates anything. Press bookkeeping
   is held in a module-scope signal (`g_pressedTarget`) so a host re-render
   between `down` and `up` cannot cancel the click. After a successful release
   the controller mutation schedules the coalesced remount that paints.

## Manual verification (owner, after build/run)

1. In this project directory, start or reload the TUI (`/reload` forces it).
2. `/mosp toggle` → panel appears; with
   `OPENCODE_MODEL_OVERVIEW_HEADER_COLLAPSE` exported (`=true`) the header click
   collapses/expands it; without it the header click does nothing and no `▸/▾`
   indicator is shown; repeating the command closes the panel.
3. `/mosp update` → update toast; footer freshness updates; no network on plain
   open. `/mosp redraw` re-reads the cache and repaints (info toast) without
   touching the network.
4. Click a column header → sort direction indicator flips; `/mosp sort
   input-price` matches the same state.
5. Clicking each column title (including Ctx) briefly flickers the panel and it
   re-mounts with the table reordered, both directions; the `Out $/M` sort arrow
   stays on the header line and `▲/▼` moves to the clicked column.
6. The `[free]` chip toggles `[>>free]` / `[free]` and repaints the list live
   (via the same remount). There is no search box and no `[redraw]` chip.
7. Hovering never activates or changes anything: activation requires
   press-and-release on the same target, and releasing over a different target
   does nothing. Press bookkeeping is module-scope, so clicks keep working even
   if the host re-renders the panel between press and release.
8. `/mosp status` → dialog with the full status breakdown.
9. Palette lists the `Model overview:` entries; slash `/mosp` autocompletes.
10. Stop a source (offline) → panel stays usable, footer shows `partial`/`stale`.

If the plugin fails to load, the service log
(`~/.local/share/opencode/log/opencode.log`) names the file and error.

## Risks / open items

- `data.location.model.list()` reactivity: reads happen inside the controller
  and are refreshed after `data.location.model.sync()`; host-store changes never
  drive plugin reactivity (dual runtime), so the controller mirrors all
  render-relevant state in its own signals.
- The close→open repaint workaround exists because the host does not repaint
  mounted slot subtrees; if upstream fixes the painting path, `fh_pokeRender`
  can revert to a plain `requestRender()`.
- Panel width is host-owned (default half of the available width, drag-resizable
  and persisted by the host). The plugin cannot request a width; a narrower
  default would require an upstream host option.
- Filter state is session-ephemeral (host memory mirror); only view preferences
  are durable.
- `session.panel` exists only in sessions; on the home screen `open()` returns
  `false` (handled with a warning toast).
