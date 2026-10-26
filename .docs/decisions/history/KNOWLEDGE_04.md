Here’s a TypeScript-ready mapping file you can save as `model-mapping.ts`. It preserves the OpenCode IDs, maps GPQA and LiveCodeBench model names, and marks proxy matches so you can distinguish exact matches from approximations.

Написание текста

typescript

```
// model-mapping.ts

export type MatchType =
  | "exact"
  | "alias"
  | "family_proxy"
  | "version_proxy"
  | "unmatched";

export interface ModelMapping {
  opencodeId: string;
  gpqaModelId: string | null;
  lcbModelId: string | null;
  gpqaMatchType: MatchType;
  lcbMatchType: MatchType;
}

export const modelMappings: ModelMapping[] = [
  {
    opencodeId: "kimi-k3",
    gpqaModelId: "Kimi K3",
    lcbModelId: "Kimi K3",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "glm-5.3",
    gpqaModelId: "GLM-5.3",
    lcbModelId: "GLM-5.3",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "glm-5.3-flash",
    gpqaModelId: "GLM 5.3 Flash",
    lcbModelId: "GLM 5.3 Flash",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "glm-5.2",
    gpqaModelId: "GLM-5.2",
    lcbModelId: "GLM-5.3",
    gpqaMatchType: "alias",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "glm-5.1",
    gpqaModelId: "GLM-5.1",
    lcbModelId: "GLM-5.2",
    gpqaMatchType: "alias",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "glm-5",
    gpqaModelId: "GLM-5",
    lcbModelId: "GLM-5",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "deepseek-v4-pro",
    gpqaModelId: "DeepSeek V4 Pro",
    lcbModelId: "DeepSeek V4 Pro",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "deepseek-v4.1-flash",
    gpqaModelId: "DeepSeek V4.1 Flash",
    lcbModelId: "DeepSeek V4 Flash",
    gpqaMatchType: "alias",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "qwen3.8-max",
    gpqaModelId: "Qwen3.8 Max",
    lcbModelId: "Qwen3.8 Max",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "qwen3.8-flash",
    gpqaModelId: "Qwen3.8 Flash",
    lcbModelId: "Qwen3.8 Flash-Next",
    gpqaMatchType: "alias",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "qwen3.6-plus",
    gpqaModelId: "Qwen3.6 Plus",
    lcbModelId: "Qwen3.6 Plus",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "qwen3.5-plus",
    gpqaModelId: "Qwen3.5-397B-A17B",
    lcbModelId: "Qwen3.5-397B",
    gpqaMatchType: "family_proxy",
    lcbMatchType: "family_proxy",
  },
  {
    opencodeId: "kimi-k2.7-code",
    gpqaModelId: "Kimi K2.6",
    lcbModelId: "Kimi K2.6",
    gpqaMatchType: "version_proxy",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "kimi-k2.6",
    gpqaModelId: "Kimi K2.6",
    lcbModelId: "Kimi K2.6",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "kimi-k2.5",
    gpqaModelId: "Kimi K2.5",
    lcbModelId: "Kimi K2.5",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "minimax-m3",
    gpqaModelId: "MiniMax M2.5",
    lcbModelId: "MiniMax M3",
    gpqaMatchType: "version_proxy",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "minimax-m2.7",
    gpqaModelId: "MiniMax M2.5",
    lcbModelId: "MiniMax M3",
    gpqaMatchType: "version_proxy",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "minimax-m2.5",
    gpqaModelId: "MiniMax M2.5",
    lcbModelId: "MiniMax M2.5",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "mistral-large-4",
    gpqaModelId: null,
    lcbModelId: null,
    gpqaMatchType: "unmatched",
    lcbMatchType: "unmatched",
  },
  {
    opencodeId: "gpt-6.1-sol",
    gpqaModelId: null,
    lcbModelId: "GPT-6.1 Sol Pro",
    gpqaMatchType: "unmatched",
    lcbMatchType: "family_proxy",
  },
  {
    opencodeId: "gpt-6-sol",
    gpqaModelId: null,
    lcbModelId: "GPT-6 Sol",
    gpqaMatchType: "unmatched",
    lcbMatchType: "family_proxy",
  },
  {
    opencodeId: "gpt-5.5",
    gpqaModelId: "GPT-5.4",
    lcbModelId: "GPT-5.6 Terra",
    gpqaMatchType: "version_proxy",
    lcbMatchType: "version_proxy",
  },
  {
    opencodeId: "gpt-5.4",
    gpqaModelId: "GPT-5.4",
    lcbModelId: "GPT-5.4",
    gpqaMatchType: "alias",
    lcbMatchType: "alias",
  },
  {
    opencodeId: "grok-4.5",
    gpqaModelId: "Grok 4",
    lcbModelId: "Grok 4.5",
    gpqaMatchType: "version_proxy",
    lcbMatchType: "alias",
  },
];

export const modelMappingByOpenCodeId: Record<
  string,
  ModelMapping
> = Object.fromEntries(
  modelMappings.map((mapping) => [mapping.opencodeId, mapping]),
);

export function getModelMapping(
  opencodeId: string,
): ModelMapping | undefined {
  return modelMappingByOpenCodeId[opencodeId];
}
```

## Usage

typescript

```
import {
  getModelMapping,
  modelMappings,
} from "./model-mapping";

const mapping = getModelMapping("kimi-k3");

console.log(mapping?.gpqaModelId);
console.log(mapping?.lcbModelId);

// Find models with no GPQA mapping
const missingGPQA = modelMappings.filter(
  (model) => model.gpqaModelId === null,
);
```

Important: The model names inherited from the earlier table are candidate identifiers, not verified exact IDs from the raw benchmark JSON. Before using these mappings to retrieve scores, validate the names against the live datasets. In particular, `version_proxy` and `family_proxy` entries should not be treated as the OpenCode model's own benchmark score.