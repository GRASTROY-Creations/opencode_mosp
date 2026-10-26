/**
 * Regenerate `k_llbmMappings` (src/config/llbm-mappings.ts) from live data.
 *
 * Reads the LLMBenchmark.ai `/v1/export` payload (both displayed metrics:
 * `aa_coding_index` and `aa_intelligence_index`) and the live OpenCode
 * location catalog via `opencode api get`, then matches catalog model IDs
 * against dataset model identifiers by their tail after the last "/":
 * - tail equal to the model ID (case-insensitive) -> "exact";
 * - a dash replaced by a dot at one version boundary (e.g.
 *   `claude-opus-4-8` -> `claude-opus-4.8`), resolving to exactly one live
 *   id -> "exact" (Adjustment 21 dot equivalence, owner-approved);
 * - model ID ends "-free" and the stem resolves by either rule above
 *   -> "family_fallback";
 * - ids scored in at least one metric are preferred; ids that exist in
 *   `dataset.models` without any score are still adopted and reported as
 *   PENDING (they attach automatically once scored);
 * - otherwise the entry gets `llbmId: null` and the script prints near-miss
 *   suggestions for manual review.
 *
 * Reviewed-only proxies (codex variants pointing at a base model, renamed
 * rebrands such as `beam-free`) are added manually after owner review and
 * are never generated here.
 *
 * Run: `bun run generate:mappings` (requires network + a running service).
 * The emitted TypeScript block must be reviewed and pasted into
 * src/config/llbm-mappings.ts; nothing here writes source files.
 */

import { f_fetchLiveLlbmState, f_liveCatalogIds } from "./live-data";

/** A live dataset id plus its display score (coding, else intelligence). */
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

/** Resolve the model id directly, then its `-free` stem as a fallback. */
function fh_resolveWithFree(
  p_map: ReadonlyMap<string, TailTarget>,
  p_modelId: string,
): { readonly target: TailTarget; readonly matchType: "exact" | "family_fallback" } | undefined {
  const vl_direct = fh_resolveTail(p_map, p_modelId);

  if (vl_direct !== undefined) {
    return { target: vl_direct, matchType: "exact" };
  }

  if (!p_modelId.endsWith("-free")) {
    return undefined;
  }

  const vl_stem = fh_resolveTail(p_map, p_modelId.slice(0, -5));
  return vl_stem === undefined ? undefined : { target: vl_stem, matchType: "family_fallback" };
}

async function fh_main(): Promise<number> {
  let vl_live: Awaited<ReturnType<typeof f_fetchLiveLlbmState>>;

  try {
    vl_live = await f_fetchLiveLlbmState();
  } catch (p_error) {
    console.log(
      `LLMBM export unavailable: ${p_error instanceof Error ? p_error.message : "request failed"}`,
    );
    return 1;
  }

  const vl_coding = vl_live.scores.get("llbmCoding") ?? new Map<string, number>();
  const vl_intel = vl_live.scores.get("llbmIntelligence") ?? new Map<string, number>();

  // Scored targets keyed by tail; the highest display score wins a tail clash.
  const vl_byTail = new Map<string, TailTarget>();

  for (const vl_llbmId of new Set([...vl_coding.keys(), ...vl_intel.keys()])) {
    const vl_score = vl_coding.get(vl_llbmId) ?? vl_intel.get(vl_llbmId) ?? null;
    const vl_key = fh_tail(vl_llbmId).toLowerCase();
    const vl_existing = vl_byTail.get(vl_key);

    if (vl_existing === undefined || (vl_score ?? -1) > (vl_existing.score ?? -1)) {
      vl_byTail.set(vl_key, { llbmId: vl_llbmId, score: vl_score });
    }
  }

  // Every dataset model keyed by tail (first id wins), for PENDING adoption.
  const vl_datasetByTail = new Map<string, TailTarget>();

  for (const vl_llbmId of vl_live.models) {
    const vl_key = fh_tail(vl_llbmId).toLowerCase();
    if (!vl_datasetByTail.has(vl_key)) {
      vl_datasetByTail.set(vl_key, { llbmId: vl_llbmId, score: null });
    }
  }

  const vl_catalog = f_liveCatalogIds();

  if (vl_catalog === null) {
    console.log("catalog unavailable — is the OpenCode service running?");
    return 1;
  }

  console.log(
    `scored targets: ${vl_byTail.size} (coding ${vl_coding.size}, intelligence ${vl_intel.size}) · dataset models: ${vl_datasetByTail.size} · catalog models: ${vl_catalog.length}\n`,
  );

  const vl_entries: GeneratedEntry[] = [];
  const vl_unmatched: string[] = [];

  for (const vl_catalogId of [...vl_catalog].sort()) {
    const vl_modelId = vl_catalogId.slice(vl_catalogId.indexOf("/") + 1);
    const vl_scored = fh_resolveWithFree(vl_byTail, vl_modelId);

    if (vl_scored !== undefined) {
      vl_entries.push({
        opencodeId: vl_catalogId,
        llbmId: vl_scored.target.llbmId,
        matchType: vl_scored.matchType,
        score: vl_scored.target.score,
        kind: vl_scored.matchType,
      });
      continue;
    }

    // Unscored but real: adopt as PENDING (attaches when a metric row appears).
    const vl_pending = fh_resolveWithFree(vl_datasetByTail, vl_modelId);

    if (vl_pending !== undefined) {
      vl_entries.push({
        opencodeId: vl_catalogId,
        llbmId: vl_pending.target.llbmId,
        matchType: vl_pending.matchType,
        score: null,
        kind: vl_pending.matchType === "exact" ? "PENDING" : "PENDING family",
      });
      continue;
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
    "opencode id                                   | llbm id                                      | score | kind",
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
      const vl_prefix = vl_modelId.slice(0, 4).toLowerCase();
      const vl_candidates = [...vl_all.entries()]
        .filter(([p_tail]) => p_tail.startsWith(vl_prefix))
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

    const vl_llbmId = vl_entry.llbmId === null ? "null" : `"${vl_entry.llbmId}"`;
    console.log(
      `  { opencodeId: "${vl_entry.opencodeId}", llbmId: ${vl_llbmId}, matchType: "${vl_entry.matchType}" },`,
    );
  }

  console.log("];");
  return 0;
}

process.exitCode = await fh_main();
