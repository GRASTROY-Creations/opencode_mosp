/**
 * models.dev catalog crosswalk adapter (Adjustment 16).
 *
 * `https://models.dev/api.json` is the canonical public dataset the OpenCode
 * catalog itself is generated from (owner directive 2026-10-25). The panel
 * keeps the host location registry authoritative for names, pricing, and
 * context windows; models.dev is stored ONLY as a trimmed crosswalk
 * `opencode/<modelId> -> { name, family, releaseDate }` so the future
 * benchmark-mapping stage can bridge registry ids to real model identities.
 *
 * Verified shape (2026-10-25 probe): top-level keys are provider ids; the
 * `opencode` provider holds ~130 model entries keyed by model id, each with
 * `name`, `family`, `release_date` plus fields we deliberately ignore
 * (cost/limit stay owned by the host registry).
 */

import { f_adapterFail, f_adapterOk, type AdapterResult } from "./adapter-result";
import { f_fetchJsonWithRetry, type FetchJsonRetryOptions } from "../utils/fetch-json";
import {
  f_isRecord,
  f_parseNonEmptyString,
  f_parseNullableString,
  f_parseNullableTimestamp,
  type DomainResult,
} from "../domain/guards";

export const k_modelsDevUrl = "https://models.dev/api.json";

/** Provider namespace the crosswalk is limited to. */
export const k_modelsDevProviderId = "opencode";

/** Trimmed metadata kept per registry model id. */
export interface ModelsDevModelMeta {
  readonly name: string;
  readonly family: string | null;
  readonly releaseDate: string | null;
}

/** Stable registry key (`opencode/<modelId>`) -> metadata. */
export type ModelsDevCrosswalk = Readonly<Record<string, ModelsDevModelMeta>>;

/** Validate one models.dev model entry into crosswalk metadata. */
export function f_parseModelsDevMeta(p_value: unknown): DomainResult<ModelsDevModelMeta> {
  if (!f_isRecord(p_value)) {
    return { ok: false, error: "models.dev model entry is not an object" };
  }

  const vl_name = f_parseNonEmptyString(p_value.name, "models.dev.name");
  if (!vl_name.ok) {
    return vl_name;
  }

  const vl_family = f_parseNullableString(p_value.family, "models.dev.family");
  if (!vl_family.ok) {
    return vl_family;
  }

  const vl_release = f_parseNullableTimestamp(
    p_value.release_date,
    "models.dev.release_date",
  );
  if (!vl_release.ok) {
    return vl_release;
  }

  return {
    ok: true,
    value: { name: vl_name.value, family: vl_family.value, releaseDate: vl_release.value },
  };
}

/**
 * Parse the raw api.json payload into the trimmed crosswalk. Unknown or
 * invalid entries are skipped with warnings; a missing/empty `opencode`
 * provider fails the whole source.
 */
export function f_parseModelsDevCrosswalk(p_payload: unknown): AdapterResult<ModelsDevCrosswalk> {
  if (!f_isRecord(p_payload)) {
    return f_adapterFail("models.dev payload is not an object");
  }

  const vl_provider = p_payload[k_modelsDevProviderId];

  if (!f_isRecord(vl_provider)) {
    return f_adapterFail(`models.dev provider "${k_modelsDevProviderId}" is missing`);
  }

  const vl_models = vl_provider.models;

  if (!f_isRecord(vl_models)) {
    return f_adapterFail("models.dev opencode.models is missing");
  }

  const vl_crosswalk: Record<string, ModelsDevModelMeta> = {};
  const vl_warnings: { code: string; message: string }[] = [];

  for (const [vl_modelId, vl_entry] of Object.entries(vl_models)) {
    if (vl_modelId.length === 0 || vl_modelId.includes("/")) {
      vl_warnings.push({
        code: "skipped-model",
        message: "models.dev model key is not a plain model id",
      });
      continue;
    }

    const vl_meta = f_parseModelsDevMeta(vl_entry);

    if (!vl_meta.ok) {
      vl_warnings.push({
        code: "skipped-model",
        message: `skipped models.dev model "${vl_modelId}": ${vl_meta.error}`,
      });
      continue;
    }

    vl_crosswalk[`${k_modelsDevProviderId}/${vl_modelId}`] = vl_meta.value;
  }

  if (Object.keys(vl_crosswalk).length === 0) {
    return f_adapterFail(
      "models.dev returned no models",
      vl_warnings,
    );
  }

  return f_adapterOk(vl_crosswalk, vl_warnings);
}

/** Fetch api.json and extract the crosswalk (network per fetch-json rules). */
export async function f_fetchModelsDevCrosswalk(
  p_options: FetchJsonRetryOptions,
): Promise<AdapterResult<ModelsDevCrosswalk>> {
  let vl_raw: unknown;

  try {
    vl_raw = await f_fetchJsonWithRetry(k_modelsDevUrl, p_options);
  } catch (p_error) {
    return f_adapterFail(
      p_error instanceof Error && p_error.message.length > 0
        ? p_error.message
        : "models.dev request failed",
    );
  }

  return f_parseModelsDevCrosswalk(vl_raw);
}
