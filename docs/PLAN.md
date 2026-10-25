# Implementation Plan: opencode_model_overview

**Owner:** GRASTROY Creations · **Version:** 0.1.0 · **License:** MIT
**Target runtime:** OpenCode v2.1.4 (verified installed) · Bun 1.4.2 · TypeScript · direnv
**Scope constraint:** all work stays inside this project directory (`/mnt/PROJ/DEV/opencode_model_overview`).

This plan consolidates the three knowledge documents, corrects them against the **verified** OpenCode v2
plugin API, and defines the phased execution order with completion gates.

---

## 1. Source-of-truth hierarchy for `docs/`

| File | Verdict |
|---|---|
| `KNOWLEDGE_03.md` | **Authoritative master spec.** Verification-first methodology, modular repo structure, domain contracts, phases, acceptance checklist. |
| `KNOWLEDGE_02.md` | **Structural reference only.** Naming conventions and module breakdown are useful; its API details are wrong/unverified (see §3). |
| `KNOWLEDGE_01.md` | **Discarded.** Obsolete draft (browser/React + `axios`/`react-table`), references a nonexistent `@opencode/plugin-api`, and is truncated mid-code-block at line 153. Do not implement from it. |

---

## 2. Verified environment (read-only checks, 2026-10-24)

- `bun 1.4.2` · `direnv 2.37.1` · `git 2.55.0` · `node v24.18.0` · **`opencode v2.1.4`** (target version).
- npm registry: **`@opencode/plugin` latest = `2.1.4`** (matches installed OpenCode); `@opentui/core` latest = `0.6.8`.
- Reference repo `bnc4vk/opencode-model-scorecard` **exists** (GitHub API 200) → inspect in Phase 1.
- Git state: one commit (`b77c5e3 Initial commit`); the three knowledge docs are currently **staged, uncommitted**.
- Existing files: `LICENSE` (MIT, © 2026 GRASTROY Creations) and `.gitignore` present. `.gitignore` must still gain `.direnv/`, `.envrc.local`, `.cache/`, and the `!.env.example` exception (KNOWLEDGE_03 §16).

---

## 3. Corrections to the knowledge docs (verified against opencode.ai/v2 docs)

KNOWLEDGE_02's core instincts are right but the identifiers are wrong. Use these verified facts instead:

1. **Package name:** `@opencode/plugin` (NOT `@opencode-ai/plugin`). TUI/CLI plugins import from the
   subpath **`@opencode/plugin/tui`** — OpenCode resolves it at runtime; no absolute path needed.
2. **Entry shape:** `export default Plugin.define({ id, setup(ctx) { ... } })` — confirmed correct.
   `setup` may return a cleanup function.
3. **Native sidebar: SUPPORTED.** Documented slot mechanism (CLI plugins):
   `context.ui.slot({ append: | prepend: | before: | after: | replace: <slot>, render })`
   with slots: `app`, `home.footer`, `home.footer.status`, `prompt.footer(.status/.file)`,
   `session.composer.top`, **`sidebar.content`**, **`sidebar.footer`**, **`session.panel`**.
4. **Session panels (preferred for a full table):** `context.ui.slot({ append: "session.panel", render })`
   + `context.ui.panel.open(name, { presentation })` — host owns sizing/focus/fullscreen; contributions get
   reactive `name`, `sessionID`, `width`, `presentation`, `focused` + `focus`/`close`/`toggleFullscreen`.
5. **Commands:** `context.keymap.layer(() => ({ mode, priority, commands: [{ id, title, group, bind,
   palette, slash: { name, aliases, arguments }, run }], bindings }))` → gives palette, slash (`/model-overview …`)
   and keybind actions in one registration → satisfies the "menu or command toggle" requirement.
6. **Model & pricing discovery:** server plugins use `ctx.model.list()` / `ctx.provider.list()`;
   CLI plugins use `context.data.location.model.list(location)` (+ `provider`, `integration`, … sync/invalidate).
   `Model.Info` includes **`cost` tiers** (`tier.input`, `tier.output` referenced in official examples) and
   `limit.context`. → Pricing is likely obtained from the registry itself; **no invented authenticated pricing
   endpoint**. Exact field units (per-token vs per-1M) must be confirmed in Phase 1.
7. **Persistence:** CLI `context.storage.store(key, { initial })` (durable JSON, reactive, syncs across TUI
   instances) for UI preferences; server `ctx.storage.get/set/scan` for plugin-scoped data; a user cache dir
   for benchmark snapshots.
8. **UI stack:** SolidJS + OpenTUI (`@opentui/solid`, `@opentui/core`). Peer deps per docs:
   `@opentui/core >=0.6.6`, `@opentui/solid >=0.6.6`, `solid-js >=1.9.0`. Use `context.theme` tokens and
   `context.renderer.nativeScene` as owner for OpenTUI resources (OpenTUI ≥0.6 requirement).
   `usePlugin()` gives context inside rendered JSX.
9. **Package form:** publishable plugin exports — `"." : "./src/index.ts"`, `"./tui": "./src/tui.tsx"`;
   project-local dev copy loads automatically from `.opencode/plugins/`.
10. **Unverified external endpoints in KNOWLEDGE_02** (`huggingface.co/api/spaces/open-llm-leaderboard/...`,
    `livecodebench.github.io/leaderboard.json`) must NOT be used as-is. Replace with sources verified in Phase 1
    (HF documented form: `GET https://huggingface.co/api/datasets/{dataset_id}/leaderboard`).

**Consequence:** KNOWLEDGE_03's top risk ("no native sidebar → need command/dashboard fallback") is resolved —
**build the native panel directly**; the PoC in Phase 1 still gates it.

---

## 4. Product summary (from KNOWLEDGE_03 §1, §3)

OpenCode plugin presenting a **collapsible model overview panel** with a searchable, sortable table of models
available to the current installation, merging:
- **availability + metadata** (OpenCode model registry: provider, model ID, name, context limit, release date where present);
- **pricing** normalized to **USD per 1M input/output tokens** (from the registry's cost data, verified);
- **benchmarks**: **GPQA (primary ranking)** and **LiveCodeBench (alternative ranking)** as external adapters with
  provenance (source URL, evaluation/retrieval timestamps), score ≠ rank, missing = `N/A` — never fabricated.

Interactions: click-collapse + command toggle (state survives collapse), ranking selector, asc/desc column sorts,
search by name/provider/ID, optional filters, refresh with loading/empty/stale/partial/error states, source
freshness display, deterministic stable sorting (missing values last in both directions).

---

## 5. Repository structure (KNOWLEDGE_03 §4, adapted to verified API)

```
opencode_model_overview/
├── .envrc / .env.example / .editorconfig / .npmrc / bunfig.toml
├── .github/workflows/ci.yml
├── docs/                      # knowledge docs + everything below
│   ├── architecture/{overview,data-flow,ui-integration,caching,decisions}.md
│   ├── api/{opencode-models,opencode-pricing,huggingface-gpqa,livecodebench}.md
│   └── {development,naming-conventions,testing,release}.md
├── scripts/{refresh-benchmarks.ts,validate-data.ts}
├── src/
│   ├── index.ts               # server plugin (Plugin.define, id "opencode_model_overview")
│   ├── tui.tsx                # CLI plugin: slots, panel, commands, table renderer
│   ├── config/config.ts
│   ├── domain/{model,benchmark,pricing}.ts
│   ├── providers/{opencode-models,opencode-pricing,huggingface-gpqa,livecodebench}.ts
│   ├── services/{model-overview,model-matching,ranking,cache}.ts
│   ├── ui/{panel-controller,table,state}.ts(x)
│   └── utils/{fetch-json,logger,result}.ts
├── tests/{unit,integration,fixtures}/
├── package.json  tsconfig.json  eslint.config.js  README.md  CHANGELOG.md  LICENSE
```

Entry-point decision (KNOWLEDGE_03 §4): keep `src/` as source of truth; for local development, load via a
`.opencode/plugins/model-overview/` **directory** (`index.ts` server entry + `tui.ts` TUI entry, each a thin re-export
from `src/`) (single implementation, no copies). A flat file in `.opencode/plugins/` is server-only and cannot host the
TUI plugin. Final form = publishable package with `"./tui"` export + `plugins` entry in `opencode.json(c)`.

---

## 6. Coding conventions (mandatory, KNOWLEDGE_03 §5.1)

- `f_` exported/runtime functions · `fh_` helpers · `g_` globals (shared mutable only; prefer DI) · `k_` constants
  · `p_` parameters (even in short callbacks) · `vl_` local variables · `v_` other runtime vars
- Types/interfaces **PascalCase**; string unions descriptive (`"gpqa"`); files **kebab-case**.
- Strict TypeScript (flags per §5.4 incl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`);
  no `any`; `unknown` + validation at external-data boundaries; explicit return types on exports;
  no global rule disables; no default exports except where the plugin loader requires them.
- Missing data stays `null` (never `0`, never fake ranks). Preserve provenance + timestamps on every price/benchmark record.
- TypeScript version policy (KNOWLEDGE_03 §5.2): at setup, check latest stable TS compatible with `@opencode/plugin@2.1.4`
  + tooling (TS 7 if stable/compatible, else TS 6; else stop and document the blocker). Pin it; commit `bun.lock`.

---

## 7. Phased execution plan with gates (adapted from KNOWLEDGE_03 §18)

### Phase 0 — Repo & tooling skeleton — **DONE (2026-10-24)**
- `bun init`; add `@opencode/plugin@2.1.4` + `solid-js`, peers `@opentui/core`/`@opentui/solid`; dev TS/eslint/typescript-eslint/`@types/bun`.
- Create `tsconfig.json`, flat `eslint.config.js` (no `any`, no-floating-promises, naming-prefix rule where practical),
  `bunfig.toml`, `.editorconfig`, `.npmrc`; extend `.gitignore` (§2); write `.envrc` + `.env.example` (no secrets; §5.5).
- **Gate:** `bun install`, `bun run typecheck`, `bun run lint` all pass on the empty skeleton. ✅ All green.
- **Actuals:** TypeScript pinned to **6.0.3** per §5.2 policy (TS 7.0.2 stable, but `typescript-eslint@8.72.0`
  requires `>=4.8.4 <6.1.0`); ESLint 10.13.0. Skeletons `src/index.ts` + `src/tui.tsx` are inert
  `Plugin.define` stubs (default export = documented naming exception). `refresh:benchmarks` / `validate:data`
  npm scripts deferred to Phase 3 (their script files don't exist yet). All deviations recorded in
  `docs/development.md`. `direnv allow` intentionally left to the user.

### Phase 1 — Feasibility PoC + source verification *(the hard gates)* — **CODE DONE (2026-10-24); visual gate pending owner run**
1. Minimal TUI plugin: register `session.panel` contribution + compact `sidebar.content` status +
   `/model-overview` (and `toggle`) slash commands; verify it **loads and toggles in opencode 2.1.4**.
2. Dump/inspect real `Model.Info` schema: IDs, names, `limit.context`, `cost` tier fields + **units**.
3. Verify data sources; record each in `docs/api/*.md` with URL, auth, rate limits, license, example response, verification date:
   - HF `GET /api/datasets/{dataset_id}/leaderboard` — pick the dataset that actually contains GPQA; score direction; fixture.
   - LiveCodeBench official source (API or snapshot-download script; **no invented endpoints**).
   - Inspect `bnc4vk/opencode-model-scorecard`: pricing source, refresh scripts, `tui.tsx`, **license** (attribution if reused).
- **Gate:** PoC panel renders + command toggles (documented in `docs/architecture/ui-integration.md`); every external
  source is verified or explicitly flagged unavailable with a snapshot fallback designed.

**Results:**
- PoC implemented in `src/tui.tsx` (+ `.opencode/plugins/model-overview/{index,tui}.ts` dev loader): panel, sidebar strip,
  palette commands, `/model-overview` with arguments. `typecheck` + `lint` green. **Owner must start/reload the
  TUI to confirm rendering/toggling** — checklist in `docs/architecture/ui-integration.md`.
- `Model.Info` verified live (16 models, 1 provider). `cost` unit is schema-named
  `Money.USDPerMillionTokens`; tiers are `{ tier: { type: "context", size } }` (semantics assumed).
  Pricing doc: `docs/api/opencode-pricing.md`; fixture: `tests/fixtures/model-info.sample.json`.
- **GPQA verified:** `GET https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard` → 115 rows /
  97 models; filter `.eval_results/gpqa_diamond.yaml`; 25 Diamond rows; `verified: false` on all rows;
  higher-is-better. `docs/api/huggingface-gpqa.md` + fixture.
- **LiveCodeBench verified:** `https://livecodebench.github.io/performances_generation.json` (the exact file the
  official page fetches) → 29,540 rows / 28 models. Join on `models[].model_repr`, **not** `model_name`.
  `docs/api/livecodebench.md` + fixture.
- **`bnc4vk/opencode-model-scorecard`:** MIT, but V1-era (`@opencode-ai/plugin@1.x`, `oc-plugin` field). Its data
  comes from HTML scraping (opencode.ai stats page, tbench.ai, artificialanalysis.ai) — **not reused**. We use the
  model registry for pricing. No attribution obligation; noted in `docs/architecture/ui-integration.md` context.

### Phase 2 — Domain contracts — **DONE (2026-10-24)**
`src/domain/*`: `ModelRecord`, `ModelPricing` (USD/1M in/out, currency, source, observedAt), `ModelBenchmark`
(score ≠ rank, sourceUrl, evaluatedAt), `ModelSource`, `RankingMode`, `SortDirection`, `ModelSortKey`.
Validation for external data boundaries.
- **Gate:** unit tests on types/normalization run without network. ✅
- **Implemented:** `guards.ts` (typed `DomainResult`, JSON/timestamp/number/URL/union parsers),
  `model-pricing.ts` (base + context-tier prices, cache prices, explicit unavailable pricing),
  `model-benchmark.ts` (GPQA Diamond / LCB variants, score 0-100 vs 1-based rank, sample count, window,
  raw source ID), `model-record.ts` (stable `<providerId>/<modelId>` key, nested validation, no duplicate
  benchmarks), `model-sort.ts` (all 9 sort keys + defaults `gpqaRank` asc / `gpqa`), and
  `source-status.ts` (per-source health + overview state for partial/stale UI).
- **Rules encoded:** missing = `null` (never `0`); a published `0` stays `0`; free means every known
  in/out price is zero; a model with no benchmark has no array entry; score and rank are independent.
- **Tests:** `tests/unit/domain.test.ts` — 23 tests / 95 assertions, network-free.

### Phase 3 — Data adapters — **DONE (2026-10-24)**
`src/utils/fetch-json.ts` (timeout+AbortController, no secrets in errors) with retry/backoff + `Retry-After` at adapter level.
Adapters: OpenCode models (+optional inference catalog `https://opencode.ai/inference/v1/models` treated as a *different*
set from local models), pricing (from registry cost; only external if verified), GPQA, LiveCodeBench.
- **Gate:** each adapter passes fixture-based tests; no ordinary tests hit live services. ✅ 30 adapter tests; `bun run check` = 53 tests / 203 assertions.

**Implemented**
- `src/utils/fetch-json.ts` — typed `FetchJsonError` (HTTP/network/timeout/abort/parse/invalid-url/options),
  host-only messages, composed timeout+cancellation signal, retries only transient failures
  (408/425/429/5xx/network/timeout), `Retry-After` respected and capped, injectable fetch/sleep.
- `src/providers/adapter-result.ts` — `AdapterResult<T>` + row-level warnings for partial payloads.
- `src/providers/opencode-pricing.ts` — registry cost (already USD/1M) → base + sorted context tiers;
  missing cost = unavailable (`null`), zero stays free; duplicate bases/tier sizes rejected.
- `src/providers/opencode-models.ts` — accepts `ModelInfo[]` or `{data:[…]}`; filters disabled by default;
  skips invalid rows with warnings; never reads secret-bearing fields; provider-name fallback = provider ID.
- `src/providers/huggingface-gpqa.ts` — exact `.eval_results/gpqa_diamond.yaml` filter, higher-is-better
  enforcement, HF rank discarded, duplicate model rows left unmatched, fetch wrapper.
- `src/providers/livecodebench.ts` — verified default window (`date_marks[15]` when >12, else `[4]`, end = last),
  mean `pass@1`, minimum-sample guard 100, duplicate/unknown models excluded, window+count attached.
- **Live probes (read-only, 2026-10-24):** GPQA 25 Diamond rows / 0 warnings; LCB 28 models / 0 warnings,
  `DeepSeek-V3` = 27.2026 over 454 samples (default 2024-08-01 → 2025-05-01), reproduced from raw data.
- Optional inference catalog (`inference/v1/models`) remains **not implemented**: schema/auth unverified,
  and it is not a pricing guarantee. Registry is the pricing source.
- Docs: `docs/api/{opencode-models,opencode-pricing,huggingface-gpqa,livecodebench}.md` updated with adapter
  behavior/verification; new `docs/architecture/data-flow.md`.

### Phase 4 — Matching & ranking — **DONE (2026-10-24)**
`model-matching.ts`: exact provider/model ID → canonical ID → reviewed alias registry → conservative normalized match;
ambiguous ⇒ **unmatched** (never borrow another model's score). `ranking.ts` (§8 of spec): pure comparator —
non-mutating, missing last in both directions, deterministic tie-break by ID, natural case-insensitive names,
numeric prices, rank-vs-score distinct; default `gpqaRank asc`. Search + provider/missing-data/free filters.
- **Gate:** all rows sort deterministically; no fabricated values anywhere. ✅
- **Implemented:** `src/services/model-matching.ts` (five-step resolution, alias injection, ambiguity/duplicate
  reporting), `src/services/ranking.ts` (`f_compareModels`, `f_sortModels`, competition `f_assignBenchmarkRanks`),
  `src/services/model-filter.ts` (search/provider/benchmark-presence/free), `src/config/model-aliases.ts`
  (reviewed registry, intentionally empty until a mapping is verified).
- **Results:** 39 new tests → **92 tests / 266 assertions**; `bun run check` green. No fabricated scores/ranks:
  missing values stay `null`, ranks are only derived from non-null scores, and existing benchmark rows are not
  overwritten. Docs updated in `docs/architecture/data-flow.md`.

### Phase 5 — Aggregation & caching — **DONE (2026-10-24)**
`model-overview.ts`: `f_getModelOverview / f_refreshModelOverview / f_mergeModelSources / f_matchBenchmarkRecords /
f_getOverviewStatus / f_sortModels / f_filterModels`. Independent per-source fetch + failure isolation (one source down ⇒
partial table, stale label; never whole-service crash). Cache: per-source keys, TTLs (models/pricing 1h, benchmarks 6h —
tunable), schema version, atomic writes in a user cache dir, in-flight dedup, last-known-good preservation.
- **Gate:** service returns usable partial results when any single optional source fails. ✅
- **Implemented:** `src/services/cache.ts` (versioned envelope, memory + atomic file caches, TTL/env resolution,
  `OPENCODE_MODEL_OVERVIEW_CACHE_DIR`), `src/services/model-overview.ts` (cache-only reads, parallel refresh with
  in-flight dedup, last-known-good on failure, merge, derived `opencode-pricing` status, sanitized loader errors).
  `opencode-pricing` is a derived view of the registry payload — no fourth cache entry.
- **Results:** 31 new tests → **123 tests / 406 assertions**; `bun run check` green. New `docs/architecture/caching.md`;
  `docs/architecture/data-flow.md` updated.

### Phase 6 — UI (SolidJS + OpenTUI) — **DONE (2026-10-24)** *(visual gate pending owner run)*
- `session.panel` table: sticky header, scroll, all sortable columns with active-column/direction indicator,
  ranking selector (GPQA ↔ LiveCodeBench), search field, provider/missing/free filters, refresh action,
  last-refresh + per-source freshness/stale/error status, empty state, `N/A`/`—` for missing.
- `sidebar.content`: compact summary (e.g., selected/active model rank + price, "open panel" hint).
- Collapse/expand: mouse click on header toggle **and** `/model-overview toggle`; repeated toggles refetch nothing;
  sort/search/ranking state survive collapse; prefs persist via `context.storage.store`.
- Commands via `keymap.layer`: `/model-overview [refresh|sort gpqa|sort input-price|sort output-price|ranking livecodebench|toggle|status]`, palette entry, keybind.
- UI kept behind adapter (`panel-controller` decoupled from renderer) so data layer is reusable.
- **Gate:** table usable with complete *and* incomplete source data; both toggle mechanisms work in 2.1.4.
- **Implemented:** `src/ui/panel-controller.ts` (renderer-agnostic state: durable view prefs with legacy
  normalization, memory search/filters, snapshot signals, filter→sort memo, ranking-leader memo, cache-only
  reads, refresh via `f_refreshModelOverview`, command parsing, status/sidebar strings); `src/ui/format.ts`
  (display formatters, missing → `—`); `src/tui.tsx` rewritten as rendering-only table (clickable collapse
  header, ranking chips, refresh chip, search input, filter chips, clickable sort headers with `▲`/`▼`,
  `scrollbox` rows, status footer, sidebar summary). Commands registered palette+slash **without binds**
  (deliberate: bind ids are user-config territory). 26 new tests in `tests/unit/panel-controller.test.ts`.
  Verified: no fetch on panel open/toggle/sort; refetch only on explicit refresh.
- **Gate result:** `bun run check` green — typecheck, lint, 150 tests / 483 assertions across 11 files.
  Owner visual run still to do (checklist in `docs/architecture/ui-integration.md`).
- **Adjustment (owner request, 2026-10-24):** header-click collapse is now opt-in via
  `OPENCODE_MODEL_OVERVIEW_HEADER_COLLAPSE` (default off → panel always opens expanded; indicator
  hidden when off; stale persisted `collapsed: true` normalized to expanded on load). The gesture
  itself is kept. `panel-controller` exposes `headerCollapseEnabled` with pure helpers
  `f_resolveHeaderCollapseEnabled` / `f_resolveCollapsedState`; `.envrc`/`.env.example`,
  `docs/development.md`, and `docs/architecture/ui-integration.md` updated.
  Re-verified: `bun run check` green — **152 tests / 501 assertions**.
- **Adjustment 2 (owner request, 2026-10-24):** all selectable chips carry an explicit marker — selected
  renders `[>GPQA]`/`[>LCB]`/`[>free]`/`[>missing GPQA]`/`[>missing LCB]` via pure helper
  `f_formatChipLabel`, unselected renders `[GPQA]` etc. The search input takes focus only from its own
  click: initial focus is false, and every other click target (header, ranking/filter chips, refresh,
  sort headers, rows, scroll area) explicitly clears focus — no reliance on event bubbling; Enter and
  collapse also clear it. Re-verified: `bun run check` green — **153 tests / 505 assertions**.
- **Adjustment 3 (owner request, 2026-10-24; revises the Adjustment 2 marker):** chip markers are now
  three-state — `[>>GPQA]` selected, `[>GPQA]` hovered (transient cursor focus via
  `onMouseOver`/`onMouseOut`, memory only, guarded hand-off clear), plain `[GPQA]` otherwise; selection
  wins when both apply. `f_formatChipLabel(selected, hovered, label)` updated with tests. `In $/M` and
  `Out $/M` columns widened 8→10 cells (header and row cells) so `Out $/M ▲` no longer wraps the sort
  arrow to a second line. `docs/architecture/ui-integration.md` column note and checklist items 5–6
  updated. Re-verified: `bun run check` green — **153 tests / 508 assertions**.
- **Adjustment 4 (owner request, 2026-10-24):** activation is now press-and-release instead of
  `onMouse` (which fires on every mouse event, including hover — controls appeared always active).
  Every target records a pressed target on `onMouseDown` and acts on `onMouseUp` only when the
  pressed target matches; the renderer dispatches `up` to the element under the cursor at release,
  so the guard prevents press-A/release-B misfires, and the panel root clears the pressed target as
  a safety net. Search focuses on its own press; all other targets blur it on press. Hover remains
  `onMouseOver`/`onMouseOut` for the `[>…]` marker only. `docs/architecture/ui-integration.md`
  mouse-semantics section and checklist updated.
  Re-verified: `bun run check` green — **153 tests / 508 assertions**.
- **Adjustment 5 (owner request, 2026-10-24):** after Adjustment 4 all chip
  clicks went dead. Root cause: press bookkeeping lived in component-local
  signals, and the host can re-render/re-create a slot component between
  `down` and `up` (the auto-focus that follows a press is one trigger), which
  resets them and makes the pressed-target guard cancel every click. Fix:
  press registry and chip-hover marker moved to module-scope signals
  (`g_pressedTarget`, `g_hoveredChip`); press-and-release protocol, widget ids,
  and the root safety clear unchanged. Refresh feedback: the `[refresh]` chip
  now shows `[refreshing…]` while loading, ignores presses during a refresh,
  and routes through an `onRefresh` prop wired to `f_refreshWithToast`, so
  success/failure always toast like the slash command does.
  `docs/architecture/ui-integration.md` mouse/behaviour sections and checklist
  updated.
  Re-verified: `bun run check` green — **153 tests / 508 assertions**.
- **Adjustment 6 (owner request, 2026-10-24):** clicking a column header updated the
  `▲/▼` indicator but rows did not reorder. Diagnosis: `@opentui/solid` 0.6.8's move
  path is unreliable inside the panel's scrollbox tree — `_insertNode` silently
  degrades to append when the anchor lookup fails (`anchorIndex === -1`), and
  `getNextSibling`'s `_getParentNode` re-parents nodes to the `scrollbox` itself,
  so keyed `<For>` reorders can keep rendering the old order. Fix: model rows now
  render with `<Index>` (index-keyed slots re-render in place; no node moves),
  while the static column-header `<For>` is unchanged. Verified: `bun run check`
  green — **153 tests / 508 assertions**;
  `docs/architecture/ui-integration.md` rendering note added; owner visual gate
  pending.

### Adjustment 7 — slash command renamed to `/mosp` (owner request, 2026-10-24)
- The user-facing slash trigger is now **`/mosp`**; the old `/model-overview` name and the `/mo` alias were removed.
- Only user-facing strings and the slash registration changed. Unchanged internals: plugin id, host panel name
  `model-overview`, storage keys `model-overview.*`, command ids `model_overview.*`, palette titles, and the
  `.opencode/plugins/model-overview/` dev-loader directory.
- Docs updated (`docs/architecture/ui-integration.md` command table, behaviour text, checklist). Historical mentions
  in this plan and the original knowledge doc (`docs/KNOWLEDGE_03.md`) remain as history; `/mosp` supersedes them.
- Re-verified: `bun run check` green after the rename.

### Adjustment 8 — ranking chips removed, row sorting fixed, Ctx sortable (owner request, 2026-10-24)

- The `[GPQA]`/`[LCB]` ranking chips were removed; rows sort exclusively through
  the column titles. The sidebar leader defaults to GPQA and follows a benchmark
  only when a benchmark column is the active sort.
- Row sorting was broken on screen even though the data reordered: keyed
  `<For>`/`<Index>` moves are unreliable in the panel's scrollbox tree
  (`@opentui/solid` 0.6.8 `_insertNode` append fallback; `_getParentNode`
  scrollbox re-parenting). Rows now remount per derivation via
  `<Show when={vl_rows()} keyed>` + `<For>`.
- `Ctx` (context window) is now a sort key (`contextWindow`, numeric, descending
  default, nulls last); `/mosp sort ctx` works.
- Docs updated (`ui-integration.md` rendering note, chip changes, Ctx sorting);
  Re-verified: `bun run check` green — 150 tests / 507 assertions.

### Adjustments 9–15 — reactivity discovery arc (owner reports, 2026-10-24/25)

Recorded compactly (docs were deferred during rapid owner iteration):

- **9 — dual-runtime reactivity refactor:** the host binary embeds its own
  Solid/OpenTUI runtime, so controller memos could not track host-created
  stores. All render-relevant state moved to controller-owned signals; host
  stores became persistence-only mirrors (write-through, one-time read).
- **10 — layout fixes:** responsive columns (hide Ctx under panel width 92,
  Provider under 76), price columns widened to 10 so `Out $/M ▲` stays on one
  line, column-header click sorting via press-and-release.
- **11 — search removal:** search bar, controller state, the
  `OPENCODE_MOSP_SEARCH` env flag, and the service-level `searchText` filter
  removed end-to-end (owner request).
- **12 — benchmark-mappings infrastructure:** `src/config/benchmark-mappings.ts`
  (reviewed `{benchmarkId, sourceModelId, opencodeModelId, matchType, reason}`
  entries), matcher stage after alias/before normalization, `matchType` domain
  field on `ModelBenchmark`, `~` prefix for proxies in table cells. The
  KNOWLEDGE_04 candidate table validated against the live registry + GPQA
  Diamond + LCB sources attached ZERO rows; `k_benchmarkMappings` stays `[]`
  pending owner-verified `registryId = Real Model Name` pairs.
- **13 — command split:** `/mosp update` = network refresh, `/mosp redraw` =
  cache repaint; bare `refresh` invalid. A `ReactiveText` probe component
  proved imperative text updates execute but never paint.
- **14 — remount-as-design:** probe logs confirmed mounted slot subtrees never
  repaint on plugin-side mutations (`requestRender`/`invalidateIntrinsicSize`
  ineffective). The controller's `fh_pokeRender` now coalesces mutations per
  microtask into `panel.close()` + `panel.open()`; hover visuals dropped; the
  panel renders plain mount-time text.
- **15 — cleanup (2026-10-25):** `[redraw]` chip + spacer removed from the
  toolbar (row is `[free]` only; `/mosp redraw` and the palette entry remain);
  all diagnostics deleted (`fh_diagLog`, `k_diagLogPath`, `node:fs` import,
  setup/toggleSort/derive logs, `· adj8diag` title marker); this plan and
  `ui-integration.md` updated for the verified painting model.

Gate throughout: `bun run check` — final state 156 tests / 522 assertions,
0 fail. Upstream bug report drafted for the owner to file (opencode 2.1.4 /
OpenTUI 0.6.8 slot-tree painting).

### Adjustment 16 — models.dev crosswalk source (owner directive, 2026-10-25)

- Directive (verbatim): "all model ids, costs and context can and should be
  gathered from https://models.dev/ in future"; precedence: "name, cost,
  context allwas from OpenCode registry; model-ids can be used from models.dev
  for mapping properly to huggingface-gpqa and livecodebench".
- New fifth source `models-dev` (`src/providers/models-dev.ts`): fetches
  `https://models.dev/api.json` (verified 2026-10-25 — top-level provider IDs,
  `opencode` provider with 130 models incl. all 16 enabled IDs), extracts ONLY
  the `{ name, family, release_date }` crosswalk keyed `opencode/<modelId>`,
  cached 6 h (benchmark TTL), refreshed via `/mosp update` only, own status
  row, full failure isolation. Registry remains authoritative for displayed
  name/cost/context — the crosswalk is not shown yet.
- Mappings deferred ("Defer mappings"): `k_benchmarkMappings` stays `[]`.
  KNOWLEDGE_06 checked — openai IDs exist in models.dev, anthropic/deepseek/
  google ID strings drift, `qwen`/`meta-llama` provider guesses invalid
  (only `meta`). See `docs/api/models-dev.md`.
- Tests: +7 (models-dev adapter suite + models.dev failure-isolation case);
  gate `bun run check` green — **163 tests / 555 assertions**, 12 files.
  Docs: new `docs/api/models-dev.md`; caching.md, data-flow.md, fixtures
  README updated. Owner visual: status dialog shows a `models.dev` line after
  `/mosp update`.

### Adjustment 17 — host-first catalog + seeded mappings (owner request, 2026-10-25)
Owner (verbatim): "looks like currently al models in table are hardcoded, those should be
gathered directly from opencode itself instead; also lets enhance the tests and test data;"
(after the live catalog grew 16 → 82 enabled models).
- Service: new `f_getModelOverviewFromHost` — the host location catalog (`list()`,
  no sync/network) wins whenever it parses non-empty; otherwise the cached
  `opencode-models` entry is the fallback with a `host-catalog-fallback` warning.
  Benchmarks and the models.dev crosswalk stay cache-only; cache writes still
  happen only through `/mosp update`.
- Controller/UI: `loadFromCache` → `loadSnapshot` (host-first on every mount and
  on `/mosp redraw`); shared `fh_providerNames()`; `fh_readHostCatalog()`.
- Mappings seeded (owner-confirmed 2026-10-25): `moonshotai/Kimi-K2.6` →
  `opencode/kimi-k2.6` (alias), `moonshotai/Kimi-K2.5` → `opencode/kimi-k2.5`
  (alias), `Qwen/Qwen3.5-397B-A17B` → `opencode/qwen3.5-plus` (family_proxy,
  renders `~`). Exact live strings incl. HF org prefixes; all other rows stay
  unmatched.
- Test data: `model-info.full.sample.json` (82 sanitized live models),
  `hf-gpqa-kimi-qwen.sample.json` (3 live Diamond rows), `models-dev.sample.json`
  regenerated (130 trimmed opencode entries + openai filtering proof); +5 tests
  (4 host-first read cases, 1 seeded-defaults mapping case).
- Docs updated: `docs/api/opencode-models.md` (host-first + 82-model re-probe),
  `docs/api/huggingface-gpqa.md` (verified attaches), `docs/architecture/caching.md`
  (mount reads), `docs/architecture/data-flow.md` (pipeline + seeded registries),
  `tests/fixtures/README.md`.
- Verified: `bun run check` green — 168 tests / 577 assertions, 0 fail.

### Adjustment 18 — casefold mapping lookup + live drift validator (owner request, 2026-10-25)

Owner answers to the plan questions (verbatim): scope = "Seeds + validator script
(Recommended)"; matching policy = "Casefold + uniqueness".

- Validation matrix over the local JSONs (plugin cache + `/tmp/opencode/modelsdev.json`
  + live probes): **no attachable mapping pairs exist beyond the three seeded rows** —
  the pasted external analysis blamed case sensitivity, but the seeds already used
  exact live strings; the real blocker is registry-side absence (its provider-scoped
  ids like `openai/gpt-4o` do not exist in the `opencode/*` catalog) plus stale
  LiveCodeBench strings (live: `GPT-4O-2024-08-06`, not `-05-13`;
  `DeepSeek-R1-0528`, not plain `DeepSeek-R1`).
- Mapping engine (`src/services/model-matching.ts`): `MappingIndex` now holds an
  exact map and a casefolded map; lookup tries the exact source string first and
  falls back to the casefolded key only when it resolves to a single distinct
  source; colliding entries (casefolded duplicates or identical keys) are dropped
  as ambiguous instead of guessed. Seeds unchanged.
- New `scripts/validate-mappings.ts` + `bun run validate:mappings`: fetches the
  live GPQA Diamond rows and LiveCodeBench `model_repr` list, checks every seeded
  mapping's source string and (best-effort, via `opencode api`) its registry id;
  prints PASS/DRIFT per entry with a summary line and exits non-zero on drift.
  Network-required by design; NOT part of `bun run check`.
- Tests: +3 (casefolded attach, exact-preferred with ambiguous fold, duplicate-key
  drop). Docs: `data-flow.md`, `huggingface-gpqa.md`, `livecodebench.md`,
  `development.md` updated.
- Re-verified: `bun run check` green — **171 tests / 586 assertions**, 0 fail.
- The validator's first live run immediately caught a real bug: it fetched
  `k_gpqaLeaderboardUrl` (the human-facing provenance page) instead of the API
  endpoint and reported the GPQA source unavailable. Fixed to use
  `f_buildHuggingFaceLeaderboardUrl(k_gpqaDatasetId)`; the adapter itself was
  always correct. Final smoke: **PASS 3/3, catalog:ok**.

### Adjustment 19 — LLMBM migration (owner directive, 2026-10-25)

Owner knowledge docs (KNOWLEDGE_07/08) + `docs/llmbm-migration-plan.md`
directed replacing the GPQA + LiveCodeBench pair with a single LLMBM
(LLMBenchmark.ai) benchmark, clean break:

- Schema: `BenchmarkId = "llbm"` only; sort keys `llbmScore`/`llbmRank`
  (default `llbmRank` asc); `SourceId` gains `llbm`, loses `gpqa`/
  `livecodebench`; `matchType` reduced to `exact | alias | family_fallback`.
- Providers: deleted `src/providers/huggingface-gpqa.ts` and
  `src/providers/livecodebench.ts`; new `src/providers/llbm.ts`;
  `model-overview.ts` reduced to a single benchmark loader (`loadLlbm`).
- Mappings: `src/config/llbm-mappings.ts` with per-catalog entries
  `{ opencodeId, llbmId, matchType }`; old `benchmark-mappings.ts` removed.
- UI: single `LLBM` column (proxy rows prefixed `~`); status/summary wording
  switched to LLBM.
- Migration fallout was repaired across matching, ranking, cache tests and all
  unit suites; gate re-verified at each step.

### Adjustment 20 — LLMBM real-data fix (owner report, 2026-10-25)

Owner report (verbatim): "seems like no model is mapped properly to the llbm
models as none of current listed models have a value in LLMBM column; to be
fixed: propose solution". Diagnosis: the `/v1/scores?metric=coding` endpoint
the adapter was built against is **dead** (422 without metric, empty list
with any tried metric); the KNOWLEDGE_08-derived mapping table attached only
24 targets, most of which did not exist in the live dataset. Owner chose
"Option A" with metric `aa_coding_index` and "Auto-adopt exact + review
table".

- Adapter rewritten against `GET /v1/export` (~8.3 MB): metric filtering,
  unit normalization (`points` as-is with 0–100 guard, `ratio` × 100, other
  units skipped with warnings), duplicate rows keep the highest score,
  deterministic row order, no ad-hoc private cache (the model-overview cache
  envelope owns the 6 h TTL), 30 s timeout floor,
  `OPENCODE_LLM_BENCH_METRIC` override.
- `scripts/generate-mappings.ts` (`bun run generate:mappings`) regenerates the
  mapping table from the live scored set: tail-after-provider exact match →
  casefold → `-free` sibling as `family_fallback`; **37 of 82** catalog models
  matched and were adopted; the review table + suggestion list is printed for
  the owner. Dot-vs-dash and suffix near-misses (e.g. `claude-opus-4-8` vs
  `claude-opus-4.8`) were NOT auto-adopted pending owner policy.
- Matcher conflict rule: when two mappings share one LLBM id, the `exact`
  entry wins over `family_fallback`; same-kind collisions stay ambiguous and
  drop (keeps `z-ai/glm-5.3-flash` attached to the paid `glm-5.3-flash`).
- `scripts/validate-mappings.ts` re-pointed at the export scored set; live
  smoke passes for every adopted mapping.
- Tests: new `tests/unit/llbm-adapter.test.ts` (+11 tests) against a trimmed
  live fixture `tests/fixtures/llbm-export.sample.json`; test-models now
  honors the `source` option; the weakened snapshot/mapping/merge expectations
  from the migration were restored (ready snapshot matches 2 + ranks, host
  catalog test attaches via the real `moonshotai/kimi-k2.6` mapping, merged
  source only for duplicated IDs).
- Docs: new `docs/api/llmbenchmark.md`; GPQA/LiveCodeBench docs and fixtures
  deleted; `data-flow.md`, `caching.md`, `models-dev.md`,
  `ui-integration.md`, `development.md`, fixtures README refreshed.
- Re-verified: `bun run check` green — **163 tests / 555 assertions**, 0 fail.

### Phase 7 — Testing, security, CI
Unit suite (normalization, aliases, price units incl. no double-scaling, score→rank, sort directions/ties/missing,
filters, TTL, malformed/timeout/HTTP errors) + integration scenarios with mocked HTTP & committed fixtures (§14.2 list)
+ UI smoke checks (§14.3). Security: no secrets in logs/code/fixtures; HF token never sent to other origins; env validated
at actual plugin runtime (direnv ≠ GUI-process env). GitHub Actions: `bun install --frozen-lockfile && typecheck && lint && test`
(CI never autofixes).
- **Gate:** full pipeline green; feasibility PoC still valid on the targeted release.

### Phase 8 — Docs & release prep
Complete every `docs/` file (§15 of spec; API docs distinguish verified vs assumed with dates), README (purpose,
install, supported OpenCode versions, configuration, data sources + methodology, pricing units, limitations,
security policy, license, dev instructions), CHANGELOG, v0.1.0 + MIT + GRASTROY Creations metadata,
final diff review + report of commands for the owner.
- **Gate:** ready for owner review; **zero commits/pushes performed by the agent**.

---

## 8. Definition of done (v0.1.0 checklist — KNOWLEDGE_03 §19)

1. Plugin loads in targeted OpenCode without runtime errors
2. All models from the selected discovery mechanism represented
3. Prices normalized to USD/1M in/out from verified source
4. GPQA carries variant + source + evaluation metadata where available
5. LiveCodeBench selectable independently of GPQA
6. No fabricated scores/prices for missing data
7. Every requested column sortable both directions
8. Sorting deterministic; missing values last
9. Search/filters operate on normalized records
10. Collapse/expand via verified native mechanism
11. Menu/command toggle exists
12. Source failures isolated; stale-data status shown
13. Unit + integration tests, lint, typecheck pass
14. Architecture & data-source docs current under `docs/`
15. Complex paths commented
16. No secrets/caches/generated files in Git
17. Version/owner/license metadata correct
18. Agent performed **no** commit/push/publish

---

## 9. Git & ownership rules

- The **owner** performs `git commit` / `git push` / publishing. Agents prepare changes, run checks, show staged diffs,
  and report suggested commands only.
- Before any commit: verify nothing staged contains API keys, `.direnv/`, caches, or personal paths.

## 10. Open decisions (confirm with owner during implementation)

1. **UI emphasis** — recommended: `session.panel` primary table + compact `sidebar.content` summary + slash commands
   (vs. sidebar-only). Current plan assumes the recommended option.
2. **Pricing source** — registry `Model.Info.cost` first (verify units); external catalog only if Phase 1 finds the
   registry insufficient. Treat `inference/v1/models` as availability info, not a pricing guarantee.
3. **GPQA dataset ID + LiveCodeBench source** — must be pinned by Phase 1 evidence, not guessed.
4. **Local dev loading** — thin `.opencode/plugins/` entry re-exporting `src/` (recommended) vs. build-copy step.
