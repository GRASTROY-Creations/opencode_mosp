# Test fixtures

Real, sanitized snapshots taken during verification runs. They exist so parser
tests run against the **actual** response shapes instead of guessed ones.

| File | Source | Snapshot date |
|---|---|---|
| `model-info.sample.json` | `GET /api/model` on the local OpenCode service (v2.1.4) | 2026-10-24 |
| `model-info.full.sample.json` | `GET /api/model` on the local OpenCode service (v2.1.4) — full 82-model live catalog, sanitized | 2026-10-25 |
| `models-dev.sample.json` | `GET https://models.dev/api.json` (opencode provider: 130 models trimmed to {id,name,family,release_date}; one openai model as filtering proof) | 2026-10-25 |
| `llbm-export.sample.json` | `GET https://api.llmbenchmark.ai/v1/export` — trimmed slice: 3 full `dataset.models` entries, 6 unique `aa_coding_index` score rows, a duplicate lower-score row (dedup proof), one `usd` row on another metric (filter proof), and 3 `aa_intelligence_index` rows (two overlapping models plus intelligence-only `openai/gpt-5.2`) | 2026-10-25 (intelligence rows 2026-10-26) |

The former `hf-gpqa-*.sample.json` and `livecodebench.sample.json` fixtures
were removed with the GPQA/LiveCodeBench providers during the LLMBM migration
(Adjustments 19/20); see `docs/api/llmbenchmark.md`.

## Sanitization

- `model-info*.sample.json`: `settings`, `headers`, and `body` were removed.
  These can contain base URLs and **credentials/org identifiers**; fixtures must
  never carry secrets. All remaining values are verbatim.
- `models-dev.sample.json`: only `{id, name, family, release_date}` per model is
  kept; other provider blocks are reduced to the single filtering proof.
- `llbm-export.sample.json`: score rows are verbatim from the live export
  (`modelId`, `source`, `metric`, `value`, `unit`, `observedAt`, `sourceUrl`,
  `setting`); the duplicate row is marked `source: "fixture-duplicate"` so the
  dedup test can name it. Other metrics/price history were dropped for size.

Fixtures are trimmed for size only — never adjust scores, dates, or identifiers
by hand. Refresh them from the live sources; see `docs/api/` for each endpoint.
