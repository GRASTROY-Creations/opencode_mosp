import { describe, expect, test } from "bun:test";

import {
  f_isRecord,
  f_parseEnum,
  f_parseNullableHttpUrl,
  f_parseNullableNonNegativeNumber,
  f_parseNullableTimestamp,
  f_parseTimestamp,
  type DomainResult,
} from "../../src/domain/guards";
import {
  f_findBenchmark,
  f_validateModelBenchmark,
  k_benchmarkIds,
  k_llbmMetric,
} from "../../src/domain/model-benchmark";
import {
  f_createUnavailablePricing,
  f_hasPublishedPrice,
  f_isFreeModelPricing,
  f_validateModelPricing,
} from "../../src/domain/model-pricing";
import {
  f_createModelId,
  f_getBenchmarkForModel,
  f_validateModelRecord,
} from "../../src/domain/model-record";
import {
  f_isModelSortKey,
  f_isRankingMode,
  f_isSortDirection,
  k_defaultRankingMode,
  k_defaultSortDirection,
  k_defaultSortKey,
  k_modelSortKeys,
} from "../../src/domain/model-sort";

function fh_unwrap<T>(p_result: DomainResult<T>): T {
  if (!p_result.ok) {
    throw new Error(p_result.error);
  }

  return p_result.value;
}

const k_validPricing = {
  inputUsdPerMillionTokens: 0.1,
  outputUsdPerMillionTokens: 0.5,
  cacheReadUsdPerMillionTokens: 0.01,
  cacheWriteUsdPerMillionTokens: 0.125,
  currency: "USD",
  source: "opencode:model-registry",
  observedAt: "2026-10-24T00:00:00.000Z",
  tiers: [
    {
      contextThresholdTokens: 100_000,
      inputUsdPerMillionTokens: 0.5,
      outputUsdPerMillionTokens: 2.5,
      cacheReadUsdPerMillionTokens: 0.05,
      cacheWriteUsdPerMillionTokens: 0.625,
    },
  ],
} as const;

const k_validBenchmark = {
  benchmarkId: "llbm",
  variant: k_llbmMetric,
  score: 72.5,
  scoreUnit: "percent",
  rank: 1,
  sampleCount: null,
  windowStart: null,
  windowEnd: null,
  sourceModelId: "hf/example-model",
  sourceUrl: "https://huggingface.co/example-model",
  evaluatedAt: null,
} as const;

const k_validModel = {
  id: "opencode/gpt-5-nano",
  modelId: "gpt-5-nano",
  canonicalId: null,
  name: "GPT-5 Nano",
  providerId: "opencode",
  providerName: "OpenCode",
  releaseDate: "2025-08-07T00:00:00.000Z",
  contextWindow: 400_000,
  pricing: k_validPricing,
  benchmarks: [k_validBenchmark],
  source: "opencode",
  lastUpdatedAt: "2026-10-24T00:00:00.000Z",
} as const;

describe("domain guards", () => {
  test("distinguishes JSON records from arrays, null, and primitives", () => {
    expect(f_isRecord({})).toBe(true);
    expect(f_isRecord([])).toBe(false);
    expect(f_isRecord(null)).toBe(false);
    expect(f_isRecord("text")).toBe(false);
  });

  test("canonicalizes epoch and ISO timestamps to UTC", () => {
    expect(fh_unwrap(f_parseTimestamp(0, "timestamp"))).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect(
      fh_unwrap(f_parseTimestamp("2026-10-24T12:00:00+02:00", "timestamp")),
    ).toBe("2026-10-24T10:00:00.000Z");
    expect(f_parseTimestamp("not-a-date", "timestamp").ok).toBe(false);
    expect(fh_unwrap(f_parseNullableTimestamp(undefined, "timestamp"))).toBeNull();
    expect(fh_unwrap(f_parseNullableTimestamp("", "timestamp"))).toBeNull();
  });

  test("keeps zero and rejects malformed numbers", () => {
    expect(fh_unwrap(f_parseNullableNonNegativeNumber(0, "number"))).toBe(0);
    expect(f_parseNullableNonNegativeNumber(-1, "number").ok).toBe(false);
    expect(f_parseNullableNonNegativeNumber(Number.NaN, "number").ok).toBe(false);
    expect(
      f_parseNullableNonNegativeNumber(Number.POSITIVE_INFINITY, "number").ok,
    ).toBe(false);
    expect(f_parseNullableNonNegativeNumber("1", "number").ok).toBe(false);
    expect(fh_unwrap(f_parseNullableNonNegativeNumber(null, "number"))).toBeNull();
  });

  test("parses only members of the allowed string union", () => {
    const vl_enum = fh_unwrap(
      f_parseEnum("llbm", k_benchmarkIds, "benchmarkId"),
    );

    expect(vl_enum).toBe("llbm");
    expect(f_parseEnum("other", k_benchmarkIds, "benchmarkId").ok).toBe(false);
  });

  test("accepts http(s) URLs only and preserves the original value", () => {
    expect(
      fh_unwrap(f_parseNullableHttpUrl("https://example.com/x", "url")),
    ).toBe("https://example.com/x");
    expect(f_parseNullableHttpUrl("ftp://example.com", "url").ok).toBe(false);
    expect(f_parseNullableHttpUrl("not a url", "url").ok).toBe(false);
    expect(fh_unwrap(f_parseNullableHttpUrl(null, "url"))).toBeNull();
  });
});

describe("pricing contract", () => {
  test("represents unavailable pricing without fabricating zero", () => {
    const vl_pricing = f_createUnavailablePricing(null, null);

    expect(vl_pricing.inputUsdPerMillionTokens).toBeNull();
    expect(vl_pricing.outputUsdPerMillionTokens).toBeNull();
    expect(vl_pricing.tiers).toEqual([]);
    expect(vl_pricing.currency).toBe("USD");
    expect(f_hasPublishedPrice(vl_pricing)).toBe(false);
    expect(f_isFreeModelPricing(vl_pricing)).toBe(false);
  });

  test("distinguishes a free model from missing prices", () => {
    const vl_free = fh_unwrap(
      f_validateModelPricing({
        ...k_validPricing,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        cacheReadUsdPerMillionTokens: 0,
        cacheWriteUsdPerMillionTokens: 0,
        tiers: [],
      }),
    );
    const vl_missing = f_createUnavailablePricing(null, null);
    const vl_partial = fh_unwrap(
      f_validateModelPricing({
        ...k_validPricing,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: null,
        tiers: [],
      }),
    );

    expect(f_isFreeModelPricing(vl_free)).toBe(true);
    expect(f_isFreeModelPricing(vl_missing)).toBe(false);
    expect(f_isFreeModelPricing(vl_partial)).toBe(false);
  });

  test("keeps published zero prices as zero", () => {
    const vl_zero = fh_unwrap(
      f_validateModelPricing({
        ...k_validPricing,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        tiers: [],
      }),
    );

    expect(vl_zero.inputUsdPerMillionTokens).toBe(0);
    expect(vl_zero.outputUsdPerMillionTokens).toBe(0);
  });

  test("counts tier prices as published while base prices are missing", () => {
    const vl_tierOnly = fh_unwrap(
      f_validateModelPricing({
        ...k_validPricing,
        inputUsdPerMillionTokens: null,
        outputUsdPerMillionTokens: null,
      }),
    );

    expect(f_hasPublishedPrice(vl_tierOnly)).toBe(true);
    expect(f_isFreeModelPricing(vl_tierOnly)).toBe(false);
  });

  test("preserves context-tier metadata", () => {
    const vl_pricing = fh_unwrap(f_validateModelPricing(k_validPricing));

    expect(vl_pricing.tiers).toHaveLength(1);
    expect(vl_pricing.tiers[0]?.contextThresholdTokens).toBe(100_000);
    expect(vl_pricing.tiers[0]?.inputUsdPerMillionTokens).toBe(0.5);
    expect(vl_pricing.tiers[0]?.outputUsdPerMillionTokens).toBe(2.5);
  });

  test("rejects negative prices, unknown currencies, and bad tiers", () => {
    expect(
      f_validateModelPricing({ ...k_validPricing, inputUsdPerMillionTokens: -0.1 })
        .ok,
    ).toBe(false);
    expect(
      f_validateModelPricing({ ...k_validPricing, currency: "EUR" }).ok,
    ).toBe(false);
    expect(
      f_validateModelPricing({
        ...k_validPricing,
        tiers: [
          {
            ...k_validPricing.tiers[0],
            contextThresholdTokens: 0,
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      f_validateModelPricing({ ...k_validPricing, tiers: undefined }).ok,
    ).toBe(false);
  });
});

describe("benchmark contract", () => {
  test("keeps score and rank separate", () => {
    const vl_benchmark = fh_unwrap(
      f_validateModelBenchmark(k_validBenchmark),
    );

    expect(vl_benchmark.score).toBe(72.5);
    expect(vl_benchmark.rank).toBe(1);
    expect(vl_benchmark.variant).toBe(k_llbmMetric);
    expect(vl_benchmark.scoreUnit).toBe("percent");
  });

  test("defaults matchType to null and accepts reviewed kinds", () => {
    const vl_benchmark = fh_unwrap(f_validateModelBenchmark(k_validBenchmark));
    expect(vl_benchmark.matchType).toBeNull();

    const vl_proxy = fh_unwrap(
      f_validateModelBenchmark({ ...k_validBenchmark, matchType: "family_fallback" }),
    );
    expect(vl_proxy.matchType).toBe("family_fallback");

    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, matchType: "guessed" }).ok,
    ).toBe(false);
  });

  test("treats zero as a real score and null rank as unranked", () => {
    const vl_zero = fh_unwrap(
      f_validateModelBenchmark({
        ...k_validBenchmark,
        score: 0,
        rank: null,
      }),
    );

    expect(vl_zero.score).toBe(0);
    expect(vl_zero.rank).toBeNull();
    expect(f_findBenchmark([vl_zero], "llbm")?.score).toBe(0);
    expect(f_findBenchmark([vl_zero], "llbm")?.rank).toBeNull();
  });

  test("rejects scores outside 0-100 and malformed ranks", () => {
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, score: 101 }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, score: -1 }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, rank: 0 }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, rank: 1.5 }).ok,
    ).toBe(false);
  });

  test("rejects inverted windows, bad URLs, and empty variants", () => {
    expect(
      f_validateModelBenchmark({
        ...k_validBenchmark,
        windowStart: "2025-01-02T00:00:00.000Z",
        windowEnd: "2025-01-01T00:00:00.000Z",
      }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({
        ...k_validBenchmark,
        sourceUrl: "ftp://example.com/result",
      }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, variant: "  " }).ok,
    ).toBe(false);
    expect(
      f_validateModelBenchmark({ ...k_validBenchmark, benchmarkId: "other" }).ok,
    ).toBe(false);
  });

  test("keeps LLMBM window and sample metadata", () => {
    const vl_benchmark = fh_unwrap(
      f_validateModelBenchmark({
        ...k_validBenchmark,
        score: 49.55,
        rank: null,
        sampleCount: 1055,
        windowStart: "2023-05-08T00:00:00.000Z",
        windowEnd: "2025-04-07T00:00:00.000Z",
      }),
    );

    expect(vl_benchmark.sampleCount).toBe(1055);
    expect(vl_benchmark.windowStart).toBe("2023-05-08T00:00:00.000Z");
    expect(vl_benchmark.windowEnd).toBe("2025-04-07T00:00:00.000Z");
  });
});

describe("model record contract", () => {
  test("builds the stable domain key", () => {
    expect(f_createModelId("opencode", "gpt-5-nano")).toBe(
      "opencode/gpt-5-nano",
    );
  });

  test("validates a complete record and finds its benchmarks", () => {
    const vl_record = fh_unwrap(f_validateModelRecord(k_validModel));

    expect(vl_record.id).toBe("opencode/gpt-5-nano");
    expect(vl_record.pricing.inputUsdPerMillionTokens).toBe(0.1);
    expect(vl_record.benchmarks).toHaveLength(1);
    expect(f_getBenchmarkForModel(vl_record, "llbm")?.score).toBe(72.5);
    expect(f_getBenchmarkForModel(vl_record, "llbm")?.benchmarkId).toBe("llbm");
  });

  test("accepts a model with no price and no benchmark results", () => {
    const vl_record = fh_unwrap(
      f_validateModelRecord({
        ...k_validModel,
        canonicalId: null,
        releaseDate: null,
        contextWindow: null,
        pricing: f_createUnavailablePricing(null, null),
        benchmarks: [],
      }),
    );

    expect(vl_record.pricing.inputUsdPerMillionTokens).toBeNull();
    expect(vl_record.benchmarks).toHaveLength(0);
    expect(f_getBenchmarkForModel(vl_record, "llbm")).toBeNull();
  });

  test("rejects duplicate benchmark entries", () => {
    expect(
      f_validateModelRecord({
        ...k_validModel,
        benchmarks: [
          k_validBenchmark,
          { ...k_validBenchmark, variant: "llbm-coding" },
        ],
      }).ok,
    ).toBe(false);
  });

  test("rejects id mismatches and invalid metadata", () => {
    expect(
      f_validateModelRecord({ ...k_validModel, id: "opencode/other" }).ok,
    ).toBe(false);
    expect(
      f_validateModelRecord({ ...k_validModel, source: "scraped" }).ok,
    ).toBe(false);
    expect(
      f_validateModelRecord({ ...k_validModel, contextWindow: 0 }).ok,
    ).toBe(false);
    expect(
      f_validateModelRecord({ ...k_validModel, lastUpdatedAt: "yesterday" }).ok,
    ).toBe(false);
    expect(
      f_validateModelRecord({ ...k_validModel, pricing: null }).ok,
    ).toBe(false);
  });
});

describe("sort vocabulary", () => {
  test("exposes the specification defaults", () => {
    expect(k_defaultSortKey).toBe("llbmRank");
    expect(k_defaultSortDirection).toBe("asc");
    expect(k_defaultRankingMode).toBe("llbm");
  });

  test("guards every supported value and rejects unknown ones", () => {
    for (const vl_key of k_modelSortKeys) {
      expect(f_isModelSortKey(vl_key)).toBe(true);
    }

    expect(f_isModelSortKey("gpqa")).toBe(false);
    expect(f_isRankingMode("llbm")).toBe(true);
    expect(f_isRankingMode("gpqa")).toBe(false);
    expect(f_isRankingMode("llbmScore")).toBe(false);
    expect(f_isSortDirection("asc")).toBe(true);
    expect(f_isSortDirection("desc")).toBe(true);
    expect(f_isSortDirection("up")).toBe(false);
  });
});
