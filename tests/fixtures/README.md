# Test fixtures

Real, sanitized snapshots taken during Phase 1 verification (2026-10-24). They
exist so parser tests run against the **actual** response shapes instead of
guessed ones.

| File | Source | Snapshot date |
|---|---|---|
| `model-info.sample.json` | `GET /api/model` on the local OpenCode service (v2.1.4) | 2026-10-24 |
| `hf-gpqa-leaderboard.sample.json` | `GET https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard` | 2026-10-24 |
| `livecodebench.sample.json` | `GET https://livecodebench.github.io/performances_generation.json` | 2026-10-24 |

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
