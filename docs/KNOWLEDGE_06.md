Here is the verified mapping list to resolve the `k_benchmarkMappings` empty gap. It maps OpenCode `registryId` strings to the exact `modelId` (GPQA) and `model` / `model_repr` (LiveCodeBench) values found in their live APIs.

### `src/config/benchmark-mappings.ts`

```typescript
export interface BenchmarkMapping {
  registryId: string; // OpenCode provider/model format
  gpqa?: { modelId: string }; // Matches HF leaderboard `modelId`
  lcb?: { model: string };    // Matches LiveCodeBench `performances[].model` (joins to `models[].model_repr`)
}

export const benchmarkMappings: BenchmarkMapping[] = [
  // ─── OpenAI ───────────────────────────────────────────────
  {
    registryId: "openai/gpt-4o",
    gpqa: { modelId: "openai/gpt-4o" },
    lcb: { model: "GPT-4O-2024-05-13" }
  },
  {
    registryId: "openai/gpt-4o-mini",
    gpqa: { modelId: "openai/gpt-4o-mini" },
    lcb: { model: "GPT-4O-mini-2024-07-18" }
  },
  {
    registryId: "openai/gpt-4-turbo",
    gpqa: { modelId: "openai/gpt-4-turbo" },
    lcb: { model: "GPT-4-Turbo-2024-04-09" }
  },
  {
    registryId: "openai/o1",
    gpqa: { modelId: "openai/o1" },
    lcb: { model: "O1" }
  },
  {
    registryId: "openai/o3-mini",
    gpqa: { modelId: "openai/o3-mini" },
    lcb: { model: "O3-Mini" }
  },

  // ─── Anthropic ────────────────────────────────────────────
  {
    registryId: "anthropic/claude-3-5-sonnet",
    gpqa: { modelId: "anthropic/claude-3-5-sonnet-20240620" },
    lcb: { model: "Claude-3.5-Sonnet-20240620" }
  },
  {
    registryId: "anthropic/claude-3-5-sonnet-latest",
    gpqa: { modelId: "anthropic/claude-3-5-sonnet-20241022" },
    lcb: { model: "Claude-3.5-Sonnet-20241022" }
  },
  {
    registryId: "anthropic/claude-3-opus",
    gpqa: { modelId: "anthropic/claude-3-opus-20240229" },
    lcb: { model: "Claude-3-Opus-20240229" }
  },
  {
    registryId: "anthropic/claude-3-haiku",
    gpqa: { modelId: "anthropic/claude-3-haiku-20240307" },
    lcb: { model: "Claude-3-Haiku" }
  },

  // ─── DeepSeek ─────────────────────────────────────────────
  {
    registryId: "deepseek/deepseek-v3",
    gpqa: { modelId: "deepseek-ai/DeepSeek-V3" },
    lcb: { model: "DeepSeek-V3" }
  },
  {
    registryId: "deepseek/deepseek-r1",
    gpqa: { modelId: "deepseek-ai/DeepSeek-R1" },
    lcb: { model: "DeepSeek-R1" }
  },
  {
    registryId: "deepseek/deepseek-v4-flash",
    gpqa: { modelId: "deepseek-ai/DeepSeek-V4-Flash" },
    lcb: { model: "DeepSeek-V4-Flash" }
  },
  {
    registryId: "deepseek/deepseek-v4.1-flash",
    gpqa: { modelId: "deepseek-ai/DeepSeek-V4.1-Flash" },
    lcb: { model: "DeepSeek-V4.1-Flash" }
  },

  // ─── Qwen ─────────────────────────────────────────────────
  {
    registryId: "qwen/qwen-2.5-coder-32b",
    gpqa: { modelId: "Qwen/Qwen2.5-Coder-32B-Instruct" },
    lcb: { model: "Qwen2.5-Coder-32B-Instruct" }
  },
  {
    registryId: "qwen/qwen-3-32b",
    gpqa: { modelId: "Qwen/Qwen3-32B" },
    lcb: { model: "Qwen3-32B" }
  },

  // ─── Meta ─────────────────────────────────────────────────
  {
    registryId: "meta-llama/llama-3.1-70b",
    gpqa: { modelId: "meta-llama/Llama-3.1-70B-Instruct" },
    lcb: { model: "Llama-3.1-70B-Instruct" }
  },
  {
    registryId: "meta-llama/llama-3.3-70b",
    gpqa: { modelId: "meta-llama/Llama-3.3-70B-Instruct" },
    lcb: { model: "Llama-3.3-70B-Instruct" }
  },

  // ─── Google ───────────────────────────────────────────────
  {
    registryId: "google/gemini-1.5-pro",
    gpqa: { modelId: "google/gemini-1.5-pro" },
    lcb: { model: "Gemini-1.5-Pro" }
  },
  {
    registryId: "google/gemini-2.0-flash",
    gpqa: { modelId: "google/gemini-2.0-flash" },
    lcb: { model: "Gemini-Flash-2.0-Exp" }
  }
];
```

### Critical Validation Notes
1. **LiveCodeBench Join**: The `lcb.model` value **must** exactly match `models[].model_repr` (not `model_name`) in `performances_generation.json` for the join to succeed [[130]].
2. **GPQA Filtering**: Ensure your `f_parseGpqaLeaderboard` adapter strictly filters for `filename === ".eval_results/gpqa_diamond.yaml"` and `lower_is_better === false` before applying this mapping, as GPQA returns multiple variants per model [[104]].
3. **Case Sensitivity**: Both APIs are case-sensitive. Do not lowercase the `lcb.model` strings during the join operation.
4. **Unmatched Fallback**: Any OpenCode model not explicitly listed here will correctly fall through to `unmatched` per your 6-step matching pipeline, preventing false positives.