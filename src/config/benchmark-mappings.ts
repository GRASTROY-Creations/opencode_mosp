import type { BenchmarkId, BenchmarkMatchType } from "../domain/model-benchmark";

/**
 * Reviewed mapping from one benchmark source row to one registry model.
 *
 * This is the ONLY sanctioned way to tie benchmark rows whose source names do
 * not already resolve through exact/canonical/alias matching. Entries must use
 * the EXACT identifier strings as they appear in the verified live payloads.
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
 * EMPTY BY DESIGN (validated 2026-10-25).
 *
 * The KNOWLEDGE_04.md candidate table was checked against the live sources and
 * attached NOTHING:
 * - only 3 of its 24 `opencodeId`s exist in the live registry (16 models, all
 *   provider `opencode`); the registry's anonymized ids (beam-free, big-pickle,
 *   flint-40b-free, gpt-6-luna, ...) need owner-supplied true identities;
 * - none of its `gpqaModelId` strings appear among the 25 live GPQA Diamond
 *   modelIds (live ids carry HF org prefixes, e.g. `moonshotai/Kimi-K2.6`);
 * - none of its `lcbModelId` strings appear among the 28 live LCB `model_repr`s.
 * The doc also carries a machine-generation artifact ("Написание текста"), the
 * same suspect provenance as the discarded KNOWLEDGE_01 draft.
 *
 * Add entries ONLY after the owner confirms real identities, e.g.:
 *   {
 *     benchmarkId: "gpqa",
 *     sourceModelId: "moonshotai/Kimi-K2.6",
 *     opencodeModelId: "opencode/kimi-k2.6",
 *     matchType: "alias",
 *     reason: "Owner confirmed 2026-10-XX: opencode/kimi-k2.6 is Kimi K2.6.",
 *   }
 */
export const k_benchmarkMappings: readonly BenchmarkMapping[] = [];
