/**
 * Reviewed mapping from one LLMBM source row to one registry model.
 *
 * `opencodeId` is the full stable registry id (`<providerId>/<modelId>`).
 * `llbmId` is the exact identifier as it appears in the LLMBenchmark.ai API.
 * `null` means no reasonable equivalent exists in the LLMBM dataset.
 * `matchType` distinguishes exact matches from family/version fallbacks where
 * multiple opencode models share one LLMBM entry. Fallback entries render with
 * a `~` prefix and must never be presented as the model's own score.
 */
export interface LlbmMapping {
  readonly opencodeId: string;
  readonly llbmId: string | null;
  readonly matchType: "exact" | "family_fallback";
}

/**
 * Reviewed LLMBM mappings for the current opencode catalog (82 models).
 *
 * REGENERATED 2026-10-25 from the live `GET https://api.llmbenchmark.ai/v1/export`
 * scored set for metric `aa_coding_index` (114 scored models) via
 * `bun run generate:mappings` (`scripts/generate-mappings.ts`). Adoption
 * policy (owner-approved): exact tail-after-provider match, then case-insensitive
 * match, then `-free` variants falling back to the non-free sibling
 * (`family_fallback`). Everything else stays `null` and renders `—`.
 *
 * 37 of 82 catalog models matched. Known near-misses deliberately NOT adopted
 * pending owner policy: dot-vs-dash version names (catalog `claude-opus-4-8`
 * vs dataset `anthropic/claude-opus-4.8`), suffixed entries
 * (`gemini-3.1-pro` vs `google/gemini-3.1-pro-preview`; `qwen3.8-max` vs
 * `qwen/qwen3.8-max-0902`; `nemotron-3-ultra-free` vs
 * `nvidia/nemotron-3-ultra-550b-a55b`), and anonymized rebrands with no
 * external counterpart (`beam-free`, `big-pickle`, `flint-40b-free`,
 * `gpt-6-luna`, `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`).
 * Re-run `bun run validate:mappings` to detect source drift; re-run
 * `bun run generate:mappings` to refresh this table.
 */
export const k_llbmMappings: readonly LlbmMapping[] = [
  { opencodeId: "opencode/beam-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/big-pickle", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-fable-5", llbmId: "anthropic/claude-fable-5", matchType: "exact" },

  { opencodeId: "opencode/claude-fable-5-1", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-haiku-4-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-haiku-5-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-6", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-7", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-opus-4-8", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-opus-5", llbmId: "anthropic/claude-opus-5", matchType: "exact" },

  { opencodeId: "opencode/claude-opus-5-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-4-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-4-6", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/claude-sonnet-5", llbmId: "anthropic/claude-sonnet-5", matchType: "exact" },

  { opencodeId: "opencode/claude-sonnet-5-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4-flash", llbmId: "deepseek/deepseek-v4-flash", matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4-pro", llbmId: "deepseek/deepseek-v4-pro", matchType: "exact" },

  { opencodeId: "opencode/deepseek-v4.1-flash", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/deepseek-v4.1-flash-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/flint-40b-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gemini-3-flash", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gemini-3.1-pro", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gemini-3.5-flash", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gemini-3.5-flash-lite", llbmId: "google/gemini-3.5-flash-lite", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.6-flash", llbmId: "google/gemini-3.6-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.7-flash", llbmId: "google/gemini-3.7-flash", matchType: "exact" },
  { opencodeId: "opencode/gemini-3.8-flash", llbmId: "google/gemini-3.8-flash", matchType: "exact" },

  { opencodeId: "opencode/gemini-4-argon", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/glm-5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/glm-5.1", llbmId: "z-ai/glm-5.1", matchType: "exact" },
  { opencodeId: "opencode/glm-5.2", llbmId: "z-ai/glm-5.2", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3", llbmId: "z-ai/glm-5.3", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3-flash", llbmId: "z-ai/glm-5.3-flash", matchType: "exact" },
  { opencodeId: "opencode/glm-5.3-flash-free", llbmId: "z-ai/glm-5.3-flash", matchType: "family_fallback" },

  { opencodeId: "opencode/gpt-5", llbmId: "openai/gpt-5", matchType: "exact" },

  { opencodeId: "opencode/gpt-5-codex", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5-nano", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1", llbmId: "openai/gpt-5.1", matchType: "exact" },

  { opencodeId: "opencode/gpt-5.1-codex", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1-codex-max", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.1-codex-mini", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.2", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.2-codex", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.3-codex", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.3-codex-spark", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4", llbmId: "openai/gpt-5.4", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4-mini", llbmId: "openai/gpt-5.4-mini", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.4-nano", llbmId: "openai/gpt-5.4-nano", matchType: "exact" },

  { opencodeId: "opencode/gpt-5.4-pro", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.5", llbmId: "openai/gpt-5.5", matchType: "exact" },

  { opencodeId: "opencode/gpt-5.5-pro", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-luna", llbmId: "openai/gpt-5.6-luna", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-sol", llbmId: "openai/gpt-5.6-sol", matchType: "exact" },
  { opencodeId: "opencode/gpt-5.6-terra", llbmId: "openai/gpt-5.6-terra", matchType: "exact" },
  { opencodeId: "opencode/gpt-6-astra", llbmId: "openai/gpt-6-astra", matchType: "exact" },

  { opencodeId: "opencode/gpt-6-luna", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-6-sol", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/gpt-6.1-sol", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/grok-4.5", llbmId: "x-ai/grok-4.5", matchType: "exact" },
  { opencodeId: "opencode/grok-4.6", llbmId: "x-ai/grok-4.6", matchType: "exact" },

  { opencodeId: "opencode/grok-4.7", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/grok-build-0.1", llbmId: "x-ai/grok-build-0.1", matchType: "exact" },

  { opencodeId: "opencode/kimi-k2.5", llbmId: "moonshotai/kimi-k2.5", matchType: "exact" },
  { opencodeId: "opencode/kimi-k2.6", llbmId: "moonshotai/kimi-k2.6", matchType: "exact" },
  { opencodeId: "opencode/kimi-k2.7-code", llbmId: "moonshotai/kimi-k2.7-code", matchType: "exact" },
  { opencodeId: "opencode/kimi-k3", llbmId: "moonshotai/kimi-k3", matchType: "exact" },

  { opencodeId: "opencode/mimo-v2.6-flash-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/minimax-m2.5", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/minimax-m2.7", llbmId: "minimax/minimax-m2.7", matchType: "exact" },
  { opencodeId: "opencode/minimax-m3", llbmId: "minimax/minimax-m3", matchType: "exact" },

  { opencodeId: "opencode/mistral-large-4", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/muse-spark-1.2", llbmId: "meta/muse-spark-1.2", matchType: "exact" },
  { opencodeId: "opencode/muse-spark-1.3", llbmId: "meta/muse-spark-1.3", matchType: "exact" },

  { opencodeId: "opencode/muse-wonder-1.0", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/nemotron-3-ultra-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/nemotron-3.5-lightning-free", llbmId: "nvidia/nemotron-3.5-lightning", matchType: "family_fallback" },

  { opencodeId: "opencode/nemotron-3.5-super-vl-free", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/qwen3.5-plus", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/qwen3.6-plus", llbmId: "qwen/qwen3.6-plus", matchType: "exact" },

  { opencodeId: "opencode/qwen3.8-flash", llbmId: null, matchType: "exact" },
  { opencodeId: "opencode/qwen3.8-max", llbmId: null, matchType: "exact" },
];