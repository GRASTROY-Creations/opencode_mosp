Here is the concise, actionable plan to migrate from GPQA/LiveCodeBench to the unified **LLMBM** column using `api.llmbenchmark.ai`.

---

### **Phase 1: API Reconnaissance & Schema Update**
1. **Identify Target Metric**: Use `GET https://api.llmbenchmark.ai/v1/scores?metric=coding` (or `overall`) as the single source of truth [[11]].
2. **Update `ModelBenchmark` Schema**:
   - **Deprecate**: `gpqaScore`, `gpqaRank`, `lcbScore`, `lcbRank`.
   - **Add**: `llmbmScore` (`number | null`), `llmbmRank` (`number | null`), `llmbmMetric` (`string`).

### **Phase 2: Mapping Strategy (OpenCode → LLMBM)**
Since many OpenCode IDs are futuristic or variant names (e.g., `gpt-5.4-codex`, `claude-fable-5`), we will use a **Family-Based Fallback Mapping** in a new `src/config/llmbm-mappings.ts`:
1. **Exact Match**: Direct equivalents (e.g., `opencode/kimi-k2.6` → `moonshotai/kimi-k2.6`).
2. **Family Fallback**: Map unreleased/future variants to their closest confirmed LLMBM counterpart (e.g., `opencode/gpt-5.*` → `openai/gpt-5`, `opencode/claude-sonnet-5.*` → `anthropic/claude-sonnet-5.5`).
3. **Normalization**: Strip the `opencode/` prefix and lowercase to match LLMBM's `id` or `slug` fields.

*Example Mapping:*
```typescript
export const llmbmMappings: Record<string, string> = {
  "opencode/kimi-k2.6": "moonshotai/kimi-k2.6",
  "opencode/qwen3.8-max": "qwen/qwen3.8-max-prime", 
  "opencode/gpt-5": "openai/gpt-5",
  "opencode/claude-sonnet-5.5": "anthropic/claude-sonnet-5.5",
  // Family fallbacks for minor variants
  "opencode/gpt-5.4-codex": "openai/gpt-5", 
  "opencode/gemini-3.8-flash": "google/gemini-2.5-flash-lite", // fallback to closest available
};
```

### **Phase 3: Backend Adaptation**
1. **Deprecate Old Fetchers**: Remove `f_fetchGpqaBenchmarks`, `f_parseGpqaLeaderboard`, and LCB equivalents.
2. **Implement `f_fetchLlmbmBenchmarks`**:
   - **Endpoint**: `GET https://api.llmbenchmark.ai/v1/scores?metric=coding`
   - **Caching**: 6h TTL, atomic file writes in user cache dir, schema-validated envelopes.
   - **Resilience**: Retry on 408/425/429/5xx with exponential backoff + `Retry-After` cap.
3. **Join Logic**: Merge the fetched scores with the OpenCode model list using the `llmbmMappings` dictionary. Unmapped models safely receive `llmbmScore: null`.

### **Phase 4: Frontend/UI Adaptation**
1. **Column Replacement**: 
   - Remove `GPQA` and `LCB` columns from the data grid.
   - Add a single `LLMBM` column.
2. **Display Format**: Render as `~#rank score` (e.g., `~#12 88.4`). Handle `null` gracefully by displaying `—`.
3. **Sorting**: Update table sort handlers to sort by `llmbmScore` descending.

### **Phase 5: Validation & Testing**
1. Run `/mosp update` to trigger the new cache generation.
2. Verify the cache file contains valid `llmbmScore` entries for top-tier models (Kimi, Qwen, GPT, Claude).
3. Confirm zero regressions in table rendering and that unmapped models fallback to `—` without throwing UI errors.

---

