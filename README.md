# opencode_mosp

OpenCode "Model Overview Side Panel" (`/mosp`) plugin that shows a sortable overview of the models
available to your OpenCode installation: provider, context window, input/output
price (USD per 1M tokens), and two LLMBenchmark.ai scores — the Artificial
Analysis **coding index** and **intelligence index**.

- Version 1.2.23 · MIT · GRASTROY Creations, Korcakov Roman
- Target: OpenCode 2.2.0 (`@opencode/plugin` 2.2.0), Bun 1.4.x
- Documentation: [`.docs/README.md`](.docs/README.md) (goals, guide, decisions, tests, examples)
- Data licensing for the benchmark scores is unverified — see
  [`.docs/decisions/D-0029`](.docs/decisions/D-0029-data-source-licensing.md)

## Data sources

| Data | Source | Notes |
|---|---|---|
| Models, names, context, prices | OpenCode model registry (host catalog) | Authoritative; read on every panel mount |
| Coding / Intel scores | [LLMBenchmark.ai](https://llmbenchmark.ai) `/v1/export` (`aa_coding_index`, `aa_intelligence_index`) | Attached through reviewed mappings in `src/config/llbm-mappings.ts` |
| Crosswalk (not displayed) | [models.dev](https://models.dev) `api.json` | Cached for future mapping work |

Missing values render as `—` and are never fabricated. A `~` prefix marks a
score borrowed from a sibling model (e.g. a `-free` variant shown with its paid
model's score). No ranks are computed; only reported values are shown.

## Usage

The panel opens with `/mosp` (or `/mosp toggle`). Other commands:

- `/mosp update` — fetch all sources (the only network path)
- `/mosp redraw` — re-read host catalog + cache and repaint
- `/mosp status` — per-source freshness dialog
- `/mosp sort <column>` — e.g. `coding`, `intel`, `ctx`, `input-price`, `output-price`

Click a column header to sort; clicking again flips the direction. The
`[update]` button at the right end of the filter row does the same as
`/mosp update` — use it when the panel opens without models.

## Installation

### Global (available in all projects)
Extract the packed plugin into OpenCode's global plugins directory:

```bash
mkdir -p ~/.config/opencode/plugins/opencode_mosp
tar -xzf opencode_mosp-*.tgz -C ~/.config/opencode/plugins/opencode_mosp --strip-components=1
```

Install production dependencies (skips devDependencies):

```bash
cd ~/.config/opencode/plugins/opencode_mosp
bun install --production
```

Then add it to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "~/.config/opencode/plugins/opencode_mosp"
  ]
}
```

Or reference it by absolute/path entry as shown above. You can also extract directly into `~/.config/opencode/plugins/` without creating a subdirectory, but putting it in its own folder keeps things organized.

### Project-local
Extract into your project and add to `opencode.jsonc`:

```bash
mkdir -p .opencode/plugins/opencode_mosp
tar -xzf opencode_mosp-*.tgz -C .opencode/plugins/opencode_mosp --strip-components=1
cd .opencode/plugins/opencode_mosp
bun install --production
```

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "./.opencode/plugins/opencode_mosp"
  ]
}
```

### Pack it yourself
```bash
bun install
bun run pack:plugin
# outputs dist/opencode_mosp-*.tgz
```

## Development

```bash
bun install
bun run check
```

`bun run check` runs typecheck, lint, format check, and tests (no network). The mapping
scripts `bun run validate:mappings` and `bun run generate:mappings` need
network access. See `.docs/guide/development.md` for setup and environment variables,
and `.docs/guide/architecture/` plus `.docs/guide/sources/` for design and source details.
