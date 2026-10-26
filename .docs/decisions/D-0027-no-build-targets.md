# D-0027 — No debug/release build targets

- **Date:** 2026-10-26 · **Status:** active · **Decided by:** owner ("Document only")
- **Requirement:** Coding Standard 15 — debug: fast compilation/start;
  release: minimal size, performant runtime; keep unused modules out of shipped
  targets.

## Decision

No build step is added. OpenCode loads this plugin directly from TypeScript
source:

- development: `.opencode/plugins/model-overview/{index,tui}.ts` re-export
  `src/index.ts` / `src/tui.tsx`;
- package: `package.json` `exports` → `./src/index.ts`, `./src/tui.tsx`.

Bun transpiles on load, so "debug" already means fastest start (no compile
step), and the runtime only imports modules reachable from the two entry
points — `scripts/`, `tests/` and fixtures are never loaded by the host.

## Size considerations already in place

- No runtime dependencies besides `@opencode/plugin`; UI libraries are peer
  dependencies supplied by the host.
- The LLMBM export (~8 MB) is fetched only on explicit update and cached as
  trimmed rows (`src/providers/llbm.ts`), never bundled.

## Revisit when

A published release must ship without TypeScript sources or with a size
budget: add `bun build` targets (`--minify`, externals for peers, sourcemaps
for debug) and point `exports` at `dist/`.
