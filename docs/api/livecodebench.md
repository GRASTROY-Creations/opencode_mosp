# API — LiveCodeBench

**Status: VERIFIED (endpoint, default window, aggregation)** (2026-10-24).
The URL below is the exact data file the official leaderboard page fetches; it
is not an invented endpoint. The scoring window and mean-of-`pass@1` algorithm
were verified against `leaderboard.html` and reproduced by the adapter on the
live snapshot the same day.

## Endpoint

```
GET https://livecodebench.github.io/performances_generation.json
```

- Discovered in `https://livecodebench.github.io/leaderboard.html`
  (`DEFAULT_DATASET = 'performances_generation.json'`).
- Official project: `https://github.com/livecodebench/livecodebench`; the file
  is **not** in the git repo (raw.githubusercontent.com → 404) — the Pages site
  is the distribution point.
- HTTP 200, 6,950,346 bytes on 2026-10-24. No auth. Treat as a rolling
  snapshot: the current page window is "454 problems, 8/1/2024 – 5/1/2025".
- Fixture: `tests/fixtures/livecodebench.sample.json` (trimmed).

## Payload

```ts
type LiveCodeBenchFile = {
  performances: Array<{
    question_id: string;   // e.g. "1873_A"
    model: string;         // JOIN KEY → models[].model_repr
    date: number;          // epoch ms, problem date
    difficulty: "easy" | "medium" | "hard";
    pass@1: number;        // 0 … 100
    platform: "codeforces" | "leetcode" | "atcoder";
  }>;
  models: Array<{
    model_name: string;    // API-style id, e.g. "deepseek-chat"
    model_repr: string;    // display name, e.g. "DeepSeek-V3"  ← use this to join
    model_style: string;
    release_date: number;  // epoch ms
    link: string;          // usually a Hugging Face model URL
  }>;
  date_marks: number[];    // epoch ms window boundaries
};
```

Observed on 2026-10-24: 29,540 performance rows, 28 models, dates
2023-05-08 → 2025-04-07, `date_marks` ending 2025-05-01.

**Join gotcha:** `performances[].model` matches `models[].model_repr`, *not*
`models[].model_name` (`model_name = "deepseek-chat"` vs
`model = "DeepSeek-V3"`). Joining on `model_name` silently produces zero rows.

## Aggregation (verified)

- Overall score = arithmetic mean of `pass@1` over the selected time window.
  This is the exact algorithm in `leaderboard.html` (`getPassAt1`); the site
  rounds the displayed value to one decimal place.
- **Default window (verified in page source):** the page starts at
  `date_marks[15]` when there are more than 12 marks, otherwise
  `date_marks[4]`, and ends at the last mark. With the 25 marks observed on
  2026-10-24 that is **2024-08-01 → 2025-05-01** (454 problems).
- **Live reproduction (2026-10-24):** the adapter returned 28 models with the
  default window and no warnings. `DeepSeek-V3` scored **27.2026** over
  **454** samples, matching an independent calculation from the raw file.
  (The earlier 49.55 figure was the all-time mean, not the default window.)
- Store `score`, `window` (start/end ISO-8601), and `sampleCount` on every
  result. A score is only valid together with its window.
- Score ≠ rank: rank comes from our comparator (missing last, deterministic
  tie-break by id).
- **Minimum-sample guard:** 100 problems (the page's own recommendation).
  Models below the guard are omitted with a `below-minimum-samples` warning;
  a five-question sample must never outrank a full-window result.
- Duplicate `model_repr` entries make that model ambiguous and unmatched;
  malformed/unknown performance rows are counted in warnings, not fabricated.

## Matching

`model_repr` / `link` identify models by display name or HF repo
(`DeepSeek-V3`, `Qwen/Qwen3-235B-A22B`, `o3__high`, …). Reasoning variants
(`(High)`, `(Thinking)`, `_nothink`) are distinct rows. Matching to OpenCode
`provider/model` IDs needs the reviewed alias/mapping tables; unresolved → `null`.

### Mapping validation (2026-10-25)

- The KNOWLEDGE_04.md candidate table was checked against the live payload:
  **zero** of its `lcbModelId` strings appear among the 28 live `model_repr`s
  (`DeepSeek-V3`, `O4-Mini (High)`, `Claude-Sonnet-4`, …). The candidate doc
  carries a machine-generation artifact ("Написание текста") and is not trusted.
- `k_benchmarkMappings` stays empty until the owner confirms real identities.

## Adapter (implemented, Phase 3)

`src/providers/livecodebench.ts`:

- `f_parseLiveCodeBench(payload, { minimumSamples?, window? })` — pure,
  fixture-tested parser; default window derived from `date_marks`, minimum
  sample count 100.
- `f_fetchLiveCodeBench(options)` — shared fetch helper (timeout, retry,
  `Retry-After`) plus parser; returns `AdapterResult`, never throws live errors.
- Output: one `ModelBenchmark` per model with `variant: "generation"`,
  `rank: null` (computed later), `sampleCount`, ISO window bounds, and source
  URL. Models with no performances in the window have **no row**.
- Unknown/ambiguous model names are never matched heuristically; they are
  reported as warnings and excluded.

## Refresh strategy

- 6 h TTL, benchmark class; 6.9 MB per fetch, so never fetch on keystroke or
  panel open — only on explicit refresh/background refresh with cache.
- Persist the raw payload (schema-versioned) plus derived aggregates; keep
  last-known-good and mark staleness.
- Failure isolation per source; the rest of the overview must stay usable.
