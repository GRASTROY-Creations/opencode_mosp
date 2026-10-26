# MVC mapping

Decision: [D-0026](../../decisions/D-0026-architecture-mvc.md) (2026-10-26).
VIPER is the preferred pattern but deferred; the code is organized as MVC with
a strictly one-directional dependency flow **View → Controller → Model**.

```text
View        src/tui.tsx, src/ui/format.ts
  │  renders controller accessors, forwards clicks/commands
Controller  src/ui/panel-controller.ts
  │  owns UI state (signals), derives rows, calls services, persists prefs
Model       src/services/*  ──►  src/providers/*  ──►  src/domain/*   (+ src/config/llbm-mappings.ts)
```

## Model

| Layer | Modules | Responsibility |
|---|---|---|
| Entities | `src/domain/model-record.ts`, `model-benchmark.ts`, `model-pricing.ts`, `model-sort.ts`, `source-status.ts`, `guards.ts` | Typed contracts + validation; missing = `null` |
| Adapters | `src/providers/opencode-models.ts`, `opencode-pricing.ts`, `llbm.ts`, `models-dev.ts`, `adapter-result.ts` | External `unknown` → validated entities |
| Services | `src/services/mosp.ts` (aggregation), `model-matching.ts`, `ranking.ts` (sorting), `model-filter.ts`, `cache.ts` | Pure logic + cache I/O; no UI imports |
| Config | `src/config/llbm-mappings.ts` | Reviewed source ↔ registry mapping table |
| Infra | `src/utils/fetch-json.ts` | Network policy (timeouts, retries, sanitized errors) |

## Controller

`f_createOverviewController` (`src/ui/panel-controller.ts`):
- state lives in controller-owned Solid signals (sort, filters, snapshot,
  loading, error); host stores only persist preferences
  (reason: the host embeds its own Solid runtime, D-0016);
- every mutation calls `fh_pokeRender` → panel remount (painting model,
  [ui-integration.md](ui-integration.md));
- pure, exported helpers (`f_deriveOverviewRows`, `f_buildTableLines`,
  `f_parseOverviewCommand`, status/summary builders) are unit-tested without
  a host.

## View

`src/tui.tsx`: `ModelOverviewPanel` and `SidebarStatus` components plus the
plugin `setup` (slots, `keymap.layer` commands). Components read controller
accessors once per mount and render plain text; `src/ui/format.ts` holds the
display formatters.

## Where VIPER pieces would come from

| VIPER role | Today |
|---|---|
| View | `src/tui.tsx` components |
| Presenter | display builders in `panel-controller.ts` |
| Interactor | refresh/load flow in `panel-controller.ts` + `src/services/*` |
| Entity | `src/domain/*` |
| Router | `keymap.layer` command table + `panel.open/close` in `src/tui.tsx` |
