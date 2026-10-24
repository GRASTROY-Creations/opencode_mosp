# API — OpenCode model catalog

**Status: VERIFIED** (2026-10-24, OpenCode 2.1.4, Linux).
Sources: live service responses plus the OpenAPI document served at
`/openapi.json` by the local service.

## How the plugin reads models

Two ways to obtain the same `ModelInfo` records:

| Context | Access |
|---|---|
| TUI plugin | `context.data.location.model.list(location)` (sync via `.sync()`, drop cache via `.invalidate()`) |
| Server plugin | `context.model.list()` |
| HTTP (debugging only) | `GET /api/model?location[directory]=<abs-path>` and `GET /api/provider` |

`/api/model` returns `{ location: { directory }, data: ModelInfo[] }`. The
`location` query parameter is a deep object: `location[directory]`.

## Verified `ModelInfo` shape

From `@opencode/client` 2.1.4 generated types and a live response
(`tests/fixtures/model-info.sample.json`):

```ts
type ModelInfo = {
  id: string;
  modelID: string;
  providerID: string;
  canonical?: string;        // canonical provider mapping, when configured
  family?: string;
  name: string;
  compatibility?: { reasoningField?: string; maxTokensField?: string };
  package?: string;
  settings?: unknown;        // MAY CONTAIN SECRETS/HEADERS — never persist
  headers?: Record<string, string>; // MAY CONTAIN CREDENTIALS — never persist
  body?: unknown;
  capabilities: { tools: boolean; input: string[]; output: string[]; temperature: boolean };
  variants: Array<{ id: string; settings?: unknown; headers?: Record<string, string>; body?: unknown }>;
  time: { released: number }; // epoch milliseconds
  cost: ModelCost[];          // see opencode-pricing.md
  status: "alpha" | "beta" | "deprecated" | "active";
  enabled: boolean;
  limit: { context: number; input?: number; output: number }; // tokens
};
```

Notes:

- The list is **location/provider scoped**. In this environment it returned 16
  models for the single authenticated provider `opencode`; a user with more
  providers sees more. Never assume a global catalog.
- `id` equals `modelID` in observed data; the plugin's domain key is
  `` `${providerID}/${modelID}` ``.
- `time.released` is milliseconds, not seconds.
- `cost` is always an array in the HTTP response, even for a single tier.
- `headers`/`settings` can carry organization IDs and API secrets. They must
  never be stored, rendered, or logged.
- Free models report `input: 0` / `output: 0`; that is a real price, not
  missing data. Distinguish "free" (0) from "unknown" (null) in domain code.

## Stability

The OpenAPI document is the machine-readable contract. `ModelInfo` is a
generated type shipped with the package, so a version bump can change it. Pin
`@opencode/plugin` (already exact in `package.json`) and re-verify on upgrade.
