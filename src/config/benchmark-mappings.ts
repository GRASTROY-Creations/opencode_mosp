import type { BenchmarkId, BenchmarkMatchType } from "../domain/model-benchmark";

/**
 * Reviewed mapping from one benchmark source row to one registry model.
 *
 * This is the ONLY sanctioned way to tie benchmark rows whose source names do
 * not already resolve through exact/canonical/alias matching. Entries must use
 * the EXACT identifier strings as they appear in the verified live payloads
 * (for GPQA that includes the HuggingFace org prefix, e.g.
 * `moonshotai/Kimi-K2.6`); no implicit normalization happens at match time.
 */
export interface BenchmarkMapping {
  readonly benchmarkId: BenchmarkId;
  /** Exact identifier as it appears in the live source payload. */
  readonly sourceModelId: string;
  /** Full stable registry id, `<providerId>/<modelId>`. */
  readonly opencodeModelId: string;
  readonly matchType: BenchmarkMatchType;
  /** Why this mapping was accepted (owner review + date). */
  readonly reason: string;
}

/**
 * SEEDED 2026-10-25 from the owner directive ("we can now create test data for
 * all opencode models, new are available now"), limited to the rows that are
 * LIVE-VERIFIED against the datasets probed on 2026-10-25:
 * - GPQA Diamond publishes org-prefixed HuggingFace ids; two Kimi rows and one
 *   Qwen row correspond to enabled catalog models.
 * - `qwen3.5-plus` receives a `family_proxy` row: the evaluated HF model
 *   (`Qwen3.5-397B-A17B`) is a family sibling, so the cell renders with a `~`
 *   marker and is never presented as the registry model's own score.
 * - LiveCodeBench's dataset (verified 2026-10-25) ends at 2025-04-07 and has
 *   NO row for any current catalog model, so it has no seeded mappings.
 * - The KNOWLEDGE_04/KNOWLEDGE_06 candidate tables otherwise failed live
 *   verification (see docs/api/models-dev.md); future entries require the same
 *   exact-live-string review before being added here.
 */
export const k_benchmarkMappings: readonly BenchmarkMapping[] = [
  {
    benchmarkId: "gpqa",
    sourceModelId: "moonshotai/Kimi-K2.6",
    opencodeModelId: "opencode/kimi-k2.6",
    matchType: "alias",
    reason: "Owner directive 2026-10-25; live GPQA Diamond row moonshotai/Kimi-K2.6 verified 2026-10-25.",
  },
  {
    benchmarkId: "gpqa",
    sourceModelId: "moonshotai/Kimi-K2.5",
    opencodeModelId: "opencode/kimi-k2.5",
    matchType: "alias",
    reason: "Owner directive 2026-10-25; live GPQA Diamond row moonshotai/Kimi-K2.5 verified 2026-10-25.",
  },
  {
    benchmarkId: "gpqa",
    sourceModelId: "Qwen/Qwen3.5-397B-A17B",
    opencodeModelId: "opencode/qwen3.5-plus",
    matchType: "family_proxy",
    reason:
      "Owner directive 2026-10-25; family sibling row Qwen/Qwen3.5-397B-A17B verified 2026-10-25; rendered with ~ and never presented as this model's own score.",
  },
];
