/**
 * LLMBenchmark.ai (LLMBM) adapter.
 *
 * The public `GET /v1/scores?metric=...` endpoint is a dead path for this
 * project: it answers 422 without a metric and `[]` for every metric tried
 * (verified 2026-10-25). The full dataset is served instead by
 * `GET /v1/export` (~8.3 MB): `{dataset: {models, scores, ...}, ...}` where
 * each score row is `{modelId, source, metric, value, unit, observedAt,
 * sourceUrl, setting}`.
 *
 * One export pass yields rows for every metric in `k_llbmMetricByBenchmark`
 * (Adjustment 22: `aa_coding_index` -> `llbmCoding`, `aa_intelligence_index`
 * -> `llbmIntelligence`), normalized to domain `ModelBenchmark` entries:
 * - unit "points" values must already lie in 0-100;
 * - unit "ratio" values are scaled x100 (two decimals) so every score shares
 *   the "percent" score unit;
 * - other units are skipped with a warning;
 * - duplicate rows for one model and metric keep the maximum score with a
 *   warning.
 *
 * The parse fails only when no metric yields a row; a single empty metric is
 * a normal partial dataset (its column shows `—`). Cache/TTL ownership stays
 * with the mosp service; this adapter never touches the filesystem.
 * Error text never includes URLs or payloads.
 */

import {
  f_isFiniteNumber,
  f_isRecord,
  f_parseNonEmptyString,
  f_parseNullableHttpUrl,
  f_parseNullableTimestamp,
} from "../domain/guards";
import {
  k_benchmarkIds,
  k_llbmMetricByBenchmark,
  type BenchmarkId,
  type ModelBenchmark,
} from "../domain/model-benchmark";
import {
  f_adapterFail,
  f_adapterOk,
  type AdapterResult,
  type AdapterWarning,
} from "./adapter-result";
import { f_fetchJsonWithRetry, type FetchLike } from "../utils/fetch-json";

/** Full-dataset export endpoint (the scores query endpoint is unusable). */
export const k_llbmExportUrl = "https://api.llmbenchmark.ai/v1/export";

/** Minimum request budget; the export payload is several megabytes. */
const k_minTimeoutMs = 30_000;

/** Reverse lookup: export metric name -> benchmark id. */
const k_benchmarkByMetric = new Map<string, BenchmarkId>(
  k_benchmarkIds.map((p_id) => [k_llbmMetricByBenchmark[p_id], p_id] as const),
);

interface ScoredRow {
  readonly benchmarkId: BenchmarkId;
  readonly modelId: string;
  readonly score: number;
  readonly sourceUrl: string | null;
  readonly evaluatedAt: string | null;
}

function fh_validateSourceUrl(p_value: unknown): string | null {
  const vl_result = f_parseNullableHttpUrl(p_value, "score.sourceUrl");
  return vl_result.ok ? vl_result.value : null;
}

function fh_validateObservedAt(p_value: unknown): string | null {
  const vl_result = f_parseNullableTimestamp(p_value, "score.observedAt");
  return vl_result.ok ? vl_result.value : null;
}

/**
 * Normalize a raw `value` to a 0-100 percent score. Returns `null` (with a
 * warning) for unusable rows.
 */
function fh_normalizeValue(
  p_unit: unknown,
  p_value: number,
  p_modelId: string,
  p_warnings: AdapterWarning[],
): number | null {
  let vl_percent: number;

  if (p_unit === "points") {
    vl_percent = p_value;
  } else if (p_unit === "ratio") {
    vl_percent = Math.round(p_value * 10000) / 100;
  } else {
    p_warnings.push({
      code: "unsupported-unit",
      message: `score for ${p_modelId} uses unit "${String(p_unit)}" and was skipped`,
    });
    return null;
  }

  if (vl_percent < 0 || vl_percent > 100) {
    p_warnings.push({
      code: "score-out-of-range",
      message: `score for ${p_modelId} is outside 0-100 and was skipped`,
    });
    return null;
  }

  return vl_percent;
}

function fh_compareRows(p_left: ScoredRow, p_right: ScoredRow): number {
  const vl_byBenchmark =
    k_benchmarkIds.indexOf(p_left.benchmarkId) - k_benchmarkIds.indexOf(p_right.benchmarkId);

  if (vl_byBenchmark !== 0) {
    return vl_byBenchmark;
  }

  return p_left.modelId < p_right.modelId ? -1 : p_left.modelId > p_right.modelId ? 1 : 0;
}

/**
 * Pure parser for the `/v1/export` payload. Rows for every supported metric
 * are kept; per model and metric the maximum score wins. Rows are returned
 * sorted by benchmark id, then source model ID, for deterministic caches.
 */
export function f_parseLlbmExport(p_payload: unknown): AdapterResult<readonly ModelBenchmark[]> {
  if (!f_isRecord(p_payload)) {
    return f_adapterFail("LLMBM export payload is not an object");
  }

  if (!f_isRecord(p_payload.dataset)) {
    return f_adapterFail("LLMBM export is missing its dataset object");
  }

  if (!Array.isArray(p_payload.dataset.scores)) {
    return f_adapterFail("LLMBM export dataset has no scores array");
  }

  const vl_warnings: AdapterWarning[] = [];
  const vl_best = new Map<string, ScoredRow>();

  for (const vl_raw of p_payload.dataset.scores as readonly unknown[]) {
    if (!f_isRecord(vl_raw) || typeof vl_raw.metric !== "string") {
      continue;
    }

    const vl_benchmarkId = k_benchmarkByMetric.get(vl_raw.metric);

    if (vl_benchmarkId === undefined) {
      continue;
    }

    const vl_modelResult = f_parseNonEmptyString(vl_raw.modelId, "score.modelId");

    if (!vl_modelResult.ok) {
      vl_warnings.push({
        code: "malformed-score-row",
        message: "score row is missing a model id and was skipped",
      });
      continue;
    }

    const vl_modelId = vl_modelResult.value;

    if (!f_isFiniteNumber(vl_raw.value)) {
      vl_warnings.push({
        code: "malformed-score-row",
        message: `score for ${vl_modelId} is not a number and was skipped`,
      });
      continue;
    }

    const vl_score = fh_normalizeValue(vl_raw.unit, vl_raw.value, vl_modelId, vl_warnings);

    if (vl_score === null) {
      continue;
    }

    const vl_key = `${vl_benchmarkId}|${vl_modelId}`;
    const vl_existing = vl_best.get(vl_key);

    if (vl_existing !== undefined) {
      vl_warnings.push({
        code: "duplicate-score-row",
        message: `${vl_modelId} has several ${vl_raw.metric} rows; keeping the highest score`,
      });

      if (vl_score <= vl_existing.score) {
        continue;
      }
    }

    vl_best.set(vl_key, {
      benchmarkId: vl_benchmarkId,
      modelId: vl_modelId,
      score: vl_score,
      sourceUrl: fh_validateSourceUrl(vl_raw.sourceUrl),
      evaluatedAt: fh_validateObservedAt(vl_raw.observedAt),
    });
  }

  if (vl_best.size === 0) {
    return f_adapterFail("LLMBM returned no score rows for any supported metric", vl_warnings);
  }

  const vl_rows: ModelBenchmark[] = [...vl_best.values()].sort(fh_compareRows).map((p_entry) => ({
    benchmarkId: p_entry.benchmarkId,
    variant: `llbm-${k_llbmMetricByBenchmark[p_entry.benchmarkId]}`,
    score: p_entry.score,
    scoreUnit: "percent" as const,
    sampleCount: null,
    windowStart: null,
    windowEnd: null,
    sourceModelId: p_entry.modelId,
    matchType: null,
    sourceUrl: p_entry.sourceUrl,
    evaluatedAt: p_entry.evaluatedAt,
  }));

  return f_adapterOk(vl_rows, vl_warnings);
}

export interface LlbmFetchOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: FetchLike;
  readonly maxAttempts?: number;
}

/** Fetch the full export and parse every supported metric into rows. */
export async function f_fetchLlbmBenchmarks(
  p_options: LlbmFetchOptions,
): Promise<AdapterResult<readonly ModelBenchmark[]>> {
  try {
    const vl_payload = await f_fetchJsonWithRetry(k_llbmExportUrl, {
      timeoutMs: Math.max(k_minTimeoutMs, p_options.timeoutMs),
      ...(p_options.signal === undefined ? {} : { signal: p_options.signal }),
      ...(p_options.fetchImpl === undefined ? {} : { fetchImpl: p_options.fetchImpl }),
      ...(p_options.maxAttempts === undefined ? {} : { maxAttempts: p_options.maxAttempts }),
    });

    return f_parseLlbmExport(vl_payload);
  } catch (p_error) {
    return f_adapterFail(p_error instanceof Error ? p_error.message : "LLMBM request failed");
  }
}
