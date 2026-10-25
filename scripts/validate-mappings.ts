/**
 * Live drift check for the reviewed benchmark mappings (Adjustment 18).
 *
 * Network-required diagnostic run via `bun run validate:mappings`; intentionally
 * NOT part of `bun run check` or CI. Exits non-zero when any seeded mapping's
 * source string or catalog target has drifted from the live payloads. Printed
 * error text is host-only (no URLs, no secrets).
 */

import { k_benchmarkMappings } from "../src/config/benchmark-mappings";
import { f_isRecord } from "../src/domain/guards";
import {
  f_buildHuggingFaceLeaderboardUrl,
  k_gpqaDatasetId,
  k_gpqaLeaderboardFilename,
} from "../src/providers/huggingface-gpqa";
import { k_liveCodeBenchDataUrl } from "../src/providers/livecodebench";
import { f_fetchJson } from "../src/utils/fetch-json";

const k_timeoutMs = 15_000;
const k_skipCatalogFlag = "--skip-catalog";

async function f_liveGpqaModelIds(): Promise<ReadonlySet<string>> {
  const vl_payload = await f_fetchJson<unknown>(
    f_buildHuggingFaceLeaderboardUrl(k_gpqaDatasetId),
    {
      timeoutMs: k_timeoutMs,
    },
  );

  if (!Array.isArray(vl_payload)) {
    throw new Error("gpqa payload shape changed");
  }

  const vl_ids = new Set<string>();

  for (const vl_entry of vl_payload) {
    if (!f_isRecord(vl_entry)) continue;

    if (vl_entry["lower_is_better"] !== false) continue;

    const vl_filename = vl_entry["filename"];

    if (
      typeof vl_filename !== "string" ||
      vl_filename !== k_gpqaLeaderboardFilename
    ) {
      continue;
    }

    const vl_modelId = vl_entry["modelId"];

    if (typeof vl_modelId === "string") vl_ids.add(vl_modelId);
  }

  if (vl_ids.size === 0) {
    throw new Error("gpqa diamond rows missing");
  }

  return vl_ids;
}

async function f_liveLcbModelReprs(): Promise<ReadonlySet<string>> {
  const vl_payload = await f_fetchJson<unknown>(k_liveCodeBenchDataUrl, {
    timeoutMs: k_timeoutMs,
  });

  if (!f_isRecord(vl_payload)) {
    throw new Error("livecodebench payload shape changed");
  }

  const vl_models = vl_payload["models"];

  if (!Array.isArray(vl_models)) {
    throw new Error("livecodebench models missing");
  }

  const vl_reprs = new Set<string>();

  for (const vl_entry of vl_models) {
    if (!f_isRecord(vl_entry)) continue;

    const vl_repr = vl_entry["model_repr"];

    if (typeof vl_repr === "string") vl_reprs.add(vl_repr);
  }

  if (vl_reprs.size === 0) {
    throw new Error("livecodebench model_repr list missing");
  }

  return vl_reprs;
}

/** Best-effort location catalog read; null means "could not check". */
function f_liveCatalogIds(p_skip: boolean): ReadonlySet<string> | null {
  if (p_skip) return null;

  try {
    const vl_result = Bun.spawnSync({
      cmd: [
        "opencode",
        "api",
        "get",
        `/api/model?location%5Bdirectory%5D=${encodeURIComponent(process.cwd())}`,
      ],
      stdout: "pipe",
      stderr: "ignore",
    });

    if (vl_result.exitCode !== 0) return null;

    const vl_json: unknown = JSON.parse(vl_result.stdout.toString());

    if (!f_isRecord(vl_json)) return null;

    const vl_data = vl_json["data"];

    if (!Array.isArray(vl_data)) return null;

    const vl_ids = new Set<string>();

    for (const vl_entry of vl_data) {
      if (!f_isRecord(vl_entry)) continue;

      const vl_provider = vl_entry["providerID"];
      const vl_model = vl_entry["modelID"];

      if (typeof vl_provider === "string" && typeof vl_model === "string") {
        vl_ids.add(`${vl_provider}/${vl_model}`);
      }
    }

    return vl_ids;
  } catch {
    return null;
  }
}

async function f_main(): Promise<number> {
  const vl_skipCatalog = process.argv.includes(k_skipCatalogFlag);

  let vl_gpqa: ReadonlySet<string> | null = null;
  let vl_lcb: ReadonlySet<string> | null = null;

  try {
    vl_gpqa = await f_liveGpqaModelIds();
  } catch (vl_error) {
    console.log(
      `gpqa source unavailable: ${vl_error instanceof Error ? vl_error.message : "unknown error"}`,
    );
  }

  try {
    vl_lcb = await f_liveLcbModelReprs();
  } catch (vl_error) {
    console.log(
      `livecodebench source unavailable: ${vl_error instanceof Error ? vl_error.message : "unknown error"}`,
    );
  }

  const vl_catalog = f_liveCatalogIds(vl_skipCatalog);
  let vl_drift = 0;

  for (const vl_mapping of k_benchmarkMappings) {
    const vl_live = vl_mapping.benchmarkId === "gpqa" ? vl_gpqa : vl_lcb;
    const vl_inSource = vl_live !== null && vl_live.has(vl_mapping.sourceModelId);
    let vl_catalogState = "unavailable";

    if (vl_catalog !== null) {
      vl_catalogState = vl_catalog.has(vl_mapping.opencodeModelId)
        ? "ok"
        : "missing";
    }

    const vl_ok = vl_inSource && vl_catalogState !== "missing";

    if (!vl_ok) vl_drift += 1;

    console.log(
      `${vl_ok ? "PASS" : "DRIFT"} ${vl_mapping.benchmarkId} ` +
        `${vl_mapping.sourceModelId} -> ${vl_mapping.opencodeModelId} ` +
        `(${vl_mapping.matchType}) catalog:${vl_catalogState}`,
    );
  }

  const vl_total = k_benchmarkMappings.length;

  console.log(
    `${vl_drift === 0 ? "OK" : "FAIL"} ${vl_total - vl_drift}/${vl_total} ` +
      "reviewed mappings verified live",
  );

  return vl_drift === 0 ? 0 : 1;
}

process.exitCode = await f_main();
