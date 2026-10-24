# API — OpenCode pricing

**Status: VERIFIED (units, shape, tiers)** (2026-10-24). The *tier selection
semantics* are **ASSUMED** and must be confirmed in Phase 3.

## Source

Pricing is part of the model registry, not a separate endpoint:
`ModelInfo.cost` (see `opencode-models.md`).

```ts
type MoneyUSDPerMillionTokens = number;

type ModelCost = {
  tier?: { type: "context"; size: number };
  input: MoneyUSDPerMillionTokens;
  output: MoneyUSDPerMillionTokens;
  cache: { read: MoneyUSDPerMillionTokens; write: MoneyUSDPerMillionTokens };
};
```

Verified in the served OpenAPI schema: `input`/`output`/`cache.*` are all
`$ref: Money.USDPerMillionTokens`. **Unit: USD per 1,000,000 tokens.**

## Observed examples (2026-10-24)

| Model | cost entries |
|---|---|
| `opencode/gpt-5-nano` | `[{ input: 0.05, output: 0.4, cache: { read: 0.005, write: 0 } }]` |
| `opencode/claude-haiku-5-5` | base `{ input: 0.1, output: 0.5, cache: { read: 0.01, write: 0.125 } }`, then `{ tier: { type: "context", size: 100000 }, input: 0.5, output: 2.5, ... }` |
| `opencode/deepseek-v4.1-flash-free` | `[{ input: 0, output: 0, cache: { read: 0, write: 0 } }]` |

Sanity check: `gpt-5-nano` at $0.05/$0.40 per 1M matches its public list price,
corroborating the unit.

## Tier semantics (ASSUMED — verify in Phase 3)

- The entry **without** `tier` is the base price.
- An entry **with** `tier.type: "context"` applies to requests at or above
  `tier.size` context tokens (`size` is a token count, e.g. 100000 or 272000).
- Entries appear sorted by ascending `size` in observed data; do not rely on
  ordering — sort defensively.
- For the overview table, display the **base tier** as "input/output price" and
  indicate additional tiers (`+N tiers`) rather than blending them.
- Whether the threshold means *prompt tokens* or *total context* is not
  documented; Phase 3 must test one tiered model and record the result here.

## Rules

- Missing/unavailable pricing → `null` in domain records, never `0`.
- A genuine zero is a free model; render "free", do not hide the row.
- Cache read/write prices are stored but not shown in the default table.
- Never send these values anywhere; this is local registry data.
