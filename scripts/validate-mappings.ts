/**
 * Live drift check for the reviewed LLMBM mappings (Adjustment 20).
 *
 * Network-required diagnostic run via `bun run validate:mappings`; intentionally
 * NOT part of `bun run check` or CI. Fetches the live `/v1/export` scored set
 * for the resolved metric and verifies every non-null `llbmId` still exists
 * there, and (best-effort, via the OpenCode CLI) that every mapping target is
 * still an enabled catalog model. Exits non-zero on any drift. Printed text is
 * host-only (no URLs, no secrets).
 */

import { k_llbmMappings } from "../src/config/llbm-mappings";
import { f_isRecord } from "../src/domain/guards";
import {
  f_fetchLlbmBenchmarks,
  f_resolveLlbmMetric,
} from "../src/providers/llbm";

async function f_liveLlbmScoredIds(): Promise<ReadonlySet<string>> {
  const vl_result = await f_fetchLlbmBenchmarks({
    timeoutMs: 30_000,
  });

  if (!vl_result.ok) {
    throw new Error(`LLMBM fetch failed: ${vl_result.error}`);
  }

  const vl_ids = new Set<string>();

  for (const vl_row of vl_result.value) {
    if (vl_row.sourceModelId !== null) {
      vl_ids.add(vl_row.sourceModelId);
    }
  }

  if (vl_ids.size === 0) {
    throw new Error("LLMBM scored rows missing");
  }

  return vl_ids;
}

function f_liveCatalogIds(p_skip: boolean): ReadonlySet<string> | null {
  if (p_skip) return null;

  try {
    const vl_cwd = process.cwd();
    const vl_url = `/api/model?location%5Bdirectory%5D=${encodeURIComponent(vl_cwd)}`;

    const vl_proc = Bun.spawnSync(["opencode", "api", "get", vl_url], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });

    if (vl_proc.exitCode !== 0) {
      console.log("catalog: unavailable (opencode CLI failed)");
      return null;
    }

    const vl_text = new TextDecoder().decode(vl_proc.stdout);
    const vl_json: unknown = JSON.parse(vl_text);
    const vl_data = f_isRecord(vl_json) ? vl_json.data : vl_json;

    if (!Array.isArray(vl_data)) {
      console.log("catalog: unavailable (unexpected payload shape)");
      return null;
    }

    const vl_ids = new Set<string>();

    for (const vl_model of vl_data) {
      if (!f_isRecord(vl_model)) continue;

      const vl_providerId = vl_model.providerID as string | undefined;
      const vl_modelId = vl_model.modelID as string | undefined;

      if (typeof vl_providerId === "string" && typeof vl_modelId === "string") {
        vl_ids.add(`${vl_providerId}/${vl_modelId}`);
      }
    }

    return vl_ids;
  } catch {
    console.log("catalog: unavailable (spawn/parse failed)");
    return null;
  }
}

async function f_main(): Promise<number> {
  const vl_args = Bun.argv.slice(2);
  const vl_skipCatalog = vl_args.includes("--skip-catalog");

  const vl_metric = f_resolveLlbmMetric();
  const vl_scoredIds = await f_liveLlbmScoredIds();
  const vl_catalogIds = f_liveCatalogIds(vl_skipCatalog);

  console.log(`metric: ${vl_metric}; scored models: ${vl_scoredIds.size}`);
  console.log(`catalog: ${vl_catalogIds === null ? "unavailable" : `ok (${vl_catalogIds.size} models)`}`);

  let vl_checked = 0;
  let vl_driftCount = 0;

  for (const vl_mapping of k_llbmMappings) {
    if (vl_mapping.llbmId === null) {
      // Documented unmatched model; nothing to verify.
      continue;
    }

    vl_checked += 1;
    const vl_inSource = vl_scoredIds.has(vl_mapping.llbmId);
    const vl_inCatalog = vl_catalogIds?.has(vl_mapping.opencodeId) ?? true;

    if (!vl_inSource || !vl_inCatalog) {
      vl_driftCount += 1;
    }

    const vl_status = vl_inSource && vl_inCatalog ? "PASS" : "DRIFT";
    console.log(
      `${vl_status} llbm ${vl_mapping.llbmId} -> ${vl_mapping.opencodeId} (${vl_mapping.matchType}) source:${vl_inSource ? "ok" : "DRIFT"} catalog:${vl_catalogIds === null ? "unavailable" : vl_inCatalog ? "ok" : "missing"}`,
    );
  }

  const vl_summary = vl_driftCount === 0 ? "OK" : "FAIL";
  console.log(
    `${vl_summary} ${vl_checked - vl_driftCount}/${vl_checked} reviewed mappings verified live`,
  );

  return vl_driftCount === 0 ? 0 : 1;
}

process.exitCode = await f_main();
