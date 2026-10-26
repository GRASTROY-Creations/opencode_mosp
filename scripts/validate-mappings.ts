/**
 * Live drift check for the reviewed LLMBM mappings (Adjustments 20-22).
 *
 * Network-required diagnostic run via `bun run validate:mappings`; intentionally
 * NOT part of `bun run check` or CI. Parses the live `/v1/export` through the
 * production adapter and classifies every non-null `llbmId`:
 *
 * - PASS    — scored for at least one displayed metric (coding and/or
 *             intelligence); attaches today.
 * - PENDING — the model exists in `dataset.models` but has no score in either
 *             metric yet; kept on purpose and attaches automatically later.
 * - DRIFT   — the identifier exists nowhere in the live dataset, or its
 *             registry target left the enabled catalog; must be corrected.
 *
 * The catalog check is best-effort via the OpenCode CLI (`--skip-catalog`
 * disables it). Exits non-zero only on DRIFT. Printed text is host-only.
 */

import { k_llbmMappings } from "../src/config/llbm-mappings";
import { f_fetchLiveLlbmState, f_liveCatalogIds } from "./live-data";

async function fh_main(): Promise<number> {
  const vl_skipCatalog = Bun.argv.slice(2).includes("--skip-catalog");
  const vl_live = await f_fetchLiveLlbmState();
  const vl_coding = vl_live.scores.get("llbmCoding") ?? new Map<string, number>();
  const vl_intel = vl_live.scores.get("llbmIntelligence") ?? new Map<string, number>();
  const vl_catalogList = vl_skipCatalog ? null : f_liveCatalogIds();
  const vl_catalog = vl_catalogList === null ? null : new Set(vl_catalogList);

  console.log(
    `scored models: coding ${vl_coding.size}, intelligence ${vl_intel.size}; dataset models: ${vl_live.models.size}`,
  );
  console.log(
    `catalog: ${vl_catalog === null ? "unavailable" : `ok (${vl_catalog.size} models)`}`,
  );

  const vl_counts = { PASS: 0, PENDING: 0, DRIFT: 0 };
  let vl_codingCount = 0;
  let vl_intelCount = 0;

  for (const vl_mapping of k_llbmMappings) {
    if (vl_mapping.llbmId === null) {
      // Reviewed "no LLMBM equivalent"; nothing to verify.
      continue;
    }

    const vl_hasCoding = vl_coding.has(vl_mapping.llbmId);
    const vl_hasIntel = vl_intel.has(vl_mapping.llbmId);
    const vl_inCatalog = vl_catalog?.has(vl_mapping.opencodeId) ?? true;

    if (vl_hasCoding) vl_codingCount += 1;
    if (vl_hasIntel) vl_intelCount += 1;

    const vl_state = !vl_inCatalog
      ? "DRIFT"
      : vl_hasCoding || vl_hasIntel
        ? "PASS"
        : vl_live.models.has(vl_mapping.llbmId)
          ? "PENDING"
          : "DRIFT";

    vl_counts[vl_state] += 1;

    console.log(
      `${vl_state} llbm ${vl_mapping.llbmId} -> ${vl_mapping.opencodeId} (${vl_mapping.matchType}) coding:${vl_hasCoding ? "ok" : "—"} intel:${vl_hasIntel ? "ok" : "—"} catalog:${vl_catalog === null ? "unavailable" : vl_inCatalog ? "ok" : "missing"}`,
    );
  }

  const vl_checked = vl_counts.PASS + vl_counts.PENDING + vl_counts.DRIFT;
  console.log(
    `${vl_counts.DRIFT === 0 ? "OK" : "FAIL"} ${vl_checked} reviewed mappings: ${vl_counts.PASS} PASS (coding ${vl_codingCount}, intelligence ${vl_intelCount}), ${vl_counts.PENDING} PENDING, ${vl_counts.DRIFT} DRIFT`,
  );

  return vl_counts.DRIFT === 0 ? 0 : 1;
}

process.exitCode = await fh_main();
