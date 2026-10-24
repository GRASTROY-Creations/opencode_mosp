# API — Hugging Face GPQA leaderboard

**Status: VERIFIED** (2026-10-24). Endpoint and payload confirmed against the
live service; authentication and rate limits not documented publicly.

## Endpoint

```
GET https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard
```

- No token required (public dataset metadata; the dataset files themselves are
  gated, the leaderboard payload is not).
- Response: JSON array, 115 entries, 97 unique model IDs on 2026-10-24
  (87,984 bytes). Fixture: `tests/fixtures/hf-gpqa-leaderboard.sample.json`.
- Dataset: `Idavidrein/gpqa` — the official GPQA dataset, license CC-BY-4.0,
  `gated: auto`. Do **not** send OpenCode credentials to Hugging Face; an
  optional `HUGGINGFACE_TOKEN` env var is reserved for rate-limit headroom only.

## Payload

Per entry:

```ts
type GpqaLeaderboardEntry = {
  rank: number;
  filename: string;          // e.g. ".eval_results/gpqa_diamond.yaml"
  value: number;             // accuracy in percent, 18.69 … 94.44 observed
  verified: boolean;         // all false on 2026-10-24 — display this honestly
  source: { url: string; name: string; isExternal: boolean | null } | null;
  modelId: string;           // Hugging Face hub ID, e.g. "Qwen/Qwen3.8-27B"
  author: { name: string; type: string; … };
  notes: string;             // free text, may state subset/sampling details
  lower_is_better: boolean;  // false for every observed entry
  num_parameters: number | null;
};
```

## Interpretation rules

- **Direction:** higher is better. `lower_is_better` exists per row; filter to
  `lower_is_better === false` defensively rather than assuming.
- **Subset filtering:** one model can appear many times under different
  `filename` values (`gpqa_diamond.yaml`, `gpqa.yaml`, `*_with_tools`, …
  observed: 25 rows for Diamond, 34 for base GPQA). The overview uses
  **exactly `.eval_results/gpqa_diamond.yaml`** and ignores everything else.
  A model without that file is `missing = null`, never an average across
  subsets.
- **Score ≠ rank.** Persist the score and the subset; compute our own rank via
  the pure comparator. The `rank` field reflects HF's ordering across mixed
  subsets and must not be reused directly.
- **Trust:** `verified` was `false` for all 115 rows. Render the flag (or a
  staleness/trust marker) rather than implying HF endorsement.
- **Coverage:** this leaderboard only contains models with HF-hosted eval
  results — predominantly open-weight models. Most proprietary models
  (Anthropic, OpenAI, Google hosted-only) are absent. Absence means `null`;
  never copy a vendor-reported number into this source.
- `modelId` is a Hugging Face repo ID, not an OpenCode `provider/model` ID.
  Matching requires the reviewed alias table (Phase 2). Ambiguity → unmatched.

## Refresh strategy

- One GET per refresh; cache TTL 6 h (benchmark class).
- Cache the raw payload keyed by source + schema version; keep last-known-good.
- Failure isolation: a GPQA failure leaves the rest of the overview usable and
  marks the source stale/partial.
- Rate limits are not published; keep requests sparse and never retry in a
  tight loop. Use the shared `fh_` fetch helper with timeout + backoff.

## Open questions

- Is `value` always normalized to accuracy percentage, including `with_tools`
  variants? Observed values 18.69–94.44 suggest yes, but only the Diamond subset
  matters for us.
- Whether HF exposes ETags/Last-Modified for conditional requests — Phase 3.
