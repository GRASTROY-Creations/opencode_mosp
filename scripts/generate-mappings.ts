/**
 * Regenerate `k_llbmMappings` (src/config/llbm-mappings.ts) from live data.
 *
 * Reads the LLMBenchmark.ai `/v1/export` payload for the selected metric
 * (OPENCODE_LLM_BENCH_METRIC, default aa_coding_index), reads the live
 * OpenCode location catalog via `opencode api get`, and matches catalog
 * model IDs against dataset model identifiers by their tail after the last
 * "/":
 * - tail equal to the model ID (case-insensitive) -> "exact";
 * - a dash replaced by a dot at one version boundary (e.g.
 *   `claude-opus-4-8` -> `claude-opus-4.8`), resolving to exactly one live
 *   id -> "exact" (Adjustment 21 dot equivalence, owner-approved);
 * - model ID ends "-free" and the stem resolves by either rule above
 *   -> "family_fallback";
 * - ids that exist in `dataset.models` but have no row for this metric are
 *   still adopted and reported as PENDING (they attach automatically once
 *   scored — see `bun run validate:mappings`);
 * - otherwise the entry gets `llbmId: null` and the script prints near-miss
 *   suggestions for manual review.
 *
 * Review the emitted table (sibling proxies such as codex variants pointing
 * at a base model are added manually to the config after owner review, not
 * generated here).
 *
 * Run: `bun run generate:mappings` (requires network + a running service).
 * The emitted TypeScript block must be reviewed and pasted into
 * src/config/llbm-mappings.ts; nothing here writes source files.
 */

import { f_isRecord } from "../src/domain/guards";
import {
  f_parseLlbmExport,
  f_resolveLlbmMetric,
  k_llbmExportUrl,
} from "../src/providers/llbm";
import { f_fetchJsonWithRetry } from "../src/utils/fetch-json";

interface TailTarget {
  readonly llbmId: string;
  readonly score: number | null;
}

interface GeneratedEntry {
  readonly opencodeId: string;
  readonly llbmId: string | null;
  readonly matchType: "exact" | "family_fallback";
  readonly score: number | null;
  readonly kind: string;
}

function fh_liveCatalogIds(): string[] | null {
  const vl_path = `/api/model?location%5Bdirectory%5D=${encodeURIComponent(process.cwd())}`;
  const vl_spawn = Bun.spawnSync(["opencode", "api", "get", vl_path], {
    stdout: "pipe",
    stderr: "ignore",
  });

  if (vl_spawn.exitCode !== 0) {
    return null;
  }

  let vl_parsed: unknown;
  try {
    vl_parsed = JSON.parse(vl_spawn.stdout.toString()) as unknown;
  } catch {
    return null;
  }

  if (!f_isRecord(vl_parsed) || !Array.isArray(vl_parsed.data)) {
    return null;
  }

  const vl_ids: string[] = [];

  for (const vl_raw of vl_parsed.data as readonly unknown[]) {
    if (!f_isRecord(vl_raw)) continue;
    const vl_provider = vl_raw.providerID;
    const vl_model = vl_raw.modelID;
    if (typeof vl_provider === "string" && typeof vl_model === "string") {
      vl_ids.push(`${vl_provider}/${vl_model}`);
    }
  }

  return vl_ids.length > 0 ? vl_ids : null;
}

function fh_tail(p_llbmId: string): string {
  const vl_index = p_llbmId.lastIndexOf("/");
  return vl_index === -1 ? p_llbmId : p_llbmId.slice(vl_index + 1);
}

/**
 * Resolve a catalog tail against a tail-keyed map: direct casefolded match
 * first, then single-dash-to-dot version-boundary variants. Returns undefined
 * when nothing matches and when several distinct live ids compete (ambiguous
 * dot forms are never guessed).
 */
function fh_resolveTail(
  p_map: ReadonlyMap<string, TailTarget>,
  p_tail: string,
): TailTarget | undefined {
  const vl_key = p_tail.toLowerCase();
  const vl_direct = p_map.get(vl_key);

  if (vl_direct !== undefined) {
    return vl_direct;
  }

  let vl_found: TailTarget | undefined;

  for (let vl_index = 0; vl_index < vl_key.length; vl_index += 1) {
    if (vl_key[vl_index] !== "-") {
      continue;
    }

    const vl_variant =
      vl_key.slice(0, vl_index) + "." + vl_key.slice(vl_index + 1);
    const vl_candidate = p_map.get(vl_variant);

    if (vl_candidate === undefined) {
      continue;
    }

    if (vl_found !== undefined && vl_found.llbmId !== vl_candidate.llbmId) {
      return undefined; // Ambiguous dot equivalence.
    }

    vl_found = vl_candidate;
  }

  return vl_found;
}

function fh_datasetModelTargets(p_payload: unknown): Map<string, TailTarget> {
  const vl_map = new Map<string, TailTarget>();

  const vl_dataset = f_isRecord(p_payload) ? p_payload.dataset : undefined;

  if (!f_isRecord(vl_dataset) || !Array.isArray(vl_dataset.models)) {
    return vl_map;
  }

  for (const vl_model of vl_dataset.models as readonly unknown[]) {
    if (!f_isRecord(vl_model) || typeof vl_model.id !== "string") {
      continue;
    }

    const vl_key = fh_tail(vl_model.id).toLowerCase();

    if (!vl_map.has(vl_key)) {
      vl_map.set(vl_key, { llbmId: vl_model.id, score: null });
    }
  }

  return vl_map;
}

async function f_main(): Promise<number> {
  const vl_metric = f_resolveLlbmMetric();
  console.log(`metric: ${vl_metric}`);

  let vl_payload: unknown;
  try {
    vl_payload = await f_fetchJsonWithRetry(k_llbmExportUrl, {
      timeoutMs: 120_000,
    });
  } catch (p_error) {
    console.log(
      `LLMBM export unavailable: ${p_error instanceof Error ? p_error.message : "request failed"}`,
    );
    return 1;
  }

  const vl_parsed = f_parseLlbmExport(vl_payload, vl_metric);

  if (!vl_parsed.ok) {
    console.log(`LLMBM export unusable: ${vl_parsed.error}`);
    return 1;
  }

  const vl_byTail = new Map<string, TailTarget>();

  for (const vl_row of vl_parsed.value) {
    const vl_modelId = vl_row.sourceModelId;
    const vl_score = vl_row.score;

    if (vl_modelId === null || vl_score === null) continue;

    const vl_key = fh_tail(vl_modelId).toLowerCase();
    const vl_existing = vl_byTail.get(vl_key);

    if (vl_existing === undefined || vl_score > vl_existing.score!) {
      vl_byTail.set(vl_key, { llbmId: vl_modelId, score: vl_score });
    }
  }

  const vl_datasetByTail = fh_datasetModelTargets(vl_payload);

  const vl_catalog = fh_liveCatalogIds();

  if (vl_catalog === null) {
    console.log("catalog unavailable — is the OpenCode service running?");
    return 1;
  }

  console.log(
    `scored targets: ${vl_byTail.size} · dataset models: ${vl_datasetByTail.size} · catalog models: ${vl_catalog.length}\n`,
  );

  const vl_entries: GeneratedEntry[] = [];
  const vl_unmatched: string[] = [];

  for (const vl_catalogId of [...vl_catalog].sort()) {
    const vl_modelId = vl_catalogId.slice(vl_catalogId.indexOf("/") + 1);

    const vl_direct = fh_resolveTail(vl_byTail, vl_modelId);

    if (vl_direct !== undefined) {
      vl_entries.push({
        opencodeId: vl_catalogId,
        llbmId: vl_direct.llbmId,
        matchType: "exact",
        score: vl_direct.score,
        kind: "exact",
      });
      continue;
    }

    if (vl_modelId.endsWith("-free")) {
      const vl_stem = fh_resolveTail(vl_byTail, vl_modelId.slice(0, -5));

      if (vl_stem !== undefined) {
        vl_entries.push({
          opencodeId: vl_catalogId,
          llbmId: vl_stem.llbmId,
          matchType: "family_fallback",
          score: vl_stem.score,
          kind: "family_fallback",
        });
        continue;
      }
    }

    // Unscored but real: adopt as PENDING (attaches when metric row appears).
    const vl_pending = fh_resolveTail(vl_datasetByTail, vl_modelId);

    if (vl_pending !== undefined) {
      vl_entries.push({
        opencodeId: vl_catalogId,
        llbmId: vl_pending.llbmId,
        matchType: "exact",
        score: null,
        kind: "PENDING",
      });
      continue;
    }

    if (vl_modelId.endsWith("-free")) {
      const vl_pendingStem = fh_resolveTail(
        vl_datasetByTail,
        vl_modelId.slice(0, -5),
      );

      if (
        vl_pendingStem !== undefined &&
        !vl_byTail.has(fh_tail(vl_pendingStem.llbmId).toLowerCase())
      ) {
        vl_entries.push({
          opencodeId: vl_catalogId,
          llbmId: vl_pendingStem.llbmId,
          matchType: "family_fallback",
          score: null,
          kind: "PENDING family",
        });
        continue;
      }
    }

    vl_entries.push({
      opencodeId: vl_catalogId,
      llbmId: null,
      matchType: "exact",
      score: null,
      kind: "UNMATCHED",
    });
    vl_unmatched.push(vl_modelId);
  }

  console.log("REVIEW TABLE");
  console.log(
    "opencode id                                   | llbm id                                       | score | kind",
  );
  console.log("-".repeat(110));

  for (const vl_entry of vl_entries) {
    console.log(
      `${vl_entry.opencodeId.padEnd(46)} | ${(vl_entry.llbmId ?? "—").padEnd(44)} | ${(vl_entry.score?.toFixed(1) ?? "—").padStart(5)} | ${vl_entry.kind}`,
    );
  }

  if (vl_unmatched.length > 0) {
    console.log(
      "\nSUGGESTIONS for unmatched models (tails sharing a 4+ char prefix):",
    );

    const vl_all = new Map([...vl_datasetByTail, ...vl_byTail]);

    for (const vl_modelId of vl_unmatched) {
      const vl_candidates = [...vl_all.entries()]
        .filter(([p_tail]) => p_tail.startsWith(vl_modelId.slice(0, 4).toLowerCase()))
        .map(
          ([, p_target]) =>
            `${p_target.llbmId}${p_target.score !== null ? ` (${p_target.score.toFixed(1)})` : " (unscored)"}`,
        );

      console.log(
        `  ${vl_modelId}: ${vl_candidates.length > 0 ? vl_candidates.join(", ") : "no candidates"}`,
      );
    }
  }

  const vl_matched = vl_entries.filter((p_entry) => p_entry.llbmId !== null).length;
  const vl_scoredCount = vl_entries.filter((p_entry) => p_entry.score !== null).length;
  console.log(
    `\nadopted ${vl_matched} / ${vl_entries.length} (${vl_scoredCount} scored today, ${vl_matched - vl_scoredCount} pending)`,
  );

  console.log(
    "\nEMITTED k_llbmMappings BLOCK (review, then paste into src/config/llbm-mappings.ts):",
  );
  console.log("export const k_llbmMappings: readonly LlbmMapping[] = [");

  let vl_lastGroup = "";

  for (const vl_entry of vl_entries) {
    const vl_group =
      vl_entry.llbmId !== null
        ? vl_entry.llbmId.slice(0, vl_entry.llbmId.indexOf("/"))
        : "";

    if (vl_group !== vl_lastGroup && vl_lastGroup !== "") {
      console.log("");
    }

    vl_lastGroup = vl_group;

    if (vl_entry.llbmId === null) {
      console.log(
        `  { opencodeId: "${vl_entry.opencodeId}", llbmId: null, matchType: "exact" },`,
      );
    } else {
      console.log(
        `  { opencodeId: "${vl_entry.opencodeId}", llbmId: "${vl_entry.llbmId}", matchType: "${vl_entry.matchType}" },`,
      );
    }
  }

  console.log("];");
  return 0;
}

process.exitCode = await f_main();
