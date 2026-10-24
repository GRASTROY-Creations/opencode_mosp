/**
 * OpenCode model-catalog adapter.
 *
 * At runtime the TUI/server context already provides `ModelInfo` records
 * (`context.data.location.model.list()` / `context.model.list()`); this module
 * only normalizes that untrusted JSON. It deliberately does not read
 * `settings`, `headers`, `body`, or variants: those fields may contain secrets.
 */

import {
  f_fail,
  f_isRecord,
  f_ok,
  f_parseNonEmptyString,
  f_parseNullablePositiveInteger,
  f_parseNullableString,
  f_parseNullableTimestamp,
  f_parseTimestamp,
  type DomainResult,
} from "../domain/guards";
import {
  f_createModelId,
  f_validateModelRecord,
  type ModelRecord,
} from "../domain/model-record";
import {
  f_adapterFail,
  f_adapterOk,
  type AdapterResult,
  type AdapterWarning,
} from "./adapter-result";
import { f_parseOpencodePricing } from "./opencode-pricing";

export interface OpencodeModelsParseOptions {
  /** When the catalog was read; becomes each record's `lastUpdatedAt`. */
  readonly observedAt: string;
  /** Provider ID → display name. Missing entries fall back to the provider ID. */
  readonly providerNames?: Readonly<Record<string, string>>;
  /** Include `enabled: false` rows (disabled by default). */
  readonly includeDisabled?: boolean;
}

/**
 * Normalize a `/api/model` payload (or a raw `ModelInfo[]`) into domain records.
 * Invalid individual rows are skipped with warnings; a broken envelope fails.
 */
export function f_parseOpencodeModels(
  p_payload: unknown,
  p_options: OpencodeModelsParseOptions,
): AdapterResult<readonly ModelRecord[]> {
  const vl_observedAt = f_parseTimestamp(
    p_options.observedAt,
    "models.observedAt",
  );

  if (!vl_observedAt.ok) {
    return f_adapterFail(vl_observedAt.error);
  }

  const vl_rows = fh_extractCatalogRows(p_payload);

  if (!vl_rows.ok) {
    return f_adapterFail(vl_rows.error);
  }

  const vl_models: ModelRecord[] = [];
  const vl_warnings: AdapterWarning[] = [];
  const vl_seenIds = new Set<string>();

  for (const [vl_index, vl_row] of vl_rows.value.entries()) {
    if (
      f_isRecord(vl_row) &&
      vl_row.enabled === false &&
      p_options.includeDisabled !== true
    ) {
      continue;
    }

    const vl_model = fh_parseOpencodeModel(
      vl_row,
      p_options,
      vl_observedAt.value,
    );

    if (!vl_model.ok) {
      vl_warnings.push({
        code: "skipped-model",
        message: `model at index ${vl_index} skipped: ${vl_model.error}`,
      });
      continue;
    }

    if (vl_seenIds.has(vl_model.value.id)) {
      vl_warnings.push({
        code: "duplicate-model",
        message: `duplicate model ${vl_model.value.id} skipped`,
      });
      continue;
    }

    vl_seenIds.add(vl_model.value.id);
    vl_models.push(vl_model.value);
  }

  if (vl_models.length === 0 && vl_warnings.length > 0) {
    return f_adapterFail("catalog contained no valid models", vl_warnings);
  }

  return f_adapterOk(vl_models, vl_warnings);
}

function fh_extractCatalogRows(
  p_payload: unknown,
): DomainResult<readonly unknown[]> {
  if (Array.isArray(p_payload)) {
    return f_ok(p_payload);
  }

  if (f_isRecord(p_payload) && Array.isArray(p_payload.data)) {
    return f_ok(p_payload.data);
  }

  return f_fail("catalog must be an array or an object with a data array");
}

function fh_parseOpencodeModel(
  p_value: unknown,
  p_options: OpencodeModelsParseOptions,
  p_observedAt: string,
): DomainResult<ModelRecord> {
  if (!f_isRecord(p_value)) {
    return f_fail("model must be an object");
  }

  const vl_providerId = f_parseNonEmptyString(
    p_value.providerID,
    "model.providerID",
  );

  if (!vl_providerId.ok) {
    return vl_providerId;
  }

  const vl_modelId = f_parseNonEmptyString(p_value.modelID, "model.modelID");

  if (!vl_modelId.ok) {
    return vl_modelId;
  }

  // The domain key is `<providerId>/<modelId>`; each half must be slash-free.
  if (vl_providerId.value.includes("/") || vl_modelId.value.includes("/")) {
    return f_fail("model.providerID and model.modelID must not contain '/'");
  }

  if (
    p_value.enabled !== undefined &&
    p_value.enabled !== null &&
    typeof p_value.enabled !== "boolean"
  ) {
    return f_fail("model.enabled must be a boolean");
  }

  const vl_name = f_parseNonEmptyString(p_value.name, "model.name");

  if (!vl_name.ok) {
    return vl_name;
  }

  const vl_canonicalId = f_parseNullableString(
    p_value.canonical,
    "model.canonical",
  );

  if (!vl_canonicalId.ok) {
    return vl_canonicalId;
  }

  const vl_releaseDate = fh_parseReleaseDate(p_value.time);

  if (!vl_releaseDate.ok) {
    return vl_releaseDate;
  }

  const vl_contextWindow = fh_parseContextWindow(p_value.limit);

  if (!vl_contextWindow.ok) {
    return vl_contextWindow;
  }

  const vl_pricing = f_parseOpencodePricing(p_value.cost, p_observedAt);

  if (!vl_pricing.ok) {
    return vl_pricing;
  }

  const vl_providerName = fh_resolveProviderName(
    vl_providerId.value,
    p_options.providerNames,
  );

  return f_validateModelRecord({
    id: f_createModelId(vl_providerId.value, vl_modelId.value),
    modelId: vl_modelId.value,
    canonicalId: vl_canonicalId.value,
    name: vl_name.value,
    providerId: vl_providerId.value,
    providerName: vl_providerName,
    releaseDate: vl_releaseDate.value,
    contextWindow: vl_contextWindow.value,
    pricing: vl_pricing.value,
    benchmarks: [],
    source: "opencode",
    lastUpdatedAt: p_observedAt,
  });
}

function fh_parseReleaseDate(
  p_value: unknown,
): DomainResult<string | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isRecord(p_value)) {
    return f_fail("model.time must be an object");
  }

  return f_parseNullableTimestamp(p_value.released, "model.time.released");
}

function fh_parseContextWindow(
  p_value: unknown,
): DomainResult<number | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isRecord(p_value)) {
    return f_fail("model.limit must be an object");
  }

  // A registry `0` is not a meaningful context window; store it as unknown.
  const vl_context = p_value.context === 0 ? null : p_value.context;

  return f_parseNullablePositiveInteger(vl_context, "model.limit.context");
}

function fh_resolveProviderName(
  p_providerId: string,
  p_providerNames: Readonly<Record<string, string>> | undefined,
): string {
  const vl_configured = p_providerNames?.[p_providerId];

  if (vl_configured !== undefined && vl_configured.trim().length > 0) {
    return vl_configured.trim();
  }

  // The provider ID is a factual identifier, not an invented display name.
  return p_providerId;
}
