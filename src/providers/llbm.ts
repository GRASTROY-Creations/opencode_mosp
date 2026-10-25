/**
 * LLMBenchmark.ai adapter.
 *
 * The public `GET /v1/scores?metric=...` endpoint is a dead path for this
 * project: it answers 422 without a metric and `[]` for every metric tried
 * (verified 2026-10-25). The full dataset is served instead by
 * `GET /v1/export` (~8.3 MB): `{dataset: {models, scores, ...}, ...}` where
 * each score row is `{modelId, source, metric, value, unit, observedAt,
 * sourceUrl, setting}`.
 *
 * Rows are filtered to one metric (default `aa_coding_index`, unit
 * "points", 0-100 scale) and normalized to domain `ModelBenchmark` entries:
 * - unit "ratio" values are scaled x100 (two decimals) so every score shares
 *   the "percent" score unit;
 * - other units are skipped with a warning;
 * - duplicate rows for one model keep the maximum score with a warning.
 *
 * Cache/TTL ownership stays with the model-overview service; this adapter
 * never touches the filesystem. Error text never includes URLs or payloads.
 */

import {
  f_isFiniteNumber,
  f_isRecord,
  f_parseNonEmptyString,
  f_parseNullableHttpUrl,
  f_parseNullableTimestamp,
} from "../domain/guards";
import type { ModelBenchmark } from "../domain/model-benchmark";
import {
  f_adapterFail,
  f_adapterOk,
  type AdapterResult,
  type AdapterWarning,
} from "./adapter-result";
import { f_fetchJsonWithRetry, type FetchLike } from "../utils/fetch-json";

/** Full-dataset export endpoint (the scores query endpoint is unusable). */
export const k_llbmExportUrl = "https://api.llmbenchmark.ai/v1/export";

/** Default metric: Artificial Analysis-style coding index, unit "points". */
export const k_llbmDefaultMetric = "aa_coding_index";

/** Environment override for the metric (Adjustment 20). */
export const k_llbmMetricEnv = "OPENCODE_LLM_BENCH_METRIC";

/** Minimum request budget; the export payload is several megabytes. */
const k_minTimeoutMs = 30_000;

/** Resolve the metric from the environment, falling back to the default. */
export function f_resolveLlbmMetric(
  p_env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const vl_raw = p_env[k_llbmMetricEnv];

  if (typeof vl_raw === "string") {
    const vl_trimmed = vl_raw.trim();

    if (vl_trimmed.length > 0) {
      return vl_trimmed;
    }
  }

  return k_llbmDefaultMetric;
}

interface ScoredRow {
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
 * Normalize a raw `value` for the requested metric to a 0-100 percent score.
 * Returns `null` (with an optional warning) for unusable rows.
 */
function fh_normalizeValue(
  p_unit: unknown,
  p_value: number,
  p_modelId: string,
  p_warnings: AdapterWarning[],
): number | null {
  if (p_unit === "points") {
    if (p_value < 0 || p_value > 100) {
      p_warnings.push({
        code: "score-out-of-range",
        message: `score for ${p_modelId} is outside 0-100 and was skipped`,
      });
      return null;
    }

    return p_value;
  }

  if (p_unit === "ratio") {
    const vl_percent = Math.round(p_value * 10000) / 100;

    if (vl_percent < 0 || vl_percent > 100) {
      p_warnings.push({
        code: "score-out-of-range",
        message: `score for ${p_modelId} is outside 0-100 and was skipped`,
      });
      return null;
    }

    return vl_percent;
  }

  p_warnings.push({
    code: "unsupported-unit",
    message: `score for ${p_modelId} uses unit "${String(p_unit)}" and was skipped`,
  });
  return null;
}

/**
 * Pure parser for the `/v1/export` payload. Only rows for `p_metric` are
 * kept; per model the maximum score wins (other settings produce warnings).
 * Rows are returned sorted by source model ID for deterministic caches.
 */
export function f_parseLlbmExport(
  p_payload: unknown,
  p_metric: string = k_llbmDefaultMetric,
): AdapterResult<readonly ModelBenchmark[]> {
  if (!f_isRecord(p_payload)) {
    return f_adapterFail("LLMB export payload is not an object");
  }

  if (!f_isRecord(p_payload.dataset)) {
    return f_adapterFail("LLMB export is missing its dataset object");
  }

  if (!Array.isArray(p_payload.dataset.scores)) {
    return f_adapterFail("LLMB export dataset has no scores array");
  }

  const vl_warnings: AdapterWarning[] = [];
  const vl_best = new Map<string, ScoredRow>();

  for (const vl_raw of p_payload.dataset.scores as readonly unknown[]) {
    if (!f_isRecord(vl_raw) || vl_raw.metric !== p_metric) {
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

    const vl_score = fh_normalizeValue(
      vl_raw.unit,
      vl_raw.value,
      vl_modelId,
      vl_warnings,
    );

    if (vl_score === null) {
      continue;
    }

    const vl_existing = vl_best.get(vl_modelId);

    if (vl_existing !== undefined) {
      vl_warnings.push({
        code: "duplicate-score-row",
        message: `${vl_modelId} has several ${p_metric} rows; keeping the highest score`,
      });

      if (vl_score <= vl_existing.score) {
        continue;
      }
    }

    vl_best.set(vl_modelId, {
      modelId: vl_modelId,
      score: vl_score,
      sourceUrl: fh_validateSourceUrl(vl_raw.sourceUrl),
      evaluatedAt: fh_validateObservedAt(vl_raw.observedAt),
    });
  }

  if (vl_best.size === 0) {
    return f_adapterFail(
      `LLMBM returned no score rows for metric ${p_metric}`,
      vl_warnings,
    );
  }

  const vl_rows: ModelBenchmark[] = [...vl_best.values()]
    .sort((p_left, p_right) =>
      p_left.modelId < p_right.modelId ? -1 : p_left.modelId > p_right.modelId ? 1 : 0,
    )
    .map((p_entry) => ({
      benchmarkId: "llbm" as const,
      variant: `llbm-${p_metric}`,
      score: p_entry.score,
      scoreUnit: "percent" as const,
      rank: null,
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
  readonly metric?: string;
  readonly fetchImpl?: FetchLike;
  readonly maxAttempts?: number;
}

/** Fetch the full export and parse one metric into benchmark rows. */
export async function f_fetchLlbmBenchmarks(
  p_options: LlbmFetchOptions,
): Promise<AdapterResult<readonly ModelBenchmark[]>> {
  const vl_metric = p_options.metric ?? f_resolveLlbmMetric();

  try {
    const vl_payload = await f_fetchJsonWithRetry(k_llbmExportUrl, {
      timeoutMs: Math.max(k_minTimeoutMs, p_options.timeoutMs),
      ...(p_options.signal === undefined ? {} : { signal: p_options.signal }),
      ...(p_options.fetchImpl === undefined
        ? {}
        : { fetchImpl: p_options.fetchImpl }),
      ...(p_options.maxAttempts === undefined
        ? {}
        : { maxAttempts: p_options.maxAttempts }),
    });

    return f_parseLlbmExport(vl_payload, vl_metric);
  } catch (p_error) {
    return f_adapterFail(
      p_error instanceof Error ? p_error.message : "LLMBM request failed",
    );
  }
}
