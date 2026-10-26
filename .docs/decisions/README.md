# Decisions — table of contents

Every decision is dated and states the requirement that triggered it and the
code it affects. D-0001 … D-0024 were recorded inside the consolidated project
plan before this index existed; their rows point at the matching section of
[history/PLAN.md](history/PLAN.md) (search the heading text given). From
D-0025 on, each decision has its own file.

Status values: **active** · **superseded** (link to the replacement) · **open** (needs owner action).

| ID | Date | Decision | Requirement / trigger | Code references | Status |
|---|---|---|---|---|---|
| D-0001 | 2026-10-24 | Repo & tooling skeleton; TypeScript pinned to 6.0.3 (typescript-eslint range) | PLAN "Phase 0" | `package.json`, `tsconfig.json`, `eslint.config.js` | active |
| D-0002 | 2026-10-24 | Native `session.panel` + `sidebar.content` PoC; sources verified | PLAN "Phase 1" | `src/tui.tsx`, `.opencode/plugins/mosp/` | active |
| D-0003 | 2026-10-24 | Domain contracts: missing = `null`, score ≠ rank | PLAN "Phase 2" | `src/domain/*` | active (rank removed by D-0023) |
| D-0004 | 2026-10-24 | Adapters with `AdapterResult`, shared fetch policy | PLAN "Phase 3" | `src/providers/*`, `src/utils/fetch-json.ts` | active (GPQA/LCB adapters superseded by D-0020) |
| D-0005 | 2026-10-24 | Conservative matching; ambiguity ⇒ unmatched; pure sorting | PLAN "Phase 4" | `src/services/model-matching.ts`, `src/services/ranking.ts` | active |
| D-0006 | 2026-10-24 | Per-source cache, TTLs, last-known-good, in-flight dedup | PLAN "Phase 5" | `src/services/cache.ts`, `src/services/mosp.ts` | active |
| D-0007 | 2026-10-24 | Renderer-agnostic controller + SolidJS view | PLAN "Phase 6" | `src/ui/panel-controller.ts`, `src/tui.tsx` | active |
| D-0008 | 2026-10-24 | Header-click collapse opt-in via env flag | PLAN "Adjustment (owner request" (first bullet under Phase 6) | `f_resolveHeaderCollapseEnabled` | active |
| D-0009 | 2026-10-24 | Explicit chip selection marker | PLAN "Adjustment 2" | `f_formatChipLabel` | superseded by D-0010 |
| D-0010 | 2026-10-24 | Three-state chip markers (selected/hovered/plain) | PLAN "Adjustment 3" | `f_formatChipLabel` | superseded by D-0016 (hover dropped), D-0023 |
| D-0011 | 2026-10-24 | Press-and-release activation | PLAN "Adjustment 4" | `src/tui.tsx` `fh_beginPress`/`fh_endPress` | active |
| D-0012 | 2026-10-24 | Module-scope press registry | PLAN "Adjustment 5" | `g_pressedTarget` | active |
| D-0013 | 2026-10-24 | Index-keyed rows to avoid broken moves | PLAN "Adjustment 6" | `src/tui.tsx` | superseded by D-0015/D-0016 |
| D-0014 | 2026-10-24 | Slash command renamed to `/mosp` | PLAN "Adjustment 7" | `src/tui.tsx` keymap layer | active |
| D-0015 | 2026-10-24 | Ranking chips removed; Ctx sortable | PLAN "Adjustment 8" | `src/domain/model-sort.ts` | active |
| D-0016 | 2026-10-25 | Remount-as-design painting model; search removed | PLAN "Adjustments 9–15" | `fh_pokeRender`, `f_buildTableLines` | active |
| D-0017 | 2026-10-25 | models.dev crosswalk source | PLAN "Adjustment 16" | `src/providers/models-dev.ts` | active |
| D-0018 | 2026-10-25 | Host-first catalog reads | PLAN "Adjustment 17" | `f_getModelOverviewFromHost` | active |
| D-0019 | 2026-10-25 | Casefold mapping lookup + live drift validator | PLAN "Adjustment 18" | `fh_indexMappings`, `scripts/validate-mappings.ts` | active |
| D-0020 | 2026-10-25 | LLMBM replaces GPQA + LiveCodeBench | PLAN "Adjustment 19" | `src/providers/llbm.ts` | active |
| D-0021 | 2026-10-25 | `/v1/export` instead of dead `/v1/scores` | PLAN "Adjustment 20" | `f_parseLlbmExport` | active |
| D-0022 | 2026-10-25 | Verified mapping rebuild; source-row sharing | PLAN "Adjustment 21" | `src/config/llbm-mappings.ts` | active |
| D-0023 | 2026-10-26 | Two LLMBM metric columns, no ranks; cleanup | PLAN "Adjustment 22" | `k_llbmMetricByBenchmark`, `src/services/ranking.ts` | active |
| D-0024 | 2026-10-26 | Toolbar `[update]` button | PLAN "Adjustment 23" | `src/tui.tsx`, `f_formatUpdateLabel` | active |
| [D-0025](D-0025-docs-root.md) | 2026-10-26 | Single `.docs/` documentation root | Agents rule 11 vs Coding Standard 11 | — (docs only) | active |
| [D-0026](D-0026-architecture-mvc.md) | 2026-10-26 | Architecture documented as MVC; VIPER deferred | Coding Standard 11 | `src/` layout | active |
| [D-0027](D-0027-no-build-targets.md) | 2026-10-26 | No debug/release build targets for a source-loaded plugin | Coding Standard 15 | `package.json` `exports`, `.opencode/plugins/` | active |
| [D-0028](D-0028-license.md) | 2026-10-26 | License stays MIT; dependency license audit | General, Licenses 7 | `LICENSE`, `package.json` | active |
| [D-0029](D-0029-data-source-licensing.md) | 2026-10-26 | Benchmark data has no published commercial terms | Licenses 7 | `src/providers/llbm.ts` | **open** |
| [D-0030](D-0030-versioning.md) | 2026-10-26 | `Release.Feature.<commit count>` versioning | General / Versioning | `package.json` `version` | active |
| [D-0031](D-0031-lint-format-policy.md) | 2026-10-26 | Formatter + secure-subset lint rules; type-annotation policy | Coding Standard 12–14 | `eslint.config.js`, `.prettierrc.json`, `tsconfig.json` | active |

History records (frozen): [history/README.md](history/README.md).
