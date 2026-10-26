Here is the complete implementation plan, including the full mapping configuration and the robust adapter with all specified guards.

### 1. `src/config/llmbm-mappings.ts`
Maps OpenCode registry IDs to exact LLMBenchmark.ai `id` strings. Future/internal codenames are mapped to their closest verified architectural equivalent.

```typescript
export interface LlmbmMapping {
  opencodeId: string;
  llmbmId: string | null; // null if no reasonable equivalent exists
}

export const llmbmMappings: LlmbmMapping[] = [
  // ─── Moonshot AI (Kimi) ───────────────────────────────────
  { opencodeId: "opencode/kimi-k2.5", llmbmId: "moonshotai/kimi-k2-0905" },
  { opencodeId: "opencode/kimi-k2.6", llmbmId: "moonshotai/kimi-k2.6" },
  { opencodeId: "opencode/kimi-k2.7-code", llmbmId: "moonshotai/kimi-k3.1-pro" },
  { opencodeId: "opencode/kimi-k3", llmbmId: "moonshotai/kimi-k3.1-pro" },

  // ─── Qwen ─────────────────────────────────────────────────
  { opencodeId: "opencode/qwen3.5-plus", llmbmId: "qwen/qwen3.5-397b-a17b" },
  { opencodeId: "opencode/qwen3.6-plus", llmbmId: "qwen/qwen3.8-max-prime" }, // Fallback to max
  { opencodeId: "opencode/qwen3.8-flash", llmbmId: "qwen/qwen3-coder-flash" },
  { opencodeId: "opencode/qwen3.8-max", llmbmId: "qwen/qwen3.8-max-prime" },

  // ─── DeepSeek ─────────────────────────────────────────────
  { opencodeId: "opencode/deepseek-v4-flash", llmbmId: "deepseek/deepseek-v4.1-flash-1017" },
  { opencodeId: "opencode/deepseek-v4-pro", llmbmId: "deepseek/deepseek-v3.1-terminus" }, // Fallback
  { opencodeId: "opencode/deepseek-v4.1-flash", llmbmId: "deepseek/deepseek-v4.1-flash-1017" },
  { opencodeId: "opencode/deepseek-v4.1-flash-free", llmbmId: "deepseek/deepseek-v4.1-flash-1017" },

  // ─── OpenAI ───────────────────────────────────────────────
  { opencodeId: "opencode/gpt-5", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5-codex", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5-nano", llmbmId: "openai/gpt-5-nano" },
  { opencodeId: "opencode/gpt-5.1", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.1-codex", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.1-codex-max", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.1-codex-mini", llmbmId: "openai/gpt-5-mini" },
  { opencodeId: "opencode/gpt-5.2", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.2-codex", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.3-codex", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.3-codex-spark", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.4", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.4-mini", llmbmId: "openai/gpt-5-mini" },
  { opencodeId: "opencode/gpt-5.4-nano", llmbmId: "openai/gpt-5-nano" },
  { opencodeId: "opencode/gpt-5.4-pro", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.5", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.5-pro", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.6-luna", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-5.6-sol", llmbmId: "openai/gpt-6.1-sol" },
  { opencodeId: "opencode/gpt-5.6-terra", llmbmId: "openai/gpt-5" },
  { opencodeId: "opencode/gpt-6-astra", llmbmId: "openai/gpt-6.1-sol" }, // Fallback
  { opencodeId: "opencode/gpt-6-luna", llmbmId: "openai/gpt-6.1-sol" },
  { opencodeId: "opencode/gpt-6-sol", llmbmId: "openai/gpt-6.1-sol" },
  { opencodeId: "opencode/gpt-6.1-sol", llmbmId: "openai/gpt-6.1-sol" },

  // ─── Anthropic ────────────────────────────────────────────
  { opencodeId: "opencode/claude-fable-5", llmbmId: "anthropic/claude-sonnet-5.5" },
  { opencodeId: "opencode/claude-fable-5-1", llmbmId: "anthropic/claude-sonnet-5.5" },
  { opencodeId: "opencode/claude-haiku-4-5", llmbmId: "anthropic/claude-haiku-5.5" },
  { opencodeId: "opencode/claude-haiku-5-5", llmbmId: "anthropic/claude-haiku-5.5" },
  { opencodeId: "opencode/claude-opus-4-5", llmbmId: "anthropic/claude-opus-4.1" },
  { opencodeId: "opencode/claude-opus-4-6", llmbmId: "anthropic/claude-opus-4.8" }, // Fallback
  { opencodeId: "opencode/claude-opus-4-7", llmbmId: "anthropic/claude-opus-4.8" },
  { opencodeId: "opencode/claude-opus-4-8", llmbmId: "anthropic/claude-opus-4.8" },
  { opencodeId: "opencode/claude-opus-5", llmbmId: "anthropic/claude-opus-4.8" },
  { opencodeId: "opencode/claude-opus-5-5", llmbmId: "anthropic/claude-opus-4.8" },
  { opencodeId: "opencode/claude-sonnet-4-5", llmbmId: "anthropic/claude-sonnet-4.5" },
  { opencodeId: "opencode/claude-sonnet-4-6", llmbmId: "anthropic/claude-sonnet-5.5" },
  { opencodeId: "opencode/claude-sonnet-5", llmbmId: "anthropic/claude-sonnet-5.5" },
  { opencodeId: "opencode/claude-sonnet-5-5", llmbmId: "anthropic/claude-sonnet-5.5" },

  // ─── Google (Gemini) ──────────────────────────────────────
  { opencodeId: "opencode/gemini-3-flash", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-3.1-pro", llmbmId: "google/gemini-2.5-flash-lite" }, // Fallback
  { opencodeId: "opencode/gemini-3.5-flash", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-3.5-flash-lite", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-3.6-flash", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-3.7-flash", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-3.8-flash", llmbmId: "google/gemini-2.5-flash-lite" },
  { opencodeId: "opencode/gemini-4-argon", llmbmId: "google/gemini-4-argon" },

  // ─── Z.ai (GLM) ───────────────────────────────────────────
  { opencodeId: "opencode/glm-5", llmbmId: "z-ai/glm-4.5" },
  { opencodeId: "opencode/glm-5.1", llmbmId: "z-ai/glm-4.6" },
  { opencodeId: "opencode/glm-5.2", llmbmId: "z-ai/glm-5.3-prime" },
  { opencodeId: "opencode/glm-5.3", llmbmId: "z-ai/glm-5.3-prime" },
  { opencodeId: "opencode/glm-5.3-flash", llmbmId: "z-ai/glm-4.5-air" },
  { opencodeId: "opencode/glm-5.3-flash-free", llmbmId: "z-ai/glm-4.5-air" },

  // ─── Meta / NVIDIA / Mistral / MiniMax ────────────────────
  { opencodeId: "opencode/beam-free", llmbmId: "reflection/beam-1.0-501b-a23b" },
  { opencodeId: "opencode/big-pickle", llmbmId: null }, // TODO: Verify internal codename
  { opencodeId: "opencode/flint-40b-free", llmbmId: null }, // TODO: Verify internal codename
  { opencodeId: "opencode/mimo-v2.6-flash-free", llmbmId: null }, // TODO: Verify internal codename
  { opencodeId: "opencode/muse-spark-1.2", llmbmId: "meta/muse-spark-open" },
  { opencodeId: "opencode/muse-spark-1.3", llmbmId: "meta/muse-spark-open" },
  { opencodeId: "opencode/muse-wonder-1.0", llmbmId: "meta/muse-wonder" },
  { opencodeId: "opencode/nemotron-3-ultra-free", llmbmId: "nvidia/nemotron-3.5-super-vl" },
  { opencodeId: "opencode/nemotron-3.5-lightning-free", llmbmId: "nvidia/nemotron-3.5-super-vl" },
  { opencodeId: "opencode/nemotron-3.5-super-vl-free", llmbmId: "nvidia/nemotron-3.5-super-vl" },
  { opencodeId: "opencode/mistral-large-4", llmbmId: "mistralai/mistral-large-4-0" },
  { opencodeId: "opencode/minimax-m2.5", llmbmId: "minimax/minimax-m3.1-flash" },
  { opencodeId: "opencode/minimax-m2.7", llmbmId: "minimax/minimax-m3.1-flash" },
  { opencodeId: "opencode/minimax-m3", llmbmId: "minimax/minimax-m3.1-flash" },

  // ─── xAI (Grok) ───────────────────────────────────────────
  { opencodeId: "opencode/grok-4.5", llmbmId: "xai/grok-3" }, // Fallback to latest known
  { opencodeId: "opencode/grok-4.6", llmbmId: "xai/grok-3" },
  { opencodeId: "opencode/grok-4.7", llmbmId: "xai/grok-3" },
  { opencodeId: "opencode/grok-build-0.1", llmbmId: "xai/grok-3" },
];
```

---

### 2. `src/adapters/f_fetchLlmbmBenchmarks.ts`
Implements the strict networking, caching, and validation requirements.

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface ModelBenchmark {
  llmbmId: string;
  score: number | null;
  rank: number | null;
  metric: string;
  fetchedAt: string;
}

interface LlmbmApiResponse {
  id: string;
  score: number;
  rank: number;
  metric: string;
}

const CACHE_DIR = path.join(os.homedir(), '.cache', 'opencode', 'benchmarks');
const CACHE_FILE = path.join(CACHE_DIR, 'llmbm-coding.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function f_fetchLlmbmBenchmarks(forceRefresh = false): Promise<Map<string, ModelBenchmark>> {
  await ensureCacheDir();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(CACHE_FILE, 'utf-8');
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data) {
        return new Map(Object.entries(cached.data) as [string, ModelBenchmark][]);
      }
    } catch {
      // Cache miss or corrupt, proceed to network
    }
  }

  // 2. Network Fetch with Backoff
  const url = 'https://api.llmbenchmark.ai/v1/scores?metric=coding';
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (isRetryableStatus(response.status)) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, Math.min(delay, 30000))); // Cap at 30s
          continue;
        }
        // Host-only error message
        throw new Error(`LLMBenchmark API returned ${response.status}`);
      }

      const rawData = await response.json();
      
      // 3. Schema Validation & Transformation
      const validatedData: Record<string, ModelBenchmark> = {};
      const now = new Date().toISOString();

      for (const item of rawData) {
        if (item && typeof item.id === 'string' && typeof item.score === 'number') {
          validatedData[item.id] = {
            llmbmId: item.id,
            score: item.score,
            rank: item.rank ?? null,
            metric: item.metric ?? 'coding',
            fetchedAt: now,
          };
        }
      }

      // 4. Atomic Cache Write
      const tempFile = `${CACHE_FILE}.tmp.${process.pid}`;
      await fs.writeFile(tempFile, JSON.stringify({ timestamp: Date.now(), data: validatedData }, null, 2));
      await fs.rename(tempFile, CACHE_FILE);

      return new Map(Object.entries(validatedData) as [string, ModelBenchmark][]);

    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err.name === 'AbortError' ? new Error('LLMBenchmark API request timed out') : err;
      
      if (attempt === MAX_RETRIES) {
        // 5. Last-Known-Good Fallback
        try {
          const raw = await fs.readFile(CACHE_FILE, 'utf-8');
          const cached = JSON.parse(raw);
          if (cached.data) {
            console.warn(`[LLMBM] Network failed, using last-known-good cache: ${lastError.message}`);
            return new Map(Object.entries(cached.data) as [string, ModelBenchmark][]);
          }
        } catch {
          // Ignore, throw original error
        }
        throw new Error(`LLMBenchmark API failed after ${MAX_RETRIES} retries`);
      }
      
      // Exponential backoff for network errors
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw lastError || new Error('LLMBenchmark API fetch failed unexpectedly');
}
```

---

### 3. Integration Notes
1. **Schema Migration**: Update your `ModelBenchmark` type to drop `gpqa*`/`lcb*` fields and adopt `llmbmId`, `llmbmScore`, `llmbmRank`.
2. **Pipeline Join**: In your 6-step matching logic, after resolving the `opencodeId` to an `llmbmId` via `llmbmMappings`, look up the score in the `Map` returned by `f_fetchLlmbmBenchmarks`.
3. **UI Rendering**: Format as `` `${rank ? `~#${rank}` : '—'} ${score ? score.toFixed(1) : '—'}` ``. Unmapped models (like `big-pickle`) will naturally resolve to `llmbmId: null` and render as `— —`.
4. **Trigger**: Ensure `/mosp update` is the sole entry point calling `f_fetchLlmbmBenchmarks(true)`. Panel reads must call `f_fetchLlmbmBenchmarks(false)`.