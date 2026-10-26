# From export row to table cell

1. Export row (`GET /v1/export`, `dataset.scores[]`):

```json
{ "modelId": "anthropic/claude-fable-5", "source": "artificialanalysis",
  "metric": "aa_intelligence_index", "value": 49.6, "unit": "points",
  "observedAt": "2026-10-26", "sourceUrl": "https://artificialanalysis.ai/models" }
```

2. `f_parseLlbmExport` (`src/providers/llbm.ts`) → `ModelBenchmark`:

```ts
{ benchmarkId: "llbmIntelligence", variant: "llbm-aa_intelligence_index",
  score: 49.6, scoreUnit: "percent", sourceModelId: "anthropic/claude-fable-5",
  matchType: null, sourceUrl: "https://artificialanalysis.ai/models",
  evaluatedAt: "2026-10-26T00:00:00.000Z", sampleCount: null, windowStart: null, windowEnd: null }
```

3. `f_matchBenchmarkRecords` (`src/services/model-matching.ts`) finds the
   reviewed mapping `opencode/claude-fable-5` and attaches the row with
   `matchType: "exact"`.

4. `f_buildTableLines` (`src/ui/panel-controller.ts`) renders the `Intel` cell
   as `49.6` (a `family_fallback` row would render `~49.6`; no row → `—`).
