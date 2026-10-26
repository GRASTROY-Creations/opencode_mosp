# Licenses

Rule (Licenses 7): only use libraries/content whose license allows commercial
use. Checked 2026-10-26.

## This project

MIT, © Grastroy Creations, Korcakov Roman — owner-approved exception to the
closed-source default ([D-0028](../decisions/D-0028-license.md)).

## Dependencies

| Package | Kind | License | Commercial |
|---|---|---|---|
| `@opencode/plugin` | runtime | MIT | yes |
| `@opencode/theme` | peer/dev | MIT | yes |
| `@opentui/core`, `@opentui/solid` | peer/dev | MIT | yes |
| `solid-js` | peer/dev | MIT | yes |
| `typescript` | dev | Apache-2.0 | yes |
| `eslint`, `@eslint/js`, `typescript-eslint` | dev | MIT | yes |
| `@types/bun` | dev | MIT | yes |
| `prettier`, `eslint-config-prettier` | dev | MIT | yes |

Re-check with: `bun -e "for (const p of [...]) console.log(p, require('./node_modules/'+p+'/package.json').license)"`
whenever a dependency is added.

## Data sources

| Source | License / terms | Commercial |
|---|---|---|
| OpenCode model registry (host) | via `@opencode/plugin` (MIT) | yes |
| models.dev `api.json` | repository `sst/models.dev` MIT | yes |
| LLMBenchmark.ai `/v1/export` | **no terms published** | **unverified — [D-0029](../decisions/D-0029-data-source-licensing.md)** |
| Artificial Analysis indexes (upstream of the LLMBM scores) | **no terms located** | **unverified — [D-0029](../decisions/D-0029-data-source-licensing.md)** |
