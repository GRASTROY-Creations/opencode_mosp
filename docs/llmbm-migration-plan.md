# LLMBM Migration Plan (Adjustment 19)

## Overview
Replace GPQA + LiveCodeBench dual-column benchmark system with a single **LLMBM** column sourced from `api.llmbenchmark.ai/v1/scores?metric=coding`. This is a clean break — GPQA and LCB are fully removed.

## Decisions (User-Confirmed)
- **Metric**: `coding` (default, per KNOWLEDGE_07)
- **Mappings**: Clean break — migrate 3 seeded GPQA mappings to LLMBM equivalents using KNOWLEDGE_08 mappings
- **Validator**: Remove `validate:mappings` script entirely (GPQA/LCB fully dropped)
- **Transition**: Clean break — no parallel run

---

## Phase 1: Schema & Domain Changes

### 1.1 Update `ModelBenchmark` type (`src/domain/model-benchmark.ts`)
```typescript
// REMOVE: gpqaScore, gpqaRank, livecodebenchScore, livecodebenchRank, gpqa/livecodebench variants
// ADD:
export interface ModelBenchmark {
  benchmarkId: "llmbm";
  variant: "coding";  // or "overall" if configurable later
  score: number | null;      // 0-100
  rank: number | null;       // 1-based
  sourceModelId: string | null;  // LLMBM API id (e.g., "moonshotai/kimi-k2-0905")
  sourceUrl: string | null;
  evaluatedAt: string | null;
}
```
- Remove `BenchmarkId = "gpqa" | "livecodebench"` union
- Update `k_benchmarkIds`, `k_gpqaVariant`, `k_livecodebenchVariant`
- Update `f_findBenchmark`, `f_validateModelBenchmark`
- Keep `matchType` field (from Adjustment 12/18) for mapping provenance

### 1.2 Update `ModelRecord` (`src/domain/model-record.ts`)
- `benchmarks: readonly ModelBenchmark[]` — now only LLMBM entries possible
- Update `f_validateModelRecord` accordingly

### 1.3 Update `ModelSortKey` (`src/domain/model-sort.ts`)
```typescript
// REMOVE: gpqaScore, gpqaRank, livecodebenchScore, livecodebenchRank
// ADD: llmbmScore, llmbmRank
```
- Default sort: `llmbmRank` ascending (best first)
- Default direction for scores: descending

### 1.4 Update `SourceId` (`src/domain/source-status.ts`)
```typescript
// REMOVE: "gpqa", "livecodebench"
// ADD: "llmbm"
```

---

## Phase 2: Remove GPQA/LCB Code

### 2.1 Delete Files
- `src/providers/huggingface-gpqa.ts`
- `src/providers/livecodebench.ts`
- `tests/fixtures/hf-gpqa-leaderboard.sample.json`
- `tests/fixtures/livecodebench.sample.json`
- `tests/unit/gpqa-adapter.test.ts`
- `tests/unit/livecodebench-adapter.test.ts`

### 2.2 Remove from `model-overview.ts`
- Remove `OverviewBenchmarkLoader` type
- Remove `loadGpqa`, `loadLiveCodeBench` from `OverviewRefreshOptions`
- Remove GPQA/LCB jobs from `fh_performRefresh`
- Remove `fh_readBenchmarks`, `fh_readGpqa`, `fh_readLiveCodeBench`
- Remove GPQA/LCB from `fh_readAllSources`, `fh_assembleSnapshot`, `fh_buildStatus`
- Keep `fh_readModelsDev` (models.dev crosswalk stays)

### 2.3 Remove from `panel-controller.ts`
- Remove `fh_loadGpqa`, `fh_loadLiveCodeBench`
- Remove from `f_refresh` options
- Update `fh_shortSource` (remove gpqa/livecodebench)

### 2.4 Remove from `panel-controller.ts` types
- Remove `BenchmarkId` import
- Remove `gpqa`/`livecodebench` from filter types if present

---

## Phase 3: New LLMBM Adapter

### 3.1 Create `src/providers/llmbm.ts`
Based on KNOWLEDGE_07/08 adapter but with:
- **Endpoint**: `GET https://api.llmbenchmark.ai/v1/scores?metric=coding`
- **Response**: Array of `{ id, score, rank, metric }`
- **Cache**: 6h TTL (benchmark TTL), key `llmbm`
- **Cache envelope**: Same schema v1, payload = `Record<string, LLMBMBenchmark>`
- **Validation**: Required `id` (string), `score` (number), `rank` (number, nullable), `metric` (string)
- **Error handling**: Same retry/backoff as other adapters (408/425/429/5xx + Retry-After)
- **Last-known-good**: On failure, serve stale cache with `stale` status
- **Host-only errors**: No URLs/tokens in error messages

### 3.2 Types
```typescript
export interface LLMBMBenchmark {
  llmbmId: string;        // e.g., "moonshotai/kimi-k2-0905"
  score: number | null;   // 0-100
  rank: number | null;    // 1-based
  metric: string;         // "coding"
  fetchedAt: string;      // ISO timestamp
}

export type LLMBMCrosswalk = ReadonlyMap<string, LLMBMBenchmark>; // key = llmbmId
```

### 3.3 Create `src/config/llmbm-mappings.ts`
Based on KNOWLEDGE_08 but cleaned up:
- Map `opencodeId` → `llmbmId` (or `null` if no equivalent)
- Include all 82 current opencode models
- `null` for truly unknown (beam-free, big-pickle, flint-40b-free, etc.)
- Document fallback logic in comments

### 3.4 Update `model-overview.ts`
- Add `loadLlmbm: OverviewLlmbmLoader` to `OverviewRefreshOptions`
- Add `fh_readLlmbm` to `fh_readAllSources`
- Add LLMBM job to `fh_performRefresh`
- Add `llmbm` to `fh_assembleSnapshot`, `fh_buildStatus`, `fh_readAllSources`
- Add `llmbm` to `SourceRead` in status

### 3.5 Update `panel-controller.ts`
- Add `fh_loadLlmbm` loader
- Wire into `f_refresh` options

---

## Phase 4: Mapping & Matching

### 4.1 Update `benchmark-mappings.ts` → `llmbm-mappings.ts`
- Rename file: `benchmark-mappings.ts` → `llmbm-mappings.ts`
- New interface:
```typescript
export interface LLMBMMapping {
  opencodeId: string;      // e.g., "opencode/kimi-k2.6"
  llmbmId: string | null;  // e.g., "moonshotai/kimi-k2-0905" or null
  matchType: "exact" | "family_fallback";  // track provenance
  reason: string;
}
```
- Migrate 3 seeded GPQA mappings to LLMBM equivalents using KNOWLEDGE_08
- Add all 82 opencode models from live catalog
- `null` for truly unknown (beam-free, big-pickle, etc.)

### 4.2 Update Matching Logic (`model-matching.ts`)
- Replace `BenchmarkId` with `"llmbm"`
- Mapping stage: lookup `llmbmId` from `llmbm-mappings.ts` using `opencodeId`
- Attach `LLMBMBenchmark` to models with matched `llmbmId`
- Keep casefold+unique lookup (Adjustment 18) for `llmbmId` matching
- `matchType` on benchmark: "exact" | "family_fallback"

---

## Phase 5: UI Changes

### 5.1 Column Changes (`tui.tsx`)
- **Remove**: GPQA column, LCB column
- **Add**: LLMBM column (width ~12: `#rank score`)
- **Format**: `` `${rank ? `~#${rank}` : '—'} ${score?.toFixed(1) ?? '—'}` ``
  - `~` prefix for family_fallback matchType (from matchType field)
- **Sort**: `llmbmScore` (desc), `llmbmRank` (asc)
- **Header**: "LLMBM" with sort indicator

### 5.2 Sidebar Summary
- Show: "LLMBM #rank model score" for top model
- "No LLMBM data" if no models have scores

### 5.3 Status/Filter
- Remove "missing GPQA"/"missing LCB" filters
- Status line: "N models · LLMBM fresh/stale"

---

## Phase 5: Fixtures & Tests

### 5.1 New Fixtures
- `tests/fixtures/llmbm-coding.sample.json` — capture from `api.llmbenchmark.ai/v1/scores?metric=coding` (trimmed to relevant models)
- Update `tests/fixtures/model-info.full.sample.json` (already have 82 models)

### 5.2 Remove Tests
- `tests/unit/gpqa-adapter.test.ts`
- `tests/unit/livecodebench-adapter.test.ts`
- GPQA/LCB related tests in `model-matching.test.ts`, `model-overview.test.ts`, `model-filter.test.ts`

### 5.3 New Tests
- `tests/unit/llmbm-adapter.test.ts` — parse, cache, fetch wrapper, empty fail
- `model-overview.test.ts` — host-first + LLMBM attach, cache fallback, LLMBM failure isolation
- `model-matching.test.ts` — LLMBM mapping attach (exact, family_fallback, null), casefold lookup
- `llmbm-adapter.test.ts` — parse, cache, fetch wrapper, empty fail

### 5.4 Update Existing Tests
- `model-overview.test.ts` — replace GPQA/LCB fixtures with LLMBM
- `model-matching.test.ts` — replace GPQA/LCB mapping tests with LLMBM
- `panel-controller.test.ts` — status line expectations, snapshot helper

---

## Phase 6: Remove Validator & Update Scripts

### 6.1 Remove
- `scripts/validate-mappings.ts`
- `validate:mappings` from `package.json` scripts
- `validate:mappings` from `development.md`, `data-flow.md`, `huggingface-gpqa.md`, `livecodebench.md`

### 6.2 Update `package.json`
- Remove `validate:mappings` script

---

## Phase 7: Documentation Updates

### 7.1 New/Updated Docs
- `docs/api/llmbm.md` — new (endpoint, schema, caching, mapping, verification)
- `docs/api/opencode-models.md` — note LLMBM source
- `docs/architecture/caching.md` — add llmbm row (6h), remove gpqa/lcb
- `docs/architecture/data-flow.md` — pipeline update (single benchmark source)
- `docs/architecture/ui-integration.md` — column changes, LLMBM rendering
- `docs/architecture/caching.md` — sources table update
- `docs/architecture/data-flow.md` — pipeline diagram update
- `docs/PLAN.md` — **Adjustment 19** block before Phase 7
- `tests/fixtures/README.md` — new fixture rows

### 7.2 Remove/Archive
- `docs/api/huggingface-gpqa.md` → archive or mark deprecated
- `docs/api/livecodebench.md` → archive or mark deprecated
- `docs/api/huggingface-gpqa.md` validation section → remove or archive

---

## Phase 8: Gate & Verification

### 8.1 Gate
```bash
bun run check  # typecheck + lint + tests (expect ~170+ tests, ~580+ expects)
```

### 8.2 Visual Verification (Owner)
1. Open `/mosp` — 82 models appear immediately (host-first)
2. LLMBM column shows scores/ranks for mapped models (Kimi, Qwen, etc.)
3. Unmapped models show `— —`
4. Family fallback models show `~#rank score`
5. Sort by LLMBM column works (asc/desc)
6. `/mosp update` refreshes LLMBM data
8. `/mosp status` shows `llmbm` source line

---

## Implementation Order (Atomic Steps)

1. **Schema** — `model-benchmark.ts`, `model-record.ts`, `model-sort.ts`, `source-status.ts`
2. **Delete GPQA/LCB** — providers, fixtures, tests, imports
3. **LLMBM Adapter** — `llmbm.ts`, `llmbm-mappings.ts`, types
4. **Service Integration** — `model-overview.ts`, `panel-controller.ts`
5. **Matching** — `llmbm-mappings.ts`, `model-matching.ts` updates
6. **UI** — `tui.tsx` column changes
7. **Fixtures & Tests** — new fixtures, adapter tests, update existing
8. **Remove Validator** — script, package.json, docs
8. **Docs** — all updates
9. **Gate** — `bun run check`, owner visual

---

## Rollback Plan
If issues arise:
- Git revert to Adjustment 18 commit
- GPQA/LCB code preserved in git history
- Fixtures preserved in git history

---

## Open Questions for Implementation

1. **LLMBM API Rate Limits** — Need to verify rate limits; adapter uses 15s timeout + retries
2. **Metric Configurability** — Currently hardcoded `coding`; future PR could add `--metric` flag
3. **Null Mappings** — 30+ models have `null` llmbmId; UI renders `— —` correctly

---

## Estimated Scope
- **Files to modify**: ~15
- **Files to create**: ~5 (adapter, mappings, fixtures, tests, docs)
- **Files to delete**: ~6
- **Tests**: ~170 → ~170 (replace GPQA/LCB tests with LLMBM tests)
- **Gate**: `bun run check` must pass

---

*This plan implements Adjustment 19 per user request: "dropping the broken data columns GPQA and LCB; introduce a single LLMBM Column with The Benchmark Value of those mapped Models; Also we need to update Mapping"*