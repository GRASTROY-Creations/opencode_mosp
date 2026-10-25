/**
 * Live drift check for the reviewed LLMBM mappings (Adjustments 20/21).
 *
 * Network-required diagnostic run via `bun run validate:mappings`; intentionally
 * NOT part of `bun run check` or CI. Fetches the live `/v1/export` and classifies
 * every non-null `llbmId` three ways:
 *
 * - PASS    — scored for the resolved metric; attaches today.
 * - PENDING — the model exists in `dataset.models` but has no row for this
 *             metric yet; kept on purpose and attaches automatically later.
 * - DRIFT   — the identifier exists nowhere in the live dataset; must be
 *             corrected or nulled.
 *
 * A mapping whose registry target has left the enabled catalog (best-effort via
 * the OpenCode CLI) also counts as DRIFT. Exits non-zero only on DRIFT. Printed
 * text is host-only (no URLs, no secrets).
 */

import { k_llbmMappings } from "../src/config/llbm-mappings";
import { f_isRecord } from "../src/domain/guards";
import { f_resolveLlbmMetric } from "../src/providers/llbm";
import { f_fetchJson } from "../src/utils/fetch-json";

interface LiveState {
  readonly scored: ReadonlySet<string>;
  readonly models: ReadonlySet<string>;
}

async function f_liveState(): Promise<LiveState> {
  const vl_payload: unknown = await f_fetchJson(
    "https://api.llmbenchmark.ai/v1/export",
    { timeoutMs: 60_000 },
  );

  const vl_dataset = f_isRecord(vl_payload) ? vl_payload.dataset : undefined;

  if (!f_isRecord(vl_dataset)) {
    throw new Error("LLMBM export is missing its dataset object");
  }

  const vl_metric = f_resolveLlbmMetric();
  const vl_scored = new Set<string>();
  const vl_models = new Set<string>();

  if (Array.isArray(vl_dataset.scores)) {
    for (const vl_row of vl_dataset.scores) {
      if (
        f_isRecord(vl_row) &&
        vl_row.metric === vl_metric &&
        typeof vl_row.modelId === "string" &&
        typeof vl_row.value === "number"
      ) {
        vl_scored.add(vl_row.modelId);
      }
    }
  }

  if (Array.isArray(vl_dataset.models)) {
    for (const vl_model of vl_dataset.models) {
      if (f_isRecord(vl_model) && typeof vl_model.id === "string") {
        vl_models.add(vl_model.id);
      }
    }
  }

  if (vl_scored.size === 0) {
    throw new Error(`LLMBM scored rows missing for metric ${vl_metric}`);
  }

  return { scored: vl_scored, models: vl_models };
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
  const vl_live = await f_liveState();
  const vl_catalogIds = f_liveCatalogIds(vl_skipCatalog);

  console.log(
    `metric: ${vl_metric}; scored models: ${vl_live.scored.size}; dataset models: ${vl_live.models.size}`,
  );
  console.log(
    `catalog: ${vl_catalogIds === null ? "unavailable" : `ok (${vl_catalogIds.size} models)`}`,
  );

  let vl_pass = 0;
  let vl_pending = 0;
  let vl_drift = 0;
  let vl_checked = 0;

  for (const vl_mapping of k_llbmMappings) {
    if (vl_mapping.llbmId === null) {
      // Documented unmatched model; nothing to verify.
      continue;
    }

    vl_checked += 1;
    const vl_inScored = vl_live.scored.has(vl_mapping.llbmId);
    const vl_inModels = vl_live.models.has(vl_mapping.llbmId);
    const vl_inCatalog = vl_catalogIds?.has(vl_mapping.opencodeId) ?? true;

    const vl_sourceState = vl_inScored
      ? "ok"
      : vl_inModels
        ? "PENDING"
        : "DRIFT";
    const vl_catalogState =
      vl_catalogIds === null
        ? "unavailable"
        : vl_inCatalog
          ? "ok"
          : "missing";

    const vl_ok = (vl_inScored || vl_inModels) && vl_inCatalog;

    if (vl_inScored && vl_inCatalog) vl_pass += 1;
    else if (vl_inModels && vl_inCatalog) vl_pending += 1;
    else vl_drift += 1;

    console.log(
      `${vl_ok ? (vl_inScored ? "PASS" : "PENDING") : "DRIFT"} llbm ${vl_mapping.llbmId} -> ${vl_mapping.opencodeId} (${vl_mapping.matchType}) source:${vl_sourceState} catalog:${vl_catalogState}`,
    );
  }

  const vl_summary = vl_drift === 0 ? "OK" : "FAIL";
  console.log(
    `${vl_summary} ${vl_checked} reviewed mappings: ${vl_pass} PASS, ${vl_pending} PENDING, ${vl_drift} DRIFT`,
  );

  return vl_drift === 0 ? 0 : 1;
}

process.exitCode = await f_main();
