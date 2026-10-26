# D-0026 — Architecture documented as MVC; VIPER deferred

- **Date:** 2026-10-26 · **Status:** active · **Decided by:** owner ("Document mapping")
- **Requirement:** Coding Standard 11 — preferred designs by priority VIPER >
  MVC > ECS; implementation documented with a linked TOC.

## Decision

Keep the existing layering and document it as **MVC**:
[guide/architecture/mvc.md](../guide/architecture/mvc.md).

| Role | Code |
|---|---|
| Model | `src/domain/*` (entities, validation), `src/providers/*` (source adapters), `src/services/*` (matching, sorting, filtering, aggregation, cache), `src/config/llbm-mappings.ts` |
| Controller | `src/ui/panel-controller.ts` (`f_createOverviewController`) |
| View | `src/tui.tsx` (SolidJS/OpenTUI components), `src/ui/format.ts` (display formatting) |

## Why not VIPER now

- The current split already isolates the parts VIPER would separate: the
  controller is renderer-agnostic and unit-tested without a host
  (`tests/unit/panel-controller.test.ts`), and all business logic lives in pure
  services.
- A VIPER move (presenter/interactor split, router for panel + commands) would
  touch every module and test for no behavioural gain and violates Agents rule
  4 (economic changes) at this stage.
- Revisit when a second view (e.g. a dialog or web view) or non-trivial
  navigation appears: then extract an interactor from `panel-controller.ts`
  and a router from the `keymap.layer` command table in `src/tui.tsx`.
