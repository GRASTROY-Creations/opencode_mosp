/**
 * Normalized benchmark contract.
 *
 * The single benchmark source is LLMBM (LLMBenchmark.ai `/v1/export`). Two of
 * its metrics are shown side by side, each as its own benchmark id
 * (Adjustment 22):
 * - `llbmCoding`       — `aa_coding_index` (Artificial Analysis coding index);
 * - `llbmIntelligence` — `aa_intelligence_index` (Artificial Analysis
 *   intelligence index).
 *
 * Only the source's reported value is kept (0-100 percent scale). Ranks are
 * deliberately not derived: the overview shows metric values, not positions.
 *
 * A model without a result for a benchmark has **no entry** for it in the
 * record's `benchmarks` array. Do not insert an entry full of nulls, and never
 * use 0 as a stand-in for "not evaluated".
 */

import {
  f_fail,
  f_isRecord,
  f_ok,
  f_parseEnum,
  f_parseNonEmptyString,
  f_parseNullableHttpUrl,
  f_parseNullableNonNegativeInteger,
  f_parseNullableNonNegativeNumber,
  f_parseNullableString,
  f_parseNullableTimestamp,
  type DomainResult,
} from "./guards";

/** Supported benchmarks: one per displayed LLMBM metric. */
export type BenchmarkId = "llbmCoding" | "llbmIntelligence";

/** Runtime list in display order; used by parsers, sorting, and the UI. */
export const k_benchmarkIds: readonly BenchmarkId[] = [
  "llbmCoding",
  "llbmIntelligence",
];

/** LLMBM export metric backing each benchmark id. */
export const k_llbmMetricByBenchmark: Readonly<Record<BenchmarkId, string>> = {
  llbmCoding: "aa_coding_index",
  llbmIntelligence: "aa_intelligence_index",
};

/**
 * How a benchmark row relates to a registry model.
 *
 * `exact` describes the model itself; `family_fallback` describes a sibling
 * version/family entry used as a stand-in and must never be presented as the
 * model's own score (the UI marks those values with `~`).
 */
export type BenchmarkMatchType = "exact" | "family_fallback";

export const k_benchmarkMatchTypes: readonly BenchmarkMatchType[] = [
  "exact",
  "family_fallback",
];

function fh_parseNullableMatchType(
  p_value: unknown,
  p_field: string,
): DomainResult<BenchmarkMatchType | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }
  return f_parseEnum(p_value, k_benchmarkMatchTypes, p_field);
}

/** One normalized benchmark result for one model. */
export interface ModelBenchmark {
  readonly benchmarkId: BenchmarkId;
  /** Source subset/protocol identifier, e.g. `llbm-aa_coding_index`. */
  readonly variant: string;
  /** Reported score on a 0-100 percent scale; `null` if unavailable. */
  readonly score: number | null;
  readonly scoreUnit: "percent";
  /** Number of evaluated samples; `null` when the source does not report it. */
  readonly sampleCount: number | null;
  /** Start of the evaluation window (ISO-8601 UTC); `null` when not applicable. */
  readonly windowStart: string | null;
  /** End of the evaluation window (ISO-8601 UTC); `null` when not applicable. */
  readonly windowEnd: string | null;
  /** Raw identifier used by the benchmark source (matching/troubleshooting). */
  readonly sourceModelId: string | null;
  /**
   * How this row was tied to a registry model. Sources create rows with `null`;
   * the matcher assigns the kind on attach.
   */
  readonly matchType: BenchmarkMatchType | null;
  /** Public result page or data file; `null` if unavailable. */
  readonly sourceUrl: string | null;
  /** When the evaluation was published; `null` when the source omits it. */
  readonly evaluatedAt: string | null;
}

/**
 * Find a model's result for one benchmark. Returns `null` when the model has no
 * result - absence stays absence.
 */
export function f_findBenchmark(
  p_benchmarks: readonly ModelBenchmark[],
  p_benchmarkId: BenchmarkId,
): ModelBenchmark | null {
  const vl_match = p_benchmarks.find(
    (p_entry) => p_entry.benchmarkId === p_benchmarkId,
  );

  return vl_match ?? null;
}

/** Validate a normalized benchmark record produced by an adapter. */
export function f_validateModelBenchmark(
  p_value: unknown,
): DomainResult<ModelBenchmark> {
  if (!f_isRecord(p_value)) {
    return f_fail("benchmark must be an object");
  }

  const vl_benchmarkId = f_parseEnum(
    p_value.benchmarkId,
    k_benchmarkIds,
    "benchmark.benchmarkId",
  );

  if (!vl_benchmarkId.ok) {
    return vl_benchmarkId;
  }

  const vl_variant = f_parseNonEmptyString(
    p_value.variant,
    "benchmark.variant",
  );

  if (!vl_variant.ok) {
    return vl_variant;
  }

  if (p_value.scoreUnit !== "percent") {
    return f_fail('benchmark.scoreUnit must be "percent"');
  }

  const vl_score = fh_parseNullableScore(p_value.score, "benchmark.score");

  if (!vl_score.ok) {
    return vl_score;
  }

  const vl_sampleCount = f_parseNullableNonNegativeInteger(
    p_value.sampleCount,
    "benchmark.sampleCount",
  );

  if (!vl_sampleCount.ok) {
    return vl_sampleCount;
  }

  const vl_windowStart = f_parseNullableTimestamp(
    p_value.windowStart,
    "benchmark.windowStart",
  );

  if (!vl_windowStart.ok) {
    return vl_windowStart;
  }

  const vl_windowEnd = f_parseNullableTimestamp(
    p_value.windowEnd,
    "benchmark.windowEnd",
  );

  if (!vl_windowEnd.ok) {
    return vl_windowEnd;
  }

  if (
    vl_windowStart.value !== null &&
    vl_windowEnd.value !== null &&
    vl_windowStart.value > vl_windowEnd.value
  ) {
    return f_fail("benchmark.windowStart must not be after windowEnd");
  }

  const vl_sourceModelId = f_parseNullableString(
    p_value.sourceModelId,
    "benchmark.sourceModelId",
  );

  if (!vl_sourceModelId.ok) {
    return vl_sourceModelId;
  }

  const vl_matchType = fh_parseNullableMatchType(p_value.matchType, "benchmark.matchType");

  if (!vl_matchType.ok) {
    return vl_matchType;
  }

  const vl_sourceUrl = f_parseNullableHttpUrl(
    p_value.sourceUrl,
    "benchmark.sourceUrl",
  );

  if (!vl_sourceUrl.ok) {
    return vl_sourceUrl;
  }

  const vl_evaluatedAt = f_parseNullableTimestamp(
    p_value.evaluatedAt,
    "benchmark.evaluatedAt",
  );

  if (!vl_evaluatedAt.ok) {
    return vl_evaluatedAt;
  }

  return f_ok({
    benchmarkId: vl_benchmarkId.value,
    variant: vl_variant.value,
    score: vl_score.value,
    scoreUnit: "percent",
    sampleCount: vl_sampleCount.value,
    windowStart: vl_windowStart.value,
    windowEnd: vl_windowEnd.value,
    sourceModelId: vl_sourceModelId.value,
    matchType: vl_matchType.value,
    sourceUrl: vl_sourceUrl.value,
    evaluatedAt: vl_evaluatedAt.value,
  });
}

function fh_parseNullableScore(
  p_value: unknown,
  p_field: string,
): DomainResult<number | null> {
  const vl_number = f_parseNullableNonNegativeNumber(p_value, p_field);

  if (!vl_number.ok) {
    return vl_number;
  }

  if (vl_number.value !== null && vl_number.value > 100) {
    return f_fail(`${p_field} must be between 0 and 100`);
  }

  return vl_number;
}
