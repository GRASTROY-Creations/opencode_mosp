/**
 * OpenCode model-registry pricing adapter.
 *
 * Registry `ModelInfo.cost` entries are already expressed in USD per one
 * million tokens (`Money.USDPerMillionTokens`), so no unit conversion happens
 * here. The entry without a `tier` becomes the displayed base price; context
 * tiers are preserved separately and sorted by ascending threshold.
 *
 * Missing cost data stays unavailable (`null` amounts), never zero. A real
 * `0` is preserved and means the model is free.
 */

import {
  f_fail,
  f_isPositiveInteger,
  f_isRecord,
  f_ok,
  f_parseNullableNonNegativeNumber,
  f_parseTimestamp,
  type DomainResult,
} from "../domain/guards";
import {
  f_createUnavailablePricing,
  f_validateModelPricing,
  type ModelPricing,
  type ModelPricingTier,
} from "../domain/model-pricing";

/** Provenance label attached to registry-derived prices. */
export const k_opencodePricingSource = "opencode:model-registry";

interface ParsedCostBand {
  readonly thresholdTokens: number | null;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

/**
 * Parse one `ModelInfo.cost` array into the normalized pricing contract.
 * `p_observedAt` is when the catalog was read, not a provider price-change date.
 */
export function f_parseOpencodePricing(
  p_cost: unknown,
  p_observedAt: string,
): DomainResult<ModelPricing> {
  const vl_observedAt = f_parseTimestamp(p_observedAt, "pricing.observedAt");

  if (!vl_observedAt.ok) {
    return vl_observedAt;
  }

  if (p_cost === null || p_cost === undefined) {
    return f_ok(
      f_createUnavailablePricing(
        k_opencodePricingSource,
        vl_observedAt.value,
      ),
    );
  }

  if (!Array.isArray(p_cost)) {
    return f_fail("pricing.cost must be an array");
  }

  if (p_cost.length === 0) {
    return f_ok(
      f_createUnavailablePricing(
        k_opencodePricingSource,
        vl_observedAt.value,
      ),
    );
  }

  const vl_entries: readonly unknown[] = p_cost;
  const vl_tiers: ModelPricingTier[] = [];
  const vl_seenThresholds = new Set<number>();
  let vl_base: ParsedCostBand | null = null;

  for (const vl_entry of vl_entries) {
    const vl_band = fh_parseCostBand(vl_entry);

    if (!vl_band.ok) {
      return vl_band;
    }

    if (vl_band.value.thresholdTokens === null) {
      if (vl_base !== null) {
        return f_fail("pricing.cost contains multiple base entries");
      }

      vl_base = vl_band.value;
      continue;
    }

    if (vl_seenThresholds.has(vl_band.value.thresholdTokens)) {
      return f_fail(
        `pricing.cost contains duplicate tier size ${vl_band.value.thresholdTokens}`,
      );
    }

    vl_seenThresholds.add(vl_band.value.thresholdTokens);
    vl_tiers.push({
      contextThresholdTokens: vl_band.value.thresholdTokens,
      inputUsdPerMillionTokens: vl_band.value.input,
      outputUsdPerMillionTokens: vl_band.value.output,
      cacheReadUsdPerMillionTokens: vl_band.value.cacheRead,
      cacheWriteUsdPerMillionTokens: vl_band.value.cacheWrite,
    });
  }

  vl_tiers.sort(
    (p_left, p_right) =>
      p_left.contextThresholdTokens - p_right.contextThresholdTokens,
  );

  return f_validateModelPricing({
    inputUsdPerMillionTokens: vl_base?.input ?? null,
    outputUsdPerMillionTokens: vl_base?.output ?? null,
    cacheReadUsdPerMillionTokens: vl_base?.cacheRead ?? null,
    cacheWriteUsdPerMillionTokens: vl_base?.cacheWrite ?? null,
    currency: "USD",
    source: k_opencodePricingSource,
    observedAt: vl_observedAt.value,
    tiers: vl_tiers,
  });
}

function fh_parseCostBand(p_value: unknown): DomainResult<ParsedCostBand> {
  if (!f_isRecord(p_value)) {
    return f_fail("pricing.cost entry must be an object");
  }

  const vl_input = fh_parseRequiredMoney(p_value.input, "pricing.cost.input");

  if (!vl_input.ok) {
    return vl_input;
  }

  const vl_output = fh_parseRequiredMoney(
    p_value.output,
    "pricing.cost.output",
  );

  if (!vl_output.ok) {
    return vl_output;
  }

  const vl_cache = fh_parseCachePrices(p_value.cache);

  if (!vl_cache.ok) {
    return vl_cache;
  }

  const vl_threshold = fh_parseTierThreshold(p_value.tier);

  if (!vl_threshold.ok) {
    return vl_threshold;
  }

  return f_ok({
    thresholdTokens: vl_threshold.value,
    input: vl_input.value,
    output: vl_output.value,
    cacheRead: vl_cache.value.read,
    cacheWrite: vl_cache.value.write,
  });
}

function fh_parseRequiredMoney(
  p_value: unknown,
  p_field: string,
): DomainResult<number> {
  const vl_parsed = f_parseNullableNonNegativeNumber(p_value, p_field);

  if (!vl_parsed.ok) {
    return vl_parsed;
  }

  if (vl_parsed.value === null) {
    return f_fail(`${p_field} must be a number`);
  }

  return f_ok(vl_parsed.value);
}

interface ParsedCachePrices {
  readonly read: number | null;
  readonly write: number | null;
}

function fh_parseCachePrices(
  p_value: unknown,
): DomainResult<ParsedCachePrices> {
  if (p_value === null || p_value === undefined) {
    return f_ok({ read: null, write: null });
  }

  if (!f_isRecord(p_value)) {
    return f_fail("pricing.cost.cache must be an object");
  }

  const vl_read = f_parseNullableNonNegativeNumber(
    p_value.read,
    "pricing.cost.cache.read",
  );

  if (!vl_read.ok) {
    return vl_read;
  }

  const vl_write = f_parseNullableNonNegativeNumber(
    p_value.write,
    "pricing.cost.cache.write",
  );

  if (!vl_write.ok) {
    return vl_write;
  }

  return f_ok({ read: vl_read.value, write: vl_write.value });
}

function fh_parseTierThreshold(p_value: unknown): DomainResult<number | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isRecord(p_value)) {
    return f_fail("pricing.cost.tier must be an object");
  }

  if (p_value.type !== "context") {
    return f_fail('pricing.cost.tier.type must be "context"');
  }

  if (!f_isPositiveInteger(p_value.size)) {
    return f_fail("pricing.cost.tier.size must be a positive integer");
  }

  return f_ok(p_value.size);
}
