# Development Setup

Project: `opencode_model_overview` · OpenCode plugin · Bun + TypeScript (strict) · TUI UI via SolidJS/OpenTUI.
Master spec: `docs/KNOWLEDGE_03.md` · consolidated plan: `docs/PLAN.md`.

## Prerequisites

Verified on the development machine (2026-10-24):

- Bun `1.4.2`
- direnv `2.37.1`
- Git `2.55.0` (owner performs commits/pushes)
- Node `v24.18.0` (satisfies ESLint 10 engines)
- OpenCode `v2.1.4` — the targeted plugin host and the pinned `@opencode/plugin` version

## Setup

```bash
direnv allow   # user action: approves loading .envrc in your shell
bun install    # creates/validates bun.lock; versions are pinned exactly
bun run typecheck
bun run lint
bun test
```

`bun run check` runs all three gates sequentially.

## Version policy result (spec §5.2)

At setup time (2026-10-24) the published stables were:

| Package | Latest stable | Decision |
|---|---|---|
| `typescript` | 7.0.2 | **Not used.** `typescript-eslint@8.72.0` (latest) peer-supports `typescript >=4.8.4 <6.1.0`, so TS 7 is not yet compatible with the lint toolchain. |
| `typescript` (6.x line) | **6.0.3** | **Pinned.** Satisfies the fallback rule "otherwise use TypeScript 6.0 if stable and compatible". |
| `eslint` | 10.13.0 | Pinned; supported by `typescript-eslint@8.72.0` (`^8.57 \|\| ^9 \|\| ^10`). |
| `typescript-eslint` | 8.72.0 | Pinned. |
| `@opencode/plugin` | 2.1.4 | Pinned — exact match to the installed OpenCode release. |
| `@opentui/core` / `@opentui/solid` | 0.6.8 | Pinned as devDependencies; declared as `>=0.6.8` peerDependencies (OpenCode ships its own OpenTUI at runtime). |
| `solid-js` | 1.9.17 | devDependency; peer range `>=1.9.0`. |

Re-check TS 7 compatibility with the lint toolchain when `typescript-eslint` releases a version supporting `>=6.1`; then upgrade per the policy.

## OpenCode plugin facts used by this project (verified against opencode.ai/v2 docs, 2026-10-24)

- Server plugin entry: `import { Plugin } from "@opencode/plugin"` → `Plugin.define({ id, setup })` (`src/index.ts`).
- TUI plugin entry: `import { Plugin } from "@opencode/plugin/tui"`; the package exposes it via the `./tui` export next to `.` (peer set above).
- Documented UI slots include `sidebar.content`, `sidebar.footer`, `session.composer.top`, `session.panel`, `home.footer(.status)`, `prompt.footer*`, `app`.
- `session.panel` contributions + `context.ui.panel.open(name)` provide a host-managed, focusable, resizable/fullscreen panel.
- Commands: `context.keymap.layer(...)` registers palette entries, slash commands (`slash: { name, aliases, arguments }`) and key bindings.
- Model/provider discovery in the TUI: `context.data.location.model.list(location)` etc.; server: `ctx.model.list()`. `Model.Info` carries `cost` tiers and `limit.context`.
- Persistence: `context.storage.store(key, { initial })` (durable, reactive) for UI preferences; `ctx.storage` for server-side plugin data.

## tsconfig deviations from the spec template (§5.4)

Additions required by the real toolchain (strictness was **not** weakened):

- `"jsx": "preserve"` + `"jsxImportSource": "@opentui/solid"` — required for the OpenTUI intrinsics (`box`, `text`, `b`, …); `solid-js` does not declare them (this was corrected during Phase 1). Bun transpiles, `tsc` only typechecks.
- `"esModuleInterop": true` — interop with the plugin SDK's CommonJS-shaped type packages.
- `include` covers both `src/**/*.ts` and `src/**/*.tsx`.

## direnv notes (spec §5.5, §2.1)

- `.envrc` holds safe defaults only; credentials (`HUGGINGFACE_TOKEN`, `OPENCODE_INFERENCE_API_KEY`) are commented out and must be exported locally, never committed.
- direnv loads variables into the **dev shell**. It does **not** automatically expose them to every OpenCode process (e.g. GUI launches). The plugin must read its environment at actual runtime and degrade gracefully when variables are absent.

## Loading the plugin during development

`.opencode/plugins/` is the project-local plugin directory, and OpenCode auto-loads it. A project plugin uses the published-package layout: a **directory** containing `index.ts` (server) and `tui.ts` (TUI). This repo has `.opencode/plugins/model-overview/index.ts` (inert server stub) and `.opencode/plugins/model-overview/tui.ts` (re-exports `src/tui.tsx`), so there is exactly one copy of plugin logic. A **flat** `.opencode/plugins/<name>.ts` is treated as a server plugin only and fails if it pulls in TUI/JSX code. Published usage uses the package `./tui` export plus `cli.json` `plugins` (terminal-only) or `opencode.json` `plugins`. Details and the verification checklist: `docs/architecture/ui-integration.md`.

## Planned scripts

`refresh:benchmarks` and `validate:data` scripts arrive in Phase 3 (adapters) — added to `package.json` together with their `scripts/*.ts` files so no dangling script entries exist.

## CI

`.github/workflows/ci.yml` (Phase 7) must run:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun test
```

CI only detects violations; it never runs `--fix`.
