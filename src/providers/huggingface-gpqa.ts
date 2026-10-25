/**
 * Hugging Face GPQA Diamond adapter.
 *
 * Source: the official GPQA dataset's leaderboard payload, filtered to exactly
 * `.eval_results/gpqa_diamond.yaml`. HF's `rank` field mixes subsets and is
 * never reused; ranking is computed later from our own scores.
 *
 * A model without a Diamond row is absent from the result (missing, not zero).
 */

import {
  f_isFiniteNumber,
  f_isRecord,
  f_parseNonEmptyString,
  f_parseNullableHttpUrl,
} from "../domain/guards";
import {
  k_gpqaVariant,
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

/** Verified official dataset (see docs/api/huggingface-gpqa.md). */
export const k_gpqaDatasetId = "Idavidrein/gpqa";

/** The only subset used by the overview. */
export const k_gpqaLeaderboardFilename = ".eval_results/gpqa_diamond.yaml";

/** Human-facing leaderboard page, used as provenance fallback. */
export const k_gpqaLeaderboardUrl =
  "https://huggingface.co/datasets/Idavidrein/gpqa/leaderboard";

/** Build the documented leaderboard endpoint without losing path separators. */
export function f_buildHuggingFaceLeaderboardUrl(p_datasetId: string): string {
  const vl_encodedDatasetId = p_datasetId
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `https://huggingface.co/api/datasets/${vl_encodedDatasetId}/leaderboard`;
}

/**
 * Filter and normalize a leaderboard payload. Rows from other GPQA subsets are
 * ignored silently (they are expected); malformed Diamond rows are skipped with
 * a warning. Conflicting duplicate Diamond rows make that model unmatched.
 */
export function f_parseGpqaLeaderboard(
  p_payload: unknown,
): AdapterResult<readonly ModelBenchmark[]> {
  if (!Array.isArray(p_payload)) {
    return f_adapterFail("GPQA leaderboard payload must be an array");
  }

  const vl_entries: readonly unknown[] = p_payload;
  const vl_results = new Map<string, ModelBenchmark>();
  const vl_conflicts = new Set<string>();
  const vl_conflictWarned = new Set<string>();
  const vl_warnings: AdapterWarning[] = [];

  for (const [vl_index, vl_entry] of vl_entries.entries()) {
    if (!f_isRecord(vl_entry)) {
      vl_warnings.push({
        code: "skipped-row",
        message: `GPQA row at index ${vl_index} is not an object`,
      });
      continue;
    }

    if (typeof vl_entry.filename !== "string") {
      vl_warnings.push({
        code: "skipped-row",
        message: `GPQA row at index ${vl_index} has no filename`,
      });
      continue;
    }

    if (vl_entry.filename !== k_gpqaLeaderboardFilename) {
      continue;
    }

    const vl_modelId = f_parseNonEmptyString(
      vl_entry.modelId,
      "gpqa.modelId",
    );

    if (!vl_modelId.ok) {
      vl_warnings.push({
        code: "skipped-row",
        message: `GPQA Diamond row at index ${vl_index}: ${vl_modelId.error}`,
      });
      continue;
    }

    if (vl_entry.lower_is_better !== false) {
      vl_warnings.push({
        code: "skipped-row",
        message: `GPQA row for ${vl_modelId.value} is not marked higher-is-better`,
      });
      continue;
    }

    if (
      !f_isFiniteNumber(vl_entry.value) ||
      vl_entry.value < 0 ||
      vl_entry.value > 100
    ) {
      vl_warnings.push({
        code: "skipped-row",
        message: `GPQA row for ${vl_modelId.value} has an invalid score`,
      });
      continue;
    }

    if (vl_conflicts.has(vl_modelId.value)) {
      continue;
    }

    if (vl_results.has(vl_modelId.value)) {
      vl_results.delete(vl_modelId.value);
      vl_conflicts.add(vl_modelId.value);

      if (!vl_conflictWarned.has(vl_modelId.value)) {
        vl_conflictWarned.add(vl_modelId.value);
        vl_warnings.push({
          code: "duplicate-model",
          message: `multiple GPQA Diamond rows for ${vl_modelId.value}; model left unmatched`,
        });
      }

      continue;
    }

    vl_results.set(vl_modelId.value, {
      benchmarkId: "gpqa",
      variant: k_gpqaVariant,
      score: vl_entry.value,
      scoreUnit: "percent",
      rank: null,
      sampleCount: null,
      windowStart: null,
      windowEnd: null,
      sourceModelId: vl_modelId.value,
      matchType: null,
      sourceUrl: fh_parseSourceUrl(vl_entry.source),
      evaluatedAt: null,
    });
  }

  if (vl_results.size === 0) {
    return f_adapterFail(
      "GPQA payload contained no valid gpqa_diamond rows",
      vl_warnings,
    );
  }

  const vl_benchmarks = [...vl_results.values()].sort((p_left, p_right) =>
    (p_left.sourceModelId ?? "").localeCompare(p_right.sourceModelId ?? ""),
  );

  return f_adapterOk(vl_benchmarks, vl_warnings);
}

/**
 * Fetch and normalize the live leaderboard. The timeout/retry policy comes
 * from the caller; failures are returned, not thrown, for source isolation.
 */
export async function f_fetchGpqaBenchmarks(
  p_options: FetchJsonRetryOptions,
  p_datasetId: string = k_gpqaDatasetId,
): Promise<AdapterResult<readonly ModelBenchmark[]>> {
  try {
    const vl_payload = await f_fetchJsonWithRetry<unknown>(
      f_buildHuggingFaceLeaderboardUrl(p_datasetId),
      p_options,
    );

    return f_parseGpqaLeaderboard(vl_payload);
  } catch (p_error) {
    if (p_error instanceof FetchJsonError) {
      return f_adapterFail(`GPQA fetch failed: ${p_error.message}`);
    }

    return f_adapterFail("GPQA fetch failed: unexpected error");
  }
}

function fh_parseSourceUrl(p_value: unknown): string {
  if (f_isRecord(p_value)) {
    const vl_url = f_parseNullableHttpUrl(p_value.url, "gpqa.source.url");

    if (vl_url.ok && vl_url.value !== null) {
      return vl_url.value;
    }
  }

  return k_gpqaLeaderboardUrl;
}
