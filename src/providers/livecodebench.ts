/**
 * LiveCodeBench generation-leaderboard adapter.
 *
 * The official page loads a single JSON snapshot and computes each model's
 * score as the arithmetic mean of `pass@1` over a date window. We reproduce
 * that algorithm and the page's default window:
 * - start mark index 15 when there are more than 12 date marks, otherwise 4;
 * - end mark is the last boundary.
 *
 * Scores are only meaningful with their window and sample count, so both are
 * attached to every normalized result. Models below the minimum sample guard
 * are omitted (never ranked on a handful of questions).
 */

import {
  f_fail,
  f_isFiniteNumber,
  f_isRecord,
  f_isPositiveInteger,
  f_ok,
  f_parseNonEmptyString,
  f_parseNullableHttpUrl,
  type DomainResult,
} from "../domain/guards";
import {
  k_livecodebenchVariant,
  type ModelBenchmark,
} from "../domain/model-benchmark";
import {
  f_adapterFail,
  f_adapterOk,
  type AdapterResult,
  type AdapterWarning,
} from "./adapter-result";
import {
  f_fetchJsonWithRetry,
  FetchJsonError,
  type FetchJsonRetryOptions,
} from "../utils/fetch-json";

/** Verified snapshot URL distributed by the official leaderboard page. */
export const k_liveCodeBenchDataUrl =
  "https://livecodebench.github.io/performances_generation.json";

/** Human-facing leaderboard, used as provenance fallback. */
export const k_liveCodeBenchLeaderboardUrl =
  "https://livecodebench.github.io/leaderboard.html";

/** The page recommends at least 100 problems; below that, scores are fragile. */
export const k_liveCodeBenchMinimumSamples = 100;

const k_longWindowThreshold = 12;
const k_longWindowStartIndex = 15;
const k_shortWindowStartIndex = 4;

export interface LiveCodeBenchWindow {
  readonly startEpochMs: number;
  readonly endEpochMs: number;
}

export interface LiveCodeBenchParseOptions {
  /** Minimum evaluated problems for a model to appear. Defaults to 100. */
  readonly minimumSamples?: number;
  /** Override the leaderboard's default window (must be epoch milliseconds). */
  readonly window?: LiveCodeBenchWindow;
}

/**
 * Reproduce the leaderboard's default window from `date_marks`.
 * The site uses index 15 (>12 marks) or 4 (short lists), ending at the last mark.
 */
export function f_deriveLiveCodeBenchWindow(
  p_dateMarks: unknown,
): DomainResult<LiveCodeBenchWindow> {
  if (!Array.isArray(p_dateMarks)) {
    return f_fail("LiveCodeBench date_marks must be an array");
  }

  const vl_marks: number[] = [];

  for (const vl_mark of p_dateMarks as readonly unknown[]) {
    if (!f_isFiniteNumber(vl_mark) || !Number.isInteger(vl_mark) || vl_mark < 0) {
      return f_fail("LiveCodeBench date_marks must contain epoch milliseconds");
    }

    vl_marks.push(vl_mark);
  }

  vl_marks.sort((p_left, p_right) => p_left - p_right);

  for (let vl_index = 1; vl_index < vl_marks.length; vl_index += 1) {
    if (vl_marks[vl_index] === vl_marks[vl_index - 1]) {
      return f_fail("LiveCodeBench date_marks contains duplicate boundaries");
    }
  }

  if (vl_marks.length < 5) {
    return f_fail("LiveCodeBench date_marks needs at least five boundaries");
  }

  const vl_startIndex = fh_resolveStartIndex(vl_marks.length);
  const vl_start = vl_marks[vl_startIndex];
  const vl_end = vl_marks[vl_marks.length - 1];

  if (vl_start === undefined || vl_end === undefined || vl_start >= vl_end) {
    return f_fail("LiveCodeBench default window is empty");
  }

  return f_ok({ startEpochMs: vl_start, endEpochMs: vl_end });
}

/** Normalize the snapshot into benchmark rows (one per model). */
export function f_parseLiveCodeBench(
  p_payload: unknown,
  p_options: LiveCodeBenchParseOptions = {},
): AdapterResult<readonly ModelBenchmark[]> {
  if (!f_isRecord(p_payload)) {
    return f_adapterFail("LiveCodeBench payload must be an object");
  }

  if (!Array.isArray(p_payload.performances)) {
    return f_adapterFail("LiveCodeBench performances must be an array");
  }

  if (!Array.isArray(p_payload.models)) {
    return f_adapterFail("LiveCodeBench models must be an array");
  }

  const vl_minimumSamples =
    p_options.minimumSamples ?? k_liveCodeBenchMinimumSamples;

  if (!f_isPositiveInteger(vl_minimumSamples)) {
    return f_adapterFail("LiveCodeBench minimumSamples must be a positive integer");
  }

  const vl_window = fh_resolveWindow(p_payload.date_marks, p_options.window);

  if (!vl_window.ok) {
    return f_adapterFail(vl_window.error);
  }

  const vl_warnings: AdapterWarning[] = [];
  const vl_modelLinks = new Map<string, string>();
  const vl_ambiguousModels = new Set<string>();

  for (const [vl_index, vl_entry] of (
    p_payload.models as readonly unknown[]
  ).entries()) {
    if (!f_isRecord(vl_entry)) {
      vl_warnings.push({
        code: "skipped-row",
        message: `LiveCodeBench model at index ${vl_index} is not an object`,
      });
      continue;
    }

    const vl_repr = f_parseNonEmptyString(
      vl_entry.model_repr,
      "livecodebench.model_repr",
    );

    if (!vl_repr.ok) {
      vl_warnings.push({
        code: "skipped-row",
        message: `LiveCodeBench model at index ${vl_index}: ${vl_repr.error}`,
      });
      continue;
    }

    if (vl_ambiguousModels.has(vl_repr.value)) {
      continue;
    }

    if (vl_modelLinks.has(vl_repr.value)) {
      vl_modelLinks.delete(vl_repr.value);
      vl_ambiguousModels.add(vl_repr.value);
      vl_warnings.push({
        code: "duplicate-model",
        message: `multiple LiveCodeBench model rows for ${vl_repr.value}; model left unmatched`,
      });
      continue;
    }

    vl_modelLinks.set(
      vl_repr.value,
      fh_parseModelLink(vl_entry.link),
    );
  }

  if (vl_modelLinks.size === 0) {
    return f_adapterFail(
      "LiveCodeBench payload contained no usable models",
      vl_warnings,
    );
  }

  const vl_totals = new Map<string, { count: number; sum: number }>();
  let vl_invalidRows = 0;
  let vl_unknownRows = 0;

  for (const vl_entry of p_payload.performances as readonly unknown[]) {
    if (!f_isRecord(vl_entry)) {
      vl_invalidRows += 1;
      continue;
    }

    if (
      typeof vl_entry.model !== "string" ||
      vl_entry.model.trim().length === 0
    ) {
      vl_invalidRows += 1;
      continue;
    }

    const vl_model = vl_entry.model;

    if (
      vl_ambiguousModels.has(vl_model) ||
      !vl_modelLinks.has(vl_model)
    ) {
      vl_unknownRows += 1;
      continue;
    }

    if (
      !f_isFiniteNumber(vl_entry.date) ||
      !f_isFiniteNumber(vl_entry["pass@1"]) ||
      vl_entry["pass@1"] < 0 ||
      vl_entry["pass@1"] > 100
    ) {
      vl_invalidRows += 1;
      continue;
    }

    if (
      vl_entry.date < vl_window.value.startEpochMs ||
      vl_entry.date > vl_window.value.endEpochMs
    ) {
      continue;
    }

    const vl_current = vl_totals.get(vl_model) ?? { count: 0, sum: 0 };
    vl_current.count += 1;
    vl_current.sum += vl_entry["pass@1"];
    vl_totals.set(vl_model, vl_current);
  }

  if (vl_invalidRows > 0) {
    vl_warnings.push({
      code: "skipped-row",
      message: `${vl_invalidRows} malformed LiveCodeBench performance rows ignored`,
    });
  }

  if (vl_unknownRows > 0) {
    vl_warnings.push({
      code: "unknown-model",
      message: `${vl_unknownRows} LiveCodeBench performance rows referenced unknown models`,
    });
  }

  const vl_windowStart = fh_toIso(vl_window.value.startEpochMs);
  const vl_windowEnd = fh_toIso(vl_window.value.endEpochMs);
  const vl_benchmarks: ModelBenchmark[] = [];

  for (const [vl_model, vl_total] of vl_totals) {
    if (vl_total.count < vl_minimumSamples) {
      vl_warnings.push({
        code: "below-minimum-samples",
        message: `${vl_model} has ${vl_total.count} samples (minimum ${vl_minimumSamples}) and was omitted`,
      });
      continue;
    }

    vl_benchmarks.push({
      benchmarkId: "livecodebench",
      variant: k_livecodebenchVariant,
      score: vl_total.sum / vl_total.count,
      scoreUnit: "percent",
      rank: null,
      sampleCount: vl_total.count,
      windowStart: vl_windowStart,
      windowEnd: vl_windowEnd,
      sourceModelId: vl_model,
      sourceUrl:
        vl_modelLinks.get(vl_model) ?? k_liveCodeBenchLeaderboardUrl,
      evaluatedAt: null,
    });
  }

  if (vl_totals.size === 0) {
    return f_adapterFail(
      "LiveCodeBench payload contained no performances in the selected window",
      vl_warnings,
    );
  }

  vl_benchmarks.sort((p_left, p_right) =>
    (p_left.sourceModelId ?? "").localeCompare(p_right.sourceModelId ?? ""),
  );

  return f_adapterOk(vl_benchmarks, vl_warnings);
}

export interface LiveCodeBenchFetchOptions
  extends FetchJsonRetryOptions,
    LiveCodeBenchParseOptions {}

/** Fetch and normalize the live snapshot with the shared retry policy. */
export async function f_fetchLiveCodeBench(
  p_options: LiveCodeBenchFetchOptions,
): Promise<AdapterResult<readonly ModelBenchmark[]>> {
  try {
    const vl_payload = await f_fetchJsonWithRetry<unknown>(
      k_liveCodeBenchDataUrl,
      p_options,
    );

    return f_parseLiveCodeBench(vl_payload, p_options);
  } catch (p_error) {
    if (p_error instanceof FetchJsonError) {
      return f_adapterFail(`LiveCodeBench fetch failed: ${p_error.message}`);
    }

    return f_adapterFail("LiveCodeBench fetch failed: unexpected error");
  }
}

function fh_resolveStartIndex(p_length: number): number {
  if (p_length > k_longWindowThreshold) {
    return Math.min(k_longWindowStartIndex, p_length - 1);
  }

  return k_shortWindowStartIndex;
}

function fh_resolveWindow(
  p_dateMarks: unknown,
  p_override: LiveCodeBenchWindow | undefined,
): DomainResult<LiveCodeBenchWindow> {
  if (p_override === undefined) {
    return f_deriveLiveCodeBenchWindow(p_dateMarks);
  }

  if (
    !f_isFiniteNumber(p_override.startEpochMs) ||
    !f_isFiniteNumber(p_override.endEpochMs) ||
    p_override.startEpochMs >= p_override.endEpochMs
  ) {
    return f_fail("LiveCodeBench window must be a non-empty epoch-ms range");
  }

  return f_ok(p_override);
}

function fh_parseModelLink(p_value: unknown): string {
  const vl_link = f_parseNullableHttpUrl(p_value, "livecodebench.link");

  if (vl_link.ok && vl_link.value !== null) {
    return vl_link.value;
  }

  return k_liveCodeBenchLeaderboardUrl;
}

function fh_toIso(p_epochMs: number): string {
  return new Date(p_epochMs).toISOString();
}
