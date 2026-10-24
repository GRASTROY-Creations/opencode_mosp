# API — LiveCodeBench

**Status: VERIFIED** (2026-10-24). The URL below is the exact data file the
official leaderboard page fetches; it is not an invented endpoint.

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

## Aggregation (our design)

- Overall score = arithmetic mean of `pass@1` over the selected time window
  (and optionally difficulty/platform). Example: DeepSeek-V3, all 1,055 rows →
  49.55.
- **ASSUMED:** this mean reproduces the score shown on the official site for
  the same window. Phase 3 must check 2–3 models against the rendered
  leaderboard before trusting it. Record the outcome here.
- Store `score`, `window` (start/end epoch ms), `sampleCount`, and
  `computedAt`. A score is only valid together with its window.
- Score ≠ rank: rank comes from our comparator (missing last, deterministic
  tie-break by id).
- Thin coverage (a model with 5 questions) must not be silently ranked above
  a model evaluated on the full window: Phase 3 adds a minimum-sample guard
  and surfaces `sampleCount` in the UI.

## Matching

`model_repr` / `link` identify models by display name or HF repo
(`DeepSeek-V3`, `Qwen/Qwen3-235B-A22B`, `o3__high`, …). Reasoning variants
(`(High)`, `(Thinking)`, `_nothink`) are distinct rows. Matching to OpenCode
`provider/model` IDs needs the reviewed alias table; unresolved → `null`.

## Refresh strategy

- 6 h TTL, benchmark class; 6.9 MB per fetch, so never fetch on keystroke or
  panel open — only on explicit refresh/background refresh with cache.
- Persist the raw payload (schema-versioned) plus derived aggregates; keep
  last-known-good and mark staleness.
- Failure isolation per source; the rest of the overview must stay usable.
