# Test fixtures

Real, sanitized snapshots taken during Phase 1 verification (2026-10-24). They
exist so parser tests run against the **actual** response shapes instead of
guessed ones.

| File | Source | Snapshot date |
|---|---|---|
| `model-info.sample.json` | `GET /api/model` on the local OpenCode service (v2.1.4) | 2026-10-24 |
| `hf-gpqa-leaderboard.sample.json` | `GET https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard` | 2026-10-24 |
| `livecodebench.sample.json` | `GET https://livecodebench.github.io/performances_generation.json` | 2026-10-24 |
| `models-dev.sample.json` | `GET https://models.dev/api.json` (opencode provider: 130 models trimmed to {id,name,family,release_date}; one openai model as filtering proof) | 2026-10-25 |
| `model-info.full.sample.json` | `GET /api/model` on the local OpenCode service (v2.1.4) — full 82-model live catalog, sanitized | 2026-10-25 |
| `hf-gpqa-kimi-qwen.sample.json` | `GET https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard` — the 3 live Diamond rows matching the seeded `k_benchmarkMappings` | 2026-10-25 |

## Sanitization

- `model-info.sample.json`: `settings`, `headers`, and `body` were removed.
  These can contain base URLs and **credentials/org identifiers**; fixtures must
  never carry secrets. All remaining values are verbatim.
- `hf-gpqa-leaderboard.sample.json`: author avatar URLs were dropped; the
  public author name/type, notes, source, and scores are verbatim. Three
  GPQA-Diamond rows plus one `gpqa.yaml` row are included to exercise subset
  filtering.
- `livecodebench.sample.json`: three models, four performance rows each, and
  the first six date marks; values are verbatim. The full snapshot has 29,540
  rows, 28 models, and a date range of 2023-05-08 → 2025-04-07.

Fixtures are trimmed for size only — never adjust scores, dates, or identifiers
by hand. Refresh them from the live sources; see `docs/api/` for each endpoint.
