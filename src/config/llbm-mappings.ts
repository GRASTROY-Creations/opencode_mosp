/**
 * Reviewed mapping from LLMBenchmark.ai source rows to registry models.
 *
 * `opencodeId` is the full stable registry id (`<providerId>/<modelId>`).
 * `llbmId` is the exact identifier as it appears in the LLMBenchmark.ai
 * `dataset.scores`/`dataset.models` data (`/v1/export`). `null` means no
 * verified equivalent exists (anonymized rebrand, unscored internal model,
 * or a source string that does not exist at all).
 *
 * One entry serves both LLMBM columns: the same `llbmId` is looked up for the
 * coding (`aa_coding_index`) and intelligence (`aa_intelligence_index`)
 * metrics, so a model shows whichever of the two the source has scored.
 *
 * `family_fallback` entries are sibling proxies (e.g. a `-free` or codex
 * variant pointing at its base model). They share the source row with the
 * `exact` owner via the Adjustment 21 sharing rule and render with a `~`
 * prefix; they must never be presented as the model's own score.
 *
 * State 2026-10-26 (live `/v1/export`, Adjustment 22): 82 entries, 80 with a
 * source id. Coding scored 47, intelligence scored 74 (every coding-scored
 * entry is also intelligence-scored), so 74 entries carry a value. PENDING (in `dataset.models`, no score in either metric):
 * `beam-free` (→ Reflection Beam 1.0), `gpt-5.4-pro`, `gpt-5.5-pro`,
 * `muse-wonder-1.0`, `qwen3.5-plus`, `qwen3.8-flash`; they attach
 * automatically once scored. Only `big-pickle` and `flint-40b-free` stay
 * `null` (no candidate in the dataset). Refresh what is auto-resolvable with
 * `bun run generate:mappings`; drift is checked by `bun run validate:mappings`
 * (PASS/PENDING/DRIFT).
 */

export interface LlbmMapping {
  readonly opencodeId: string;
  readonly llbmId: string | null;
  readonly matchType: "exact" | "family_fallback";
}

export const k_llbmMappings: readonly LlbmMapping[] = [
  { opencodeId: "opencode/beam-free", llbmId: "reflection/beam-1.0-501b-a23b", matchType: "family_fallback" },
  { opencodeId: "opencode/big-pickle", llbmId: null, matchType: "exact" },

  { opencodeId: "opencode/claude-fable-5", llbmId: "anthropic/claude-fable-5", matchType: "exact" },
  { opencodeId: "opencode/claude-fable-5-1", llbmId: "anthropic/claude-fable-5.1", matchType: "exact" },
  { opencodeId: "opencode/claude-haiku-4-5", llbmId: "anthropic/claude-haiku-4.5", matchType: "exact" },
  { opencodeId: "opencode/claude-haiku-5-5", llbmId: "anthropic/claude-haiku-5.5", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-5", llbmId: "anthropic/claude-opus-4.5", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-6", llbmId: "anthropic/claude-opus-4.6", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-7", llbmId: "anthropic/claude-opus-4.7", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-8", llbmId: "anthropic/claude-opus-4.8", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-5", llbmId: "anthropic/claude-opus-5", matchType: "exact" },
  { opencodeId: "opencode/claude-opus-5-5", llbmId: "anthropic/claude-opus-5.5", matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-4-5", llbmId: "anthropic/claude-sonnet-4.5", matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-4-6", llbmId: "anthropic/claude-sonnet-4.6", matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-5", llbmId: "anthropic/claude-sonnet-5", matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-5-5", llbmId: "anthropic/claude-sonnet-5.5", matchType: "exact" },

  { opencodeId: "opencode/deepseek-v4-flash", llbmId: "deepseek/deepseek-v4-flash", matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4-pro", llbmId: "deepseek/deepseek-v4-pro", matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4.1-flash", llbmId: "deepseek/deepseek-v4.1-flash", matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4.1-flash-free", llbmId: "deepseek/deepseek-v4.1-flash", matchType: "family_fallback" },

  { opencodeId: "opencode/flint-40b-free", llbmId: null, matchType: "exact" },

  { opencodeId: "opencode/gemini-3-flash", llbmId: "google/gemini-3-flash-preview", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.1-pro", llbmId: "google/gemini-3.1-pro-preview", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.5-flash", llbmId: "google/gemini-3.5-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.5-flash-lite", llbmId: "google/gemini-3.5-flash-lite", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.6-flash", llbmId: "google/gemini-3.6-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.7-flash", llbmId: "google/gemini-3.7-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.8-flash", llbmId: "google/gemini-3.8-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-4-argon", llbmId: "google/gemini-4-argon", matchType: "exact" },

  { opencodeId: "opencode/glm-5", llbmId: "z-ai/glm-5", matchType: "exact" },
  { opencodeId: "opencode/glm-5.1", llbmId: "z-ai/glm-5.1", matchType: "exact" },
  { opencodeId: "opencode/glm-5.2", llbmId: "z-ai/glm-5.2", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3", llbmId: "z-ai/glm-5.3", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3-flash", llbmId: "z-ai/glm-5.3-flash", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3-flash-free", llbmId: "z-ai/glm-5.3-flash", matchType: "family_fallback" },

  { opencodeId: "opencode/gpt-5", llbmId: "openai/gpt-5", matchType: "exact" },
  { opencodeId: "opencode/gpt-5-codex", llbmId: "openai/gpt-5", matchType: "family_fallback" },
  { opencodeId: "opencode/gpt-5-nano", llbmId: "openai/gpt-5-nano", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1", llbmId: "openai/gpt-5.1", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1-codex", llbmId: "openai/gpt-5.1-codex", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1-codex-max", llbmId: "openai/gpt-5.1-codex", matchType: "family_fallback" },
  { opencodeId: "opencode/gpt-5.1-codex-mini", llbmId: "openai/gpt-5.1-codex-mini", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.2", llbmId: "openai/gpt-5.2", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.2-codex", llbmId: "openai/gpt-5.2-codex", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.3-codex", llbmId: "openai/gpt-5.3-codex", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.3-codex-spark", llbmId: "openai/gpt-5.3-codex", matchType: "family_fallback" },
  { opencodeId: "opencode/gpt-5.4", llbmId: "openai/gpt-5.4", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4-mini", llbmId: "openai/gpt-5.4-mini", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4-nano", llbmId: "openai/gpt-5.4-nano", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4-pro", llbmId: "openai/gpt-5.4-pro", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.5", llbmId: "openai/gpt-5.5", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.5-pro", llbmId: "openai/gpt-5.5-pro", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-luna", llbmId: "openai/gpt-5.6-luna", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-sol", llbmId: "openai/gpt-5.6-sol", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-terra", llbmId: "openai/gpt-5.6-terra", matchType: "exact" },
  { opencodeId: "opencode/gpt-6-astra", llbmId: "openai/gpt-6-astra", matchType: "exact" },
  { opencodeId: "opencode/gpt-6-luna", llbmId: "openai/gpt-6-luna", matchType: "exact" },
  { opencodeId: "opencode/gpt-6-sol", llbmId: "openai/gpt-6-sol", matchType: "exact" },
  { opencodeId: "opencode/gpt-6.1-sol", llbmId: "openai/gpt-6.1-sol", matchType: "exact" },

  { opencodeId: "opencode/grok-4.5", llbmId: "x-ai/grok-4.5", matchType: "exact" },
  { opencodeId: "opencode/grok-4.6", llbmId: "x-ai/grok-4.6", matchType: "exact" },
  { opencodeId: "opencode/grok-4.7", llbmId: "x-ai/grok-4.7", matchType: "exact" },
  { opencodeId: "opencode/grok-build-0.1", llbmId: "x-ai/grok-build-0.1", matchType: "exact" },

  { opencodeId: "opencode/kimi-k2.5", llbmId: "moonshotai/kimi-k2.5", matchType: "exact" },
  { opencodeId: "opencode/kimi-k2.6", llbmId: "moonshotai/kimi-k2.6", matchType: "exact" },
  { opencodeId: "opencode/kimi-k2.7-code", llbmId: "moonshotai/kimi-k2.7-code", matchType: "exact" },
  { opencodeId: "opencode/kimi-k3", llbmId: "moonshotai/kimi-k3", matchType: "exact" },

  { opencodeId: "opencode/mimo-v2.6-flash-free", llbmId: "xiaomi/mimo-v2.6-flash", matchType: "family_fallback" },

  { opencodeId: "opencode/minimax-m2.5", llbmId: "minimax/minimax-m2.5", matchType: "exact" },
  { opencodeId: "opencode/minimax-m2.7", llbmId: "minimax/minimax-m2.7", matchType: "exact" },
  { opencodeId: "opencode/minimax-m3", llbmId: "minimax/minimax-m3", matchType: "exact" },

  { opencodeId: "opencode/mistral-large-4", llbmId: "mistralai/mistral-large-4-0", matchType: "exact" },

  { opencodeId: "opencode/muse-spark-1.2", llbmId: "meta/muse-spark-1.2", matchType: "exact" },
  { opencodeId: "opencode/muse-spark-1.3", llbmId: "meta/muse-spark-1.3", matchType: "exact" },
  { opencodeId: "opencode/muse-wonder-1.0", llbmId: "meta/muse-wonder", matchType: "exact" },

  { opencodeId: "opencode/nemotron-3-ultra-free", llbmId: "nvidia/nemotron-3-ultra-550b-a55b", matchType: "family_fallback" },
  { opencodeId: "opencode/nemotron-3.5-lightning-free", llbmId: "nvidia/nemotron-3.5-lightning", matchType: "family_fallback" },
  { opencodeId: "opencode/nemotron-3.5-super-vl-free", llbmId: "nvidia/nemotron-3.5-super-vl", matchType: "family_fallback" },

  { opencodeId: "opencode/qwen3.5-plus", llbmId: "qwen/qwen3.5-plus-20260420", matchType: "exact" },
  { opencodeId: "opencode/qwen3.6-plus", llbmId: "qwen/qwen3.6-plus", matchType: "exact" },
  { opencodeId: "opencode/qwen3.8-flash", llbmId: "qwen/qwen3.8-flash", matchType: "exact" },
  { opencodeId: "opencode/qwen3.8-max", llbmId: "qwen/qwen3.8-max-0902", matchType: "exact" },
];
