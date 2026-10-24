# UI integration — verified TUI API and Phase 1 PoC

**Verified:** 2026-10-24 against `@opencode/plugin@2.1.4` type definitions
(`dist/tui/*.d.ts`) and `@opentui/solid@0.6.8` (`src/types/elements.d.ts`).
Everything below marked *verified* comes from those types, not from prose docs.

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
  is a plugin directory with the published-package layout: `index.ts` (server
  entry, inert in Phase 1) and `tui.ts` (TUI entry). The TUI entry re-exports
  `src/tui.tsx`, so the real code stays in `src/` and is type-checked.
  > **Important:** a flat file such as `.opencode/plugins/model-overview.ts`
  > is discovered as a **server** plugin only. TUI code placed there fails at
  > startup — the server runtime transpiles `.tsx` with a React JSX default and
  > reports `Cannot find package 'react'`. TUI plugins must live in a
  > subdirectory as `tui.ts`. Do not reintroduce a flat loader.
- **Distribution:** package `exports` maps `./tui` to `src/tui.tsx`; terminal-only
  plugins are listed in the user's `cli.json` (`plugins`). A published package
  does not need the `.opencode/plugins` shim.
- JSX **must** use `jsxImportSource: "@opentui/solid"`; the OpenTUI intrinsics
  (`box`, `text`, `b`, `span`, `scrollbox`, …) are declared by that
  `jsx-runtime`, not by `solid-js`.

## Slots (`context.ui.slot`)

| Path | Input |
|---|---|
| `app` | `{}` |
| `home.footer` | `{}` |
| `home.footer.status` | `{}` |
| `prompt.footer`, `prompt.footer.status`, `prompt.footer.file` | `{ sessionID?, mode, showDetails }` |
| `session.composer.top` | `{ sessionID }` |
| **`session.panel`** | `PanelInput` (see below) |
| `sidebar.content` | `{ sessionID }` |
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
  width: number;
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

`open` returns `false` when no session is active. This plugin does not render
anything until `current()?.name === "model-overview"` — the PoC checks the
incoming slot `name` and wraps output in `<Show>`.

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
- We deliberately assign **no** `bind` in Phase 1: guessing a key syntax or
  colliding with a host binding is worse than palette/slash-only. Bindings can
  be added later through the user's config.

## Storage (`context.storage`)

- `store(key, { initial })` → durable, disk-persisted, live-synced across TUI
  instances; returns `[Store<T>, update]` where `update` mutates a draft.
- `memory(key, { initial })` → ephemeral, survives plugin hot reloads and is
  shared between old/new generations; gone when the TUI exits.

Preferences live in `memory("model-overview.preferences")` for the PoC. The
spec requires durable preferences; Phase 4 switches the key to `store()` and
keeps benchmark data in a separate cache (never mixed with prefs).

## Theme and rendering

- Tokens used: `theme.text.base | muted | faint`, `theme.border.base`,
  `theme.background.raised.base` (all `RGBA`).
- Intrinsics verified in `@opentui/solid`: `box` (flexDirection, padding*,
  gap, border, borderStyle, borderColor, backgroundColor, title,
  bottomTitle, …), `text` (`fg`), `b/strong/em/i/u/span/br/a`.
- `usePlugin()` returns the `Context` inside slot components — the supported way
  to reach `data`, `ui`, `theme` from a component.

## What the PoC does (`src/tui.tsx`)

1. Claims `session.panel` (append) → renders a bordered panel listing up to 12
   location models with `provider/modelID`, context window, and **base-tier**
   input/output price. Reads `context.data.location.model.list(location)`.
2. Claims `sidebar.content` (append) → one-line `models N · overview open|closed`
   strip.
3. Registers three palette commands (`toggle`, `status`, `refresh`) and one
   slash command `/model-overview` with alias `/mo` and raw arguments.
4. Parses `toggle | status | refresh | sort gpqa|input-price|output-price |
   ranking gpqa|livecodebench`; unsupported → toast with usage.
5. Stores `{ sort, ranking }` in memory storage; panel + sidebar read it.
6. No network calls, no benchmark data, no fabricated values. Data wiring is
   Phase 3–4; the only live data shown is real registry data.

## Manual verification (requires a build/run by the owner)

1. In this project directory, start or reload the TUI (config/plugin changes
   hot-reload; `/reload` forces it).
2. `/model-overview toggle` → panel appears; repeating closes it.
3. `/model-overview status` → dialog with model count, panel state, prefs.
4. `/model-overview sort input-price` → toast; status reflects the new pref.
5. Sidebar shows the compact strip; the panel shows real model rows.
6. Command palette lists the three `Model overview:` entries.

If the plugin fails to load, the service log
(`~/.local/share/opencode/log/opencode.log`) names the file and error.

## Risks / open items

- `data.location.model.list()` reactivity: read inside a Solid memo; if the host
  returns snapshots, the list may not live-update until invalidated.
- Panel height: no scrolling yet; the PoC truncates at 12 rows. Phase 4 uses a
  `scrollbox` + sortable table.
- `session.panel` exists only in sessions; on the home screen `open()` returns
  `false` (handled with a warning toast).
- Mouse interaction (click-to-collapse) is a Phase 5 concern; the API surface
  for pointer events on slots still needs verification.
