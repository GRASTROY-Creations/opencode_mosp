# Data-source goals

| Data | Source | Requirement |
|---|---|---|
| Catalog, names, context, prices | OpenCode registry | Authoritative; never overridden by other sources |
| Coding / Intel scores | LLMBenchmark.ai `/v1/export` | Exact ids or reviewed mappings only; 0–100 scale; provenance kept |
| Crosswalk | models.dev | Cached for future mapping work; not displayed |

Quality rules:

1. External data enters as `unknown` and is validated field by field.
2. Absence stays `null`; a published `0` stays `0`.
3. Ambiguous matches are left unmatched rather than guessed.
4. Mapping coverage is checked live with `bun run validate:mappings`
   (PASS / PENDING / DRIFT; must show 0 DRIFT).
5. Data licensing must permit the intended distribution — currently **open**
   for LLMBM ([D-0029](../decisions/D-0029-data-source-licensing.md)).

Source details: [guide/sources/](../guide/sources/README.md).
