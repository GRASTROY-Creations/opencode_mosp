/**
 * Normalized pricing contract.
 *
 * Units: USD per one million tokens, exactly as the OpenCode model registry
 * reports them (`Money.USDPerMillionTokens`). Adapters must not scale these
 * values again.
 *
 * Missing prices are `null`; a published price of `0` means the model is
 * actually free and is kept as zero. The two states must never collapse.
 */

import {
  f_fail,
  f_isPositiveInteger,
  f_isRecord,
  f_ok,
  f_parseNullableNonNegativeNumber,
  f_parseNullableString,
  f_parseNullableTimestamp,
  type DomainResult,
} from "./guards";

/** The only supported display/sort currency in 0.1.0. */
export type PricingCurrency = "USD";

/**
 * Additional context-length price band reported by the registry.
 * `contextThresholdTokens` mirrors the source's tier size and marks where the
 * band starts; the exact prompt-vs-total interpretation is documented as
 * assumed in `.docs/guide/sources/opencode-pricing.md`.
 */
export interface ModelPricingTier {
  readonly contextThresholdTokens: number;
  readonly inputUsdPerMillionTokens: number | null;
  readonly outputUsdPerMillionTokens: number | null;
  readonly cacheReadUsdPerMillionTokens: number | null;
  readonly cacheWriteUsdPerMillionTokens: number | null;
}

/** Provider-independent pricing record attached to a `ModelRecord`. */
export interface ModelPricing {
  /** Base (first-tier) input price; `null` when the provider publishes none. */
  readonly inputUsdPerMillionTokens: number | null;
  /** Base (first-tier) output price; `null` when the provider publishes none. */
  readonly outputUsdPerMillionTokens: number | null;
  readonly cacheReadUsdPerMillionTokens: number | null;
  readonly cacheWriteUsdPerMillionTokens: number | null;
  readonly currency: PricingCurrency;
  /** Provenance label, e.g. `opencode:model-registry`; `null` if unknown. */
  readonly source: string | null;
  /** When the price was observed (ISO-8601 UTC); `null` if the source has no date. */
  readonly observedAt: string | null;
  /** Extra context bands; empty when the provider has a single price. */
  readonly tiers: readonly ModelPricingTier[];
}

/**
 * Build the explicit "no published price" record. This is not a fake price:
 * every amount stays `null` and `tiers` stays empty.
 */
export function f_createUnavailablePricing(
  p_source: string | null,
  p_observedAt: string | null,
): ModelPricing {
  return {
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    currency: "USD",
    source: p_source,
    observedAt: p_observedAt,
    tiers: [],
  };
}

/** True when at least one base or tier input/output price was published. */
export function f_hasPublishedPrice(p_pricing: ModelPricing): boolean {
  if (p_pricing.inputUsdPerMillionTokens !== null || p_pricing.outputUsdPerMillionTokens !== null) {
    return true;
  }

  return p_pricing.tiers.some(
    (p_tier) =>
      p_tier.inputUsdPerMillionTokens !== null || p_tier.outputUsdPerMillionTokens !== null,
  );
}

/**
 * True only when every known input and output price (base and all tiers) is
 * exactly zero. Missing prices are *not* free: an unknown price is unknown.
 */
export function f_isFreeModelPricing(p_pricing: ModelPricing): boolean {
  if (p_pricing.inputUsdPerMillionTokens !== 0 || p_pricing.outputUsdPerMillionTokens !== 0) {
    return false;
  }

  return p_pricing.tiers.every(
    (p_tier) => p_tier.inputUsdPerMillionTokens === 0 && p_tier.outputUsdPerMillionTokens === 0,
  );
}

/**
 * Validate a normalized pricing object. External adapters construct these
 * records; this validator is the last line of defence before they reach the
 * aggregation service or UI.
 */
export function f_validateModelPricing(p_value: unknown): DomainResult<ModelPricing> {
  if (!f_isRecord(p_value)) {
    return f_fail("pricing must be an object");
  }

  const vl_input = f_parseNullableNonNegativeNumber(
    p_value.inputUsdPerMillionTokens,
    "pricing.inputUsdPerMillionTokens",
  );

  if (!vl_input.ok) {
    return vl_input;
  }

  const vl_output = f_parseNullableNonNegativeNumber(
    p_value.outputUsdPerMillionTokens,
    "pricing.outputUsdPerMillionTokens",
  );

  if (!vl_output.ok) {
    return vl_output;
  }

  const vl_cacheRead = f_parseNullableNonNegativeNumber(
    p_value.cacheReadUsdPerMillionTokens,
    "pricing.cacheReadUsdPerMillionTokens",
  );

  if (!vl_cacheRead.ok) {
    return vl_cacheRead;
  }

  const vl_cacheWrite = f_parseNullableNonNegativeNumber(
    p_value.cacheWriteUsdPerMillionTokens,
    "pricing.cacheWriteUsdPerMillionTokens",
  );

  if (!vl_cacheWrite.ok) {
    return vl_cacheWrite;
  }

  if (p_value.currency !== "USD") {
    return f_fail('pricing.currency must be "USD"');
  }

  const vl_source = f_parseNullableString(p_value.source, "pricing.source");

  if (!vl_source.ok) {
    return vl_source;
  }

  const vl_observedAt = f_parseNullableTimestamp(p_value.observedAt, "pricing.observedAt");

  if (!vl_observedAt.ok) {
    return vl_observedAt;
  }

  const vl_tiers = fh_parsePricingTiers(p_value.tiers);

  if (!vl_tiers.ok) {
    return vl_tiers;
  }

  return f_ok({
    inputUsdPerMillionTokens: vl_input.value,
    outputUsdPerMillionTokens: vl_output.value,
    cacheReadUsdPerMillionTokens: vl_cacheRead.value,
    cacheWriteUsdPerMillionTokens: vl_cacheWrite.value,
    currency: "USD",
    source: vl_source.value,
    observedAt: vl_observedAt.value,
    tiers: vl_tiers.value,
  });
}

function fh_parsePricingTiers(p_value: unknown): DomainResult<readonly ModelPricingTier[]> {
  if (!Array.isArray(p_value)) {
    return f_fail("pricing.tiers must be an array");
  }

  const vl_entries: readonly unknown[] = p_value;
  const vl_tiers: ModelPricingTier[] = [];

  for (const vl_entry of vl_entries) {
    const vl_tier = fh_parsePricingTier(vl_entry);

    if (!vl_tier.ok) {
      return vl_tier;
    }

    vl_tiers.push(vl_tier.value);
  }

  return f_ok(vl_tiers);
}

function fh_parsePricingTier(p_value: unknown): DomainResult<ModelPricingTier> {
  if (!f_isRecord(p_value)) {
    return f_fail("pricing tier must be an object");
  }

  if (!f_isPositiveInteger(p_value.contextThresholdTokens)) {
    return f_fail("pricing tier contextThresholdTokens must be a positive integer");
  }

  const vl_input = f_parseNullableNonNegativeNumber(
    p_value.inputUsdPerMillionTokens,
    "pricing tier inputUsdPerMillionTokens",
  );

  if (!vl_input.ok) {
    return vl_input;
  }

  const vl_output = f_parseNullableNonNegativeNumber(
    p_value.outputUsdPerMillionTokens,
    "pricing tier outputUsdPerMillionTokens",
  );

  if (!vl_output.ok) {
    return vl_output;
  }

  const vl_cacheRead = f_parseNullableNonNegativeNumber(
    p_value.cacheReadUsdPerMillionTokens,
    "pricing tier cacheReadUsdPerMillionTokens",
  );

  if (!vl_cacheRead.ok) {
    return vl_cacheRead;
  }

  const vl_cacheWrite = f_parseNullableNonNegativeNumber(
    p_value.cacheWriteUsdPerMillionTokens,
    "pricing tier cacheWriteUsdPerMillionTokens",
  );

  if (!vl_cacheWrite.ok) {
    return vl_cacheWrite;
  }

  return f_ok({
    contextThresholdTokens: p_value.contextThresholdTokens,
    inputUsdPerMillionTokens: vl_input.value,
    outputUsdPerMillionTokens: vl_output.value,
    cacheReadUsdPerMillionTokens: vl_cacheRead.value,
    cacheWriteUsdPerMillionTokens: vl_cacheWrite.value,
  });
}
