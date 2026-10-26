# Platforms

Company minimum (General.md, applies unless redefined): **Linux, Android,
Windows, iOS**.

## What that means for this plugin

The plugin runs inside the OpenCode terminal UI, so the effective platform set
is **the intersection of the company minimum and the platforms where OpenCode
2.1.4 and Bun run**.

| OS | Status | Notes |
|---|---|---|
| Linux | target | Primary development host (PLAN §2). |
| Windows | target | Verified during development on Windows 11 (`bun run check`, live validator). |
| Android | depends on host | Only where OpenCode's TUI runs (e.g. a terminal environment such as Termux); not verified. |
| iOS | depends on host | No known OpenCode TUI host on iOS; not verified. |

## Plugin-side requirements

- No native modules; pure TypeScript loaded by Bun.
- File access limited to the cache directory (`src/services/cache.ts`), path
  built with `node:path` (portable separators).
- Network: HTTPS to `api.llmbenchmark.ai` and `models.dev`, only on explicit
  update.
