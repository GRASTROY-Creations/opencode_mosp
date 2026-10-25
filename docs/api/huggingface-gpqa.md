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

## Adapter (implemented, Phase 3)

`src/providers/huggingface-gpqa.ts`:

- `f_buildHuggingFaceLeaderboardUrl(datasetId)` — percent-encodes each dataset
  path segment.
- `f_parseGpqaLeaderboard(payload)` — keeps exactly
  `.eval_results/gpqa_diamond.yaml`; requires `lower_is_better === false`;
  validates `modelId` and a 0–100 `value`.
- `f_fetchGpqaBenchmarks(options)` — shared fetch helper plus parser; fetch
  failures come back as `AdapterResult` errors for per-source isolation.
- Output: `benchmarkId: "gpqa"`, `variant: "gpqa_diamond"`, `rank: null`
  (HF's mixed-subset rank is never reused), `sampleCount: null` (the payload
  has no reliable sample count), and `source.url` when it is a valid HTTP(S)
  URL, otherwise the leaderboard page.
- Duplicate Diamond rows for one `modelId` are treated as ambiguous: the model
  is left unmatched with a warning. Rows from other subsets are ignored.
- **Live probe (2026-10-24):** 25 normalized rows, 0 warnings — exactly the
  observed Diamond subset size.

## Open questions

- Is `value` always normalized to accuracy percentage, including `with_tools`
  variants? Observed values 18.69–94.44 suggest yes, but only the Diamond subset
  matters for us.
- Whether HF exposes ETags/Last-Modified for conditional requests — Phase 3.

## Mapping validation (2026-10-25)

- The KNOWLEDGE_04.md candidate table was checked against the live Diamond
  subset: **zero** of its `gpqaModelId` strings appear verbatim among the 25
  live `modelId`s. Live ids carry HF org prefixes (e.g. `moonshotai/Kimi-K2.6`,
  `Qwen/Qwen3.5-397B-A17B`); the candidate table uses un-prefixed/space
  variants.
- The candidate doc also contains a machine-generation artifact
  ("Написание текста") — same suspect provenance as the discarded
  KNOWLEDGE_01 draft.
- `k_benchmarkMappings` stays empty until the owner confirms real identities;
  org-prefix/space normalization alone is speculative and NOT allowed as a
  reviewed mapping.
