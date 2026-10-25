# models.dev (provider catalog)

**Status: VERIFIED (2026-10-25).** Owner directive for this source (verbatim):
"name, cost, context allwas from OpenCode registry; model-ids can be used from
models.dev for mapping properly to huggingface-gpqa and livecodebench".

## Endpoint

- `GET https://models.dev/api.json` — no authentication; static-ish JSON, size
  several MB (verified response 2026-10-25). Project:
  <https://github.com/anomalyco/models.dev>.
- The plugin fetches it only through `/mosp update` (or first refresh when the
  cache entry is missing); panel opens and keystrokes never hit this endpoint.

## Payload shape (verified)

- The **top-level keys are provider IDs** directly (no `providers` wrapper):
  232 providers observed 2026-10-25, including `opencode`, `openai`,
  `anthropic`, `google`, `deepseek`. Only `meta` exists among
  `qwen`/`meta-llama` guesses — there is no `qwen` or `meta-llama` provider ID.
- Provider objects carry `id`, `name`, `env`, `npm`, `api`, `doc`, and `models`
  (a map keyed by model ID).
- The `opencode` provider contains **130 models**, including all 16 IDs of the
  live location catalog (beam-free, big-pickle, flint-40b-free, gpt-6-luna,
  gpt-5-nano, claude-haiku-5-5, deepseek-v4-flash, deepseek-v4.1-flash(-free),
  qwen3.8-flash, glm-5.3-flash(-free), mimo-v2.6-flash-free,
  nemotron-3-ultra-free, nemotron-3.5-lightning-free,
  nemotron-3.5-super-vl-free, …).
- Model entries include `name`, `family`, `release_date`, `cost` (USD per 1M
  tokens, with `tiers`), `limit` (context/input/output), modalities, and
  reasoning flags. Example verified: `gpt-6-luna` → name "GPT-6 Luna", family
  "gpt-luna", cost `input 0.1 / output 0.5 / cache_read 0.01` (matches the
  OpenCode registry pricing observed in Phase 1).

## What the plugin stores (crosswalk only)

`src/providers/models-dev.ts` extracts **only** the `opencode` provider's
per-model `{ name, family, release_date }` triple into a trimmed crosswalk
keyed by `opencode/<modelId>` (`ModelsDevCrosswalk`). Cost/limit fields are
deliberately ignored: the OpenCode location registry stays the authoritative
source for name, cost, and context, per the owner directive. The crosswalk is
cached (`models-dev` entry, 6 h benchmark TTL) and appears as the last source
row in status; it is **not yet displayed** — it is the bridge for future
benchmark mappings (source ID ↔ family ↔ registry ID).

## Mapping validation status (2026-10-25)

- Benchmark mappings moved to `src/config/llbm-mappings.ts` and were
  rebuilt entry-by-entry against the live LLMBM dataset on 2026-10-25
  (79 of 82 catalog models carry a source ID; see `docs/api/llmbenchmark.md`).
- KNOWLEDGE_06 candidate IDs checked against models.dev: all five `openai/*`
  model IDs exist (`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o3-mini`),
  but the anthropic/deepseek/google ID strings do **not** exist under those
  provider keys (id drift), and `qwen`/`meta-llama` are not provider IDs at
  all. Keys must be enumerated from the live payload before any entry is
  adopted.
- Caveat: models.dev `opencode` entries are themselves rebranded
  (e.g. family `big-pickle`, `beam`), so the crosswalk unlocks mappings only
  where a family/name matches a live benchmark source ID. The adopted LLMBM
  mappings key on the exact LLMBM `modelId` tail (`opencode/glm-5.3` ↔
  `z-ai/glm-5.3`), with `-free` siblings attached as `family_fallback`.

## Adapter

`f_fetchModelsDevCrosswalk(options)` → `AdapterResult<ModelsDevCrosswalk>` via
the shared fetch policy (timeout, retries only for network/408/425/429/5xx,
`Retry-After`, host-only errors — no URL in messages). Non-`opencode` providers
are filtered out; malformed entries are skipped with `skipped-model` warnings;
an empty/absent provider map fails the source ("models.dev returned no
models"). Tests run against `tests/fixtures/models-dev.sample.json`; no
ordinary test touches the live endpoint.
