# Mapping entries (`src/config/llbm-mappings.ts`)

```ts
// exact: the LLMBM id is this model (dot-form version per D-0022)
{ opencodeId: "opencode/claude-opus-4-8", llbmId: "anthropic/claude-opus-4.8", matchType: "exact" },

// family_fallback: the paid sibling's row is cloned and rendered "~score"
{ opencodeId: "opencode/glm-5.3-flash-free", llbmId: "z-ai/glm-5.3-flash", matchType: "family_fallback" },

// null: reviewed, no equivalent exists in the dataset
{ opencodeId: "opencode/big-pickle", llbmId: null, matchType: "exact" },

// PENDING (not a field — a validator state): id exists in dataset.models but
// has no score yet; attaches automatically once LLMBM scores it
{ opencodeId: "opencode/qwen3.8-flash", llbmId: "qwen/qwen3.8-flash", matchType: "exact" },
```

One entry feeds both columns. Check after editing:

```bash
bun run validate:mappings --skip-catalog
```

Expected tail: `OK 80 reviewed mappings: 74 PASS (coding 47, intelligence 74), 6 PENDING, 0 DRIFT`
(2026-10-26).
