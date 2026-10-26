/**
 * Shared live-data helpers for the network-required mapping scripts
 * (`generate-mappings.ts`, `validate-mappings.ts`).
 *
 * Both scripts read the same two live sources: the LLMBM `/v1/export`
 * payload (parsed through the production adapter so scripts see exactly the
 * rows the plugin would attach) and the enabled OpenCode catalog via the
 * `opencode api get` CLI. Printed errors are host-only; no URLs or secrets.
 */

import { f_isRecord } from "../src/domain/guards";
import type { BenchmarkId } from "../src/domain/model-benchmark";
import { f_parseLlbmExport, k_llbmExportUrl } from "../src/providers/llbm";
import { f_fetchJsonWithRetry } from "../src/utils/fetch-json";

/** Live LLMBM state relevant to mapping review. */
export interface LiveLlbmState {
  /** Best score per source model id, per benchmark id. */
  readonly scores: ReadonlyMap<BenchmarkId, ReadonlyMap<string, number>>;
  /** Every id in `dataset.models` (scored or not). */
  readonly models: ReadonlySet<string>;
}

/** Fetch and parse the export; throws with a host-only message on failure. */
export async function f_fetchLiveLlbmState(): Promise<LiveLlbmState> {
  const vl_payload = await f_fetchJsonWithRetry(k_llbmExportUrl, {
    timeoutMs: 120_000,
  });
  const vl_parsed = f_parseLlbmExport(vl_payload);

  if (!vl_parsed.ok) {
    throw new Error(`LLMBM export unusable: ${vl_parsed.error}`);
  }

  const vl_scores = new Map<BenchmarkId, Map<string, number>>();

  for (const vl_row of vl_parsed.value) {
    if (vl_row.sourceModelId === null || vl_row.score === null) continue;
    const vl_byModel = vl_scores.get(vl_row.benchmarkId) ?? new Map<string, number>();
    vl_byModel.set(vl_row.sourceModelId, vl_row.score);
    vl_scores.set(vl_row.benchmarkId, vl_byModel);
  }

  const vl_models = new Set<string>();
  const vl_dataset = f_isRecord(vl_payload) ? vl_payload.dataset : undefined;

  if (f_isRecord(vl_dataset) && Array.isArray(vl_dataset.models)) {
    for (const vl_model of vl_dataset.models as readonly unknown[]) {
      if (f_isRecord(vl_model) && typeof vl_model.id === "string") {
        vl_models.add(vl_model.id);
      }
    }
  }

  return { scores: vl_scores, models: vl_models };
}

/**
 * Enabled registry ids (`<providerID>/<modelID>`) from the running OpenCode
 * service, or `null` when the CLI is unavailable or answers unexpectedly.
 */
export function f_liveCatalogIds(): readonly string[] | null {
  const vl_path = `/api/model?location%5Bdirectory%5D=${encodeURIComponent(process.cwd())}`;

  try {
    const vl_spawn = Bun.spawnSync(["opencode", "api", "get", vl_path], {
      stdout: "pipe",
      stderr: "ignore",
      timeout: 15_000,
    });

    if (vl_spawn.exitCode !== 0) {
      return null;
    }

    const vl_json: unknown = JSON.parse(vl_spawn.stdout.toString());
    const vl_data: unknown = f_isRecord(vl_json) ? vl_json.data : vl_json;

    if (!Array.isArray(vl_data)) {
      return null;
    }

    const vl_ids: string[] = [];

    for (const vl_raw of vl_data as readonly unknown[]) {
      if (!f_isRecord(vl_raw)) continue;
      const vl_provider = vl_raw.providerID;
      const vl_model = vl_raw.modelID;
      if (typeof vl_provider === "string" && typeof vl_model === "string") {
        vl_ids.push(`${vl_provider}/${vl_model}`);
      }
    }

    return vl_ids.length > 0 ? vl_ids : null;
  } catch {
    return null;
  }
}
