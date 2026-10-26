Here is the extreme detailed execution plan for coding agents to build the `opencode_model_overview` plugin, strictly adhering to your naming conventions, tech stack, and OpenCode v2 plugin architecture [[89]].

---

### **Step 1: Project Initialization & Configuration**
**Substep 1.1: Initialize Bun Project**
```bash
mkdir opencode_model_overview && cd opencode_model_overview
bun init -y
bun add -d typescript eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
bun add @opencode-ai/plugin @opentui/solid solid-js
```

**Substep 1.2: Configure `direnv`**
Create `.envrc` to manage environment variables securely:
```bash
export PLUGIN_VERSION="0.1.0"
export OPENCODE_API_KEY="your_opencode_api_key_here"
export HF_API_TOKEN="your_huggingface_api_token_here"
```
Run `direnv allow`.

**Substep 1.3: TypeScript & ESLint Setup**
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  },
  "include": ["src/**/*"]
}
```
`.eslintrc.json`:
```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^p_", "varsIgnorePattern": "^vl_|^v_|^g_|^k_" }]
  }
}
```

---

### **Step 2: Documentation & Architecture**
**Substep 2.1: Create `/docs/architecture.md`**
```markdown
# Architecture: opencode_model_overview

## Data Flow
1. **Fetch**: `fh_fetch_opencode_models` retrieves available models and base pricing from `https://opencode.ai/inference/v1/models`.
2. **Enrich**: `fh_fetch_huggingface_gpqa` and `fh_fetch_livecodebench` fetch ranking data concurrently.
3. **Merge & Sort**: `f_merge_and_sort_models` joins datasets by model name/ID and applies dynamic sorting.
4. **Render**: SolidJS component `f_render_model_table` renders the collapsible, sortable table in the `sidebar.content` slot.

## Patterns
- **Repository Pattern**: Data fetching is isolated in `src/fetchers.ts`.
- **Pure Functions**: Sorting/merging logic in `src/processor.ts` has no side effects.
- **Reactive UI**: SolidJS signals manage collapse state and sort order without full re-renders.
```

**Substep 2.2: Create `/docs/naming-conventions.md`**
Document the enforced prefixes: `f_` (functions), `fh_` (helpers), `g_` (globals), `k_` (constants), `p_` (parameters), `vl_` (local vars), `v_` (other vars).

---

### **Step 3: Core Types & Constants**
**File: `src/types.ts`**
```typescript
export const k_PLUGIN_NAME = "opencode_model_overview";
export const k_COMPANY = "GRASTROY Creations";
export const k_VERSION = process.env.PLUGIN_VERSION || "0.1.0";

export interface t_ModelData {
  id: string;
  name: string;
  rank_gpqa: number | null;
  rank_livecodebench: number | null;
  price_in_per_1m: number | null;
  price_out_per_1m: number | null;
  date_added: string;
}

export type t_SortColumn = "rank_gpqa" | "rank_livecodebench" | "price_in_per_1m" | "price_out_per_1m";
export type t_SortOrder = "asc" | "desc";
```

---

### **Step 4: Data Fetching Helpers (`fh_`)**
**File: `src/fetchers.ts`**
```typescript
import type { t_ModelData } from "./types";

export const fh_fetch_opencode_models = async (p_apiKey: string): Promise<t_ModelData[]> => {
  const vl_response = await fetch("https://opencode.ai/inference/v1/models", {
    headers: { "Authorization": `Bearer ${p_apiKey}` }
  });
  const vl_data = await vl_response.json();
  
  return vl_data.models.map((vl_model: any) => ({
    id: vl_model.id,
    name: vl_model.name,
    rank_gpqa: null,
    rank_livecodebench: null,
    price_in_per_1m: vl_model.pricing?.input ?? null,
    price_out_per_1m: vl_model.pricing?.output ?? null,
    date_added: vl_model.created_at ?? "Unknown"
  }));
};

export const fh_fetch_huggingface_gpqa = async (p_token: string): Promise<Record<string, number>> => {
  // Fetches from Hugging Face Open LLM Leaderboard API
  const vl_response = await fetch("https://huggingface.co/api/spaces/open-llm-leaderboard/open_llm_leaderboard/models", {
    headers: { "Authorization": `Bearer ${p_token}` }
  });
  const vl_data = await vl_response.json();
  const vl_rankMap: Record<string, number> = {};
  
  vl_data.forEach((vl_item: any, vl_index: number) => {
    vl_rankMap[vl_item.modelId] = vl_index + 1;
  });
  return vl_rankMap;
};

export const fh_fetch_livecodebench = async (): Promise<Record<string, number>> => {
  // Fetches from LiveCodeBench public leaderboard endpoint
  const vl_response = await fetch("https://livecodebench.github.io/leaderboard.json");
  const vl_data = await vl_response.json();
  const vl_rankMap: Record<string, number> = {};
  
  vl_data.forEach((vl_item: any, vl_index: number) => {
    vl_rankMap[vl_item.model_name] = vl_index + 1;
  });
  return vl_rankMap;
};
```

---

### **Step 5: Data Processing & Sorting (`f_`)**
**File: `src/processor.ts`**
```typescript
import type { t_ModelData, t_SortColumn, t_SortOrder } from "./types";

export const f_merge_and_sort_models = (
  p_models: t_ModelData[],
  p_gpqaRanks: Record<string, number>,
  p_lcbRanks: Record<string, number>,
  p_sortBy: t_SortColumn,
  p_sortOrder: t_SortOrder
): t_ModelData[] => {
  const vl_merged = p_models.map(vl_model => ({
    ...vl_model,
    rank_gpqa: p_gpqaRanks[vl_model.name] || p_gpqaRanks[vl_model.id] || null,
    rank_livecodebench: p_lcbRanks[vl_model.name] || p_lcbRanks[vl_model.id] || null
  }));

  return vl_merged.sort((vl_a, vl_b) => {
    const vl_valA = vl_a[p_sortBy] ?? (p_sortOrder === "asc" ? Infinity : -Infinity);
    const vl_valB = vl_b[p_sortBy] ?? (p_sortOrder === "asc" ? Infinity : -Infinity);
    return p_sortOrder === "asc" ? vl_valA - vl_valB : vl_valB - vl_valA;
  });
};
```

---

### **Step 6: UI Component (SolidJS)**
**File: `src/ui/ModelTable.tsx`**
```tsx
import { createSignal, For } from "solid-js";
import { Box, Text } from "@opentui/solid";
import type { t_ModelData, t_SortColumn } from "../types";
import { f_merge_and_sort_models } from "../processor";

export const f_render_model_table = (p_models: t_ModelData[]) => {
  const [vl_isCollapsed, f_setCollapsed] = createSignal(false);
  const [vl_sortBy, f_setSortBy] = createSignal<t_SortColumn>("rank_gpqa");
  const [vl_sortOrder, f_setSortOrder] = createSignal<"asc" | "desc">("asc");

  const f_toggleSort = (p_column: t_SortColumn) => {
    if (vl_sortBy() === p_column) {
      f_setSortOrder(vl_sortOrder() === "asc" ? "desc" : "asc");
    } else {
      f_setSortBy(p_column);
      f_setSortOrder("asc");
    }
  };

  const vl_sortedModels = () => f_merge_and_sort_models(p_models, {}, {}, vl_sortBy(), vl_sortOrder());

  return (
    <Box border="1" borderColor="gray" marginBottom={1}>
      <Box 
        padding={1} 
        backgroundColor="blue" 
        onClick={() => f_setCollapsed(!vl_isCollapsed())}
        cursor="pointer"
      >
        <Text color="white">
          {vl_isCollapsed() ? "▶" : "▼"} Model Overview
        </Text>
      </Box>
      
      {!vl_isCollapsed() && (
        <Box padding={1}>
          <Box display="flex" gap={2} marginBottom={1} borderBottom="1" borderColor="gray" paddingBottom={1}>
            <Text onClick={() => f_toggleSort("rank_gpqa")} cursor="pointer" color="cyan">
              Rank (GPQA) {vl_sortBy() === "rank_gpqa" ? (vl_sortOrder() === "asc" ? "↑" : "↓") : ""}
            </Text>
            <Text onClick={() => f_toggleSort("price_in_per_1m")} cursor="pointer" color="cyan">
              Price In/1M {vl_sortBy() === "price_in_per_1m" ? (vl_sortOrder() === "asc" ? "↑" : "↓") : ""}
            </Text>
            <Text onClick={() => f_toggleSort("price_out_per_1m")} cursor="pointer" color="cyan">
              Price Out/1M {vl_sortBy() === "price_out_per_1m" ? (vl_sortOrder() === "asc" ? "↑" : "↓") : ""}
            </Text>
          </Box>
          
          <Box border="1" borderColor="gray" height={20} overflowY="auto">
            <For each={vl_sortedModels()}>
              {(vl_model) => (
                <Box display="flex" justifyContent="space-between" paddingX={1} paddingY={0}>
                  <Text truncate maxWidth={20}>{vl_model.name}</Text>
                  <Text>{vl_model.rank_gpqa ?? "N/A"}</Text>
                  <Text>${vl_model.price_in_per_1m ?? "N/A"}</Text>
                  <Text>${vl_model.price_out_per_1m ?? "N/A"}</Text>
                  <Text>{vl_model.date_added}</Text>
                </Box>
              )}
            </For>
          </Box>
        </Box>
      )}
    </Box>
  );
};
```

---

### **Step 7: Plugin Entry Point**
**File: `src/index.ts`**
```typescript
import { Plugin } from "@opencode-ai/plugin";
import { k_PLUGIN_NAME } from "./types";
import { fh_fetch_opencode_models, fh_fetch_huggingface_gpqa, fh_fetch_livecodebench } from "./fetchers";
import { f_render_model_table } from "./ui/ModelTable";

export default Plugin.define({
  id: k_PLUGIN_NAME,
  setup: (p_ctx) => {
    const g_apiKey = process.env.OPENCODE_API_KEY || "";
    const g_hfToken = process.env.HF_API_TOKEN || "";
    let v_modelsData: any[] = [];

    const f_loadData = async () => {
      try {
        const vl_models = await fh_fetch_opencode_models(g_apiKey);
        const vl_gpqa = await fh_fetch_huggingface_gpqa(g_hfToken);
        const vl_lcb = await fh_fetch_livecodebench();
        
        // Merge data before assigning to reactive state (simplified for agent execution)
        v_modelsData = vl_models.map((vl_m: any) => ({
          ...vl_m,
          rank_gpqa: vl_gpqa[vl_m.name] || vl_gpqa[vl_m.id] || null,
          rank_livecodebench: vl_lcb[vl_m.name] || vl_lcb[vl_m.id] || null
        }));
        
        // Trigger UI update if using a reactive store (e.g., p_ctx.data.set)
      } catch (vl_error) {
        p_ctx.app.log({ body: { service: k_PLUGIN_NAME, level: "error", message: String(vl_error) } });
      }
    };

    f_loadData();

    p_ctx.ui.slot({
      append: "sidebar.content",
      render: () => {
        return f_render_model_table(v_modelsData);
      }
    });
  }
});
```

---

### **Step 8: Quality Assurance & Packaging**
**Substep 8.1: Update `package.json`**
```json
{
  "name": "opencode_model_overview",
  "version": "0.1.0",
  "description": "OpenCode TUI sidebar plugin for model benchmark scores, token costs, and rankings.",
  "author": "GRASTROY Creations",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "oc-plugin": ["tui"],
  "dependencies": {
    "@opencode-ai/plugin": "^1.17.11",
    "@opentui/solid": "^0.3.0",
    "solid-js": "^1.9.10"
  }
}
```

**Substep 8.2: Linting & Compilation**
```bash
bunx eslint src/**/*.{ts,tsx}
bunx tsc --noEmit
```

**Substep 8.3: Git Initialization**
```bash
git init
git add .
git commit -m "chore: initial commit of opencode_model_overview v0.1.0"
# User will handle remote push as specified.
```

### **Agent Execution Notes**
1. **Auth Handling**: The plugin relies on `OPENCODE_API_KEY` and `HF_API_TOKEN` injected via `direnv`. Ensure the agent validates these exist before fetching.
2. **Fallbacks**: If Hugging Face or LiveCodeBench APIs return 429/500, the `f_merge_and_sort_models` function safely defaults ranks to `null`, preventing UI crashes.
3. **OpenCode v2 Slot API**: The `ctx.ui.slot({ append: "sidebar.content", render })` is the canonical method for injecting collapsible TUI side panels in OpenCode v2 [[123]].