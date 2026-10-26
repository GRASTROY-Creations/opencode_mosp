import { describe, expect, test } from "bun:test";

import type { ModelBenchmark } from "../../src/domain/model-benchmark";
import type { ModelRecord } from "../../src/domain/model-record";
import type { SourceId } from "../../src/domain/source-status";
import type { ModelsDevCrosswalk } from "../../src/providers/models-dev";
import { f_adapterFail, f_adapterOk } from "../../src/providers/adapter-result";
import { f_createMemoryCache, type OverviewCache } from "../../src/services/cache";
import {
  f_getModelOverview,
  f_getModelOverviewFromHost,
  f_getOverviewStatus,
  f_mergeModelSources,
  f_refreshModelOverview,
  f_resolveRequestTimeoutMs,
  k_defaultRequestTimeoutMs,
} from "../../src/services/model-overview";
import { f_createTestBenchmark, f_createTestModel } from "./test-models";

const k_now = new Date("2026-10-24T12:00:00.000Z");
const k_ttlMs = 6 * 60 * 60 * 1000;
const f_now = (): Date => k_now;

function fh_createReadyModels(): readonly ModelRecord[] {
  return [
    f_createTestModel({
      modelId: "alpha",
      name: "Alpha",
      inputPrice: 0,
      outputPrice: 0,
    }),
    f_createTestModel({
      modelId: "beta",
      name: "Beta",
      inputPrice: 3,
      outputPrice: 4,
    }),
  ];
}

function fh_createLlbmRowsAlpha(): readonly ModelBenchmark[] {
  return [
    f_createTestBenchmark("llbmCoding", 80, {
      sourceModelId: "test/alpha",
    }),
    f_createTestBenchmark("llbmCoding", 60, {
      sourceModelId: "test/beta",
    }),
  ];
}

function fh_createCrosswalk(): ModelsDevCrosswalk {
  return {
    "test/alpha": { name: "Alpha", family: null, releaseDate: null },
  };
}

async function fh_writeCache(
  p_cache: OverviewCache,
  p_source: SourceId,
  p_payload: unknown,
  p_fetchedAt: Date = k_now,
  p_ttlMs: number = k_ttlMs,
): Promise<void> {
  const vl_result = await p_cache.write(p_source, p_payload, p_fetchedAt, p_ttlMs);

  if (!vl_result.ok) {
    throw new Error(`test cache seed failed: ${vl_result.error}`);
  }
}

async function fh_seedReadyCache(p_cache: OverviewCache): Promise<void> {
  await fh_writeCache(p_cache, "opencode-models", fh_createReadyModels());
  await fh_writeCache(p_cache, "llbm", fh_createLlbmRowsAlpha());
  await fh_writeCache(p_cache, "models-dev", fh_createCrosswalk());
}

describe("f_getModelOverview", () => {
  test("assembles a ready snapshot from cache without loaders", async () => {
    const vl_cache = f_createMemoryCache();
    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.status.state).toBe("ready");
    expect(vl_snapshot.status.lastRefreshAt).toBe(k_now.toISOString());
    expect(vl_snapshot.status.sources.map((p_source) => p_source.source)).toEqual([
      "opencode-models",
      "opencode-pricing",
      "llbm",
      "models-dev",
    ]);
    expect(vl_snapshot.status.sources.every((p_source) => p_source.state === "fresh")).toBe(true);
    expect(vl_snapshot.matches).toHaveLength(2);
    expect(vl_snapshot.warnings).toEqual([]);

    const vl_alpha = vl_snapshot.models.find((p_model) => p_model.modelId === "alpha");
    const vl_beta = vl_snapshot.models.find((p_model) => p_model.modelId === "beta");

    // Only reported scores are attached; no rank is derived.
    expect(vl_alpha?.benchmarks[0]?.score).toBe(80);
    expect(vl_beta?.benchmarks[0]?.score).toBe(60);
    expect(vl_alpha?.benchmarks[0]).not.toHaveProperty("rank");
  });

  test("returns idle when no cache entry exists", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_snapshot.models).toEqual([]);
    expect(vl_snapshot.matches).toEqual([]);
    expect(vl_snapshot.status.state).toBe("idle");
    expect(vl_snapshot.status.lastRefreshAt).toBeNull();
    expect(vl_snapshot.status.sources.every((p_source) => p_source.state === "unavailable")).toBe(
      true,
    );
  });

  test("marks pricing unavailable when no model publishes a price", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_models = [f_createTestModel({ modelId: "free-unknown" })];

    await fh_writeCache(vl_cache, "opencode-models", vl_models);
    await fh_writeCache(vl_cache, "llbm", fh_createLlbmRowsAlpha());

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });
    const vl_pricing = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-pricing",
    );

    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_pricing?.state).toBe("unavailable");
    expect(vl_pricing?.lastSuccessAt).toBeNull();
    expect(vl_snapshot.models).toHaveLength(1);
  });

  test("keeps usable rows when one cached benchmark payload is invalid", async () => {
    const vl_cache = f_createMemoryCache();

    await fh_writeCache(vl_cache, "opencode-models", fh_createReadyModels());
    await fh_writeCache(vl_cache, "llbm", [{ broken: true }]);

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_snapshot.models).toHaveLength(2);
  });

  test("fails cleanly when the cached model payload is invalid", async () => {
    const vl_cache = f_createMemoryCache();

    await fh_writeCache(vl_cache, "opencode-models", [{ id: "broken" }]);
    await fh_writeCache(vl_cache, "llbm", fh_createLlbmRowsAlpha());

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_snapshot.models).toEqual([]);
    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.status.sources[0]?.error).toBe("cached model data is invalid");
  });
});

describe("f_refreshModelOverview", () => {
  test("refreshes every missing source and writes the cache", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_models = fh_createReadyModels();
    const vl_llbm = fh_createLlbmRowsAlpha();
    let vl_modelCalls = 0;
    let vl_llbmCalls = 0;

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(vl_models));
      },
      loadLlbm: () => {
        vl_llbmCalls += 1;
        return Promise.resolve(f_adapterOk(vl_llbm));
      },
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_modelCalls).toBe(1);
    expect(vl_llbmCalls).toBe(1);
    expect(vl_snapshot.status.state).toBe("ready");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(2);
    expect(vl_snapshot.warnings).toEqual([]);

    for (const vl_source of ["opencode-models", "llbm", "models-dev"] as const) {
      const vl_cached = await vl_cache.read(vl_source, k_now);
      expect(vl_cached.ok).toBe(true);
    }

    const vl_cachedSnapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });
    expect(vl_cachedSnapshot.status.state).toBe("ready");
    expect(vl_cachedSnapshot.models.map((p_model) => p_model.id)).toEqual(
      vl_snapshot.models.map((p_model) => p_model.id),
    );
  });

  test("keeps models when LLMBM fails", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () => Promise.resolve(f_adapterOk(fh_createReadyModels())),
      loadLlbm: () =>
        Promise.resolve(
          f_adapterFail<readonly ModelBenchmark[]>("llbm is down", [
            { code: "http", message: "llbm is down" },
          ]),
        ),
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    const vl_llbm = vl_snapshot.status.sources.find((p_source) => p_source.source === "llbm");

    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_llbm?.state).toBe("error");
    expect(vl_llbm?.error).toBe("llbm is down");
    expect(vl_snapshot.warnings).toEqual([
      { source: "llbm", code: "http", message: "llbm is down" },
    ]);
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(0);
  });

  test("serves the last-known-good catalog as stale when the model refresh fails", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_later = new Date(k_now.getTime() + 2_000);
    let vl_llbmCalls = 0;

    await fh_writeCache(vl_cache, "opencode-models", fh_createReadyModels(), k_now, 1_000);
    await fh_writeCache(vl_cache, "llbm", fh_createLlbmRowsAlpha());

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: () => vl_later,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => Promise.resolve(f_adapterFail<readonly ModelRecord[]>("registry is down")),
      loadLlbm: () => {
        vl_llbmCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha()));
      },
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    const vl_models = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-models",
    );
    const vl_pricing = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-pricing",
    );

    expect(vl_snapshot.status.state).toBe("stale");
    expect(vl_models?.state).toBe("stale");
    expect(vl_pricing?.state).toBe("stale");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_llbmCalls).toBe(0);

    const vl_cachedSnapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });
    expect(vl_cachedSnapshot.models).toHaveLength(2);
    expect(vl_cachedSnapshot.status.state).toBe("ready");
  });

  test("fails with no cache when the first model refresh fails", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () => Promise.resolve(f_adapterFail<readonly ModelRecord[]>("registry down")),
      loadLlbm: () => Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha())),
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.models).toEqual([]);
  });

  test("treats an empty successful payload as a failure", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () => Promise.resolve(f_adapterOk([])),
      loadLlbm: () => Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha())),
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.status.sources[0]?.error).toBe("model catalog returned no models");
  });

  test("preserves last-known-good when an empty payload arrives", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_later = new Date(k_now.getTime() + 2_000);

    await fh_writeCache(vl_cache, "opencode-models", fh_createReadyModels(), k_now, 1_000);
    await fh_writeCache(vl_cache, "llbm", fh_createLlbmRowsAlpha());

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: () => vl_later,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => Promise.resolve(f_adapterOk([])),
      loadLlbm: () => Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha())),
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.status.state).toBe("stale");
  });

  test("skips loaders when all caches are fresh", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_modelCalls = 0;
    let vl_llbmCalls = 0;

    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createReadyModels()));
      },
      loadLlbm: () => {
        vl_llbmCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha()));
      },
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_modelCalls).toBe(0);
    expect(vl_llbmCalls).toBe(0);
    expect(vl_snapshot.models).toHaveLength(2);
  });

  test("forces all loaders when requested", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_modelCalls = 0;
    let vl_llbmCalls = 0;

    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      force: true,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createReadyModels()));
      },
      loadLlbm: () => {
        vl_llbmCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha()));
      },
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_modelCalls).toBe(1);
    expect(vl_llbmCalls).toBe(1);
    expect(vl_snapshot.status.state).toBe("ready");
  });

  test("deduplicates concurrent refreshes", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_modelCalls = 0;
    let vl_llbmCalls = 0;

    const vl_options = {
      cache: vl_cache,
      now: f_now,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createReadyModels()));
      },
      loadLlbm: () => {
        vl_llbmCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha()));
      },
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    };

    const [vl_a, vl_b, vl_c] = await Promise.all([
      f_refreshModelOverview(vl_options),
      f_refreshModelOverview(vl_options),
      f_refreshModelOverview(vl_options),
    ]);

    expect(vl_modelCalls).toBe(1);
    expect(vl_llbmCalls).toBe(1);
    expect(vl_a.status).toEqual(vl_b.status);
    expect(vl_b.status).toEqual(vl_c.status);
  });

  test("returns data despite a failing cache write", async () => {
    let vl_writeFailures = 0;

    const vl_failingCache: OverviewCache = {
      key: "failing",
      read(p_source, p_now) {
        return Promise.resolve({ ok: false, reason: "missing" });
      },
      write(p_source, p_payload, p_fetchedAt, p_ttlMs) {
        vl_writeFailures += 1;
        return Promise.resolve({ ok: false, error: "write failed" });
      },
    };

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_failingCache,
      now: f_now,
      loadModels: () => Promise.resolve(f_adapterOk(fh_createReadyModels())),
      loadLlbm: () => Promise.resolve(f_adapterOk(fh_createLlbmRowsAlpha())),
      loadModelsDev: () => Promise.resolve(f_adapterOk(fh_createCrosswalk())),
    });

    expect(vl_snapshot.status.state).toBe("ready");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_writeFailures).toBe(3);
    expect(vl_snapshot.warnings.filter((p_w) => p_w.code === "cache-write")).toHaveLength(3);
  });

  test("sanitizes loader exceptions", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () => Promise.reject(new Error("boom")),
      loadLlbm: () => Promise.reject(new Error("crash")),
      loadModelsDev: () => Promise.reject(new Error("fail")),
    });

    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.models).toEqual([]);
  });
});

describe("f_getOverviewStatus", () => {
  test("reads cache and builds status without network", async () => {
    const vl_cache = f_createMemoryCache();
    await fh_seedReadyCache(vl_cache);

    const vl_status = await f_getOverviewStatus({ cache: vl_cache, now: f_now });

    expect(vl_status.state).toBe("ready");
    expect(vl_status.lastRefreshAt).toBe(k_now.toISOString());
    expect(vl_status.sources.length).toBe(4);
    expect(vl_status.sources[0]?.source).toBe("opencode-models");
    expect(vl_status.sources[1]?.source).toBe("opencode-pricing");
    expect(vl_status.sources[2]?.source).toBe("llbm");
    expect(vl_status.sources[3]?.source).toBe("models-dev");
    expect(vl_status.sources.every((p_s) => p_s.state === "fresh")).toBe(true);
  });
});

describe("f_mergeModelSources", () => {
  test("fills missing metadata from later sources", () => {
    const vl_first: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/merge-a",
        modelId: "merge-a",
        providerId: "opencode",
        name: "First",
        canonicalId: null,
        releaseDate: null,
        contextWindow: null,
      }),
    ];
    const vl_second: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/merge-a",
        modelId: "merge-a",
        providerId: "opencode",
        name: "Second",
        canonicalId: "canon-a",
        releaseDate: "2025-01-01T00:00:00.000Z",
        contextWindow: 100_000,
      }),
    ];

    const vl_merged = f_mergeModelSources([vl_first, vl_second]);

    expect(vl_merged).toHaveLength(1);
    expect(vl_merged[0]?.name).toBe("First");
    expect(vl_merged[0]?.canonicalId).toBe("canon-a");
    expect(vl_merged[0]?.releaseDate).toBe("2025-01-01T00:00:00.000Z");
    expect(vl_merged[0]?.contextWindow).toBe(100_000);
    expect(vl_merged[0]?.source).toBe("merged");
  });

  test("merges pricing fields and tiers by threshold", () => {
    const vl_first: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/price-a",
        modelId: "price-a",
        providerId: "opencode",
        inputPrice: 1,
        outputPrice: 2,
        tiers: [
          {
            contextThresholdTokens: 50_000,
            inputUsdPerMillionTokens: 3,
            outputUsdPerMillionTokens: 4,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
          },
        ],
      }),
    ];
    const vl_second: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/price-a",
        modelId: "price-a",
        providerId: "opencode",
        inputPrice: 5,
        outputPrice: 6,
        tiers: [
          {
            contextThresholdTokens: 50_000,
            inputUsdPerMillionTokens: 7,
            outputUsdPerMillionTokens: 8,
            cacheReadUsdPerMillionTokens: 9,
            cacheWriteUsdPerMillionTokens: 10,
          },
        ],
      }),
    ];

    const vl_merged = f_mergeModelSources([vl_first, vl_second]);

    expect(vl_merged[0]?.pricing.inputUsdPerMillionTokens).toBe(1);
    expect(vl_merged[0]?.pricing.outputUsdPerMillionTokens).toBe(2);
    expect(vl_merged[0]?.pricing.tiers).toHaveLength(1);
    expect(vl_merged[0]?.pricing.tiers[0]?.inputUsdPerMillionTokens).toBe(3);
    expect(vl_merged[0]?.pricing.tiers[0]?.outputUsdPerMillionTokens).toBe(4);
    expect(vl_merged[0]?.pricing.tiers[0]?.cacheReadUsdPerMillionTokens).toBe(9);
    expect(vl_merged[0]?.pricing.tiers[0]?.cacheWriteUsdPerMillionTokens).toBe(10);
  });

  test("unions benchmarks by benchmarkId and prefers scored rows", () => {
    const vl_first: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/bench-a",
        modelId: "bench-a",
        providerId: "opencode",
        benchmarks: [
          f_createTestBenchmark("llbmCoding", 50),
          f_createTestBenchmark("llbmCoding", null, { sourceModelId: "bench-a" }),
        ],
      }),
    ];
    const vl_second: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/bench-a",
        modelId: "bench-a",
        providerId: "opencode",
        benchmarks: [f_createTestBenchmark("llbmCoding", 70, { sourceModelId: "bench-a" })],
      }),
    ];

    const vl_merged = f_mergeModelSources([vl_first, vl_second]);

    expect(vl_merged[0]?.benchmarks).toHaveLength(1);
    expect(vl_merged[0]?.benchmarks[0]?.score).toBe(70);
  });

  test("sets merged source only for duplicated IDs", () => {
    const vl_first: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/a",
        modelId: "a",
        providerId: "opencode",
        source: "opencode",
      }),
    ];
    const vl_second: readonly ModelRecord[] = [
      f_createTestModel({
        id: "opencode/a",
        modelId: "a",
        providerId: "opencode",
        source: "opencode",
      }),
      f_createTestModel({
        id: "opencode/b",
        modelId: "b",
        providerId: "opencode",
        source: "opencode",
      }),
    ];

    const vl_merged = f_mergeModelSources([vl_first, vl_second]);

    expect(vl_merged.find((p) => p.id === "opencode/a")?.source).toBe("merged");
    expect(vl_merged.find((p) => p.id === "opencode/b")?.source).toBe("opencode");
  });

  test("leaves input arrays unmodified", () => {
    const vl_first: readonly ModelRecord[] = [f_createTestModel()];
    const vl_second: readonly ModelRecord[] = [f_createTestModel()];

    f_mergeModelSources([vl_first, vl_second]);

    expect(vl_first).toHaveLength(1);
    expect(vl_second).toHaveLength(1);
  });
});

describe("f_resolveRequestTimeoutMs", () => {
  test("returns the default when env is missing or invalid", () => {
    expect(f_resolveRequestTimeoutMs({})).toBe(k_defaultRequestTimeoutMs);
    expect(f_resolveRequestTimeoutMs({ OPENCODE_REQUEST_TIMEOUT_MS: "0" })).toBe(
      k_defaultRequestTimeoutMs,
    );
    expect(f_resolveRequestTimeoutMs({ OPENCODE_REQUEST_TIMEOUT_MS: "not-num" })).toBe(
      k_defaultRequestTimeoutMs,
    );
  });

  test("returns the positive millisecond value", () => {
    expect(f_resolveRequestTimeoutMs({ OPENCODE_REQUEST_TIMEOUT_MS: "5000" })).toBe(5_000);
  });
});

describe("f_getModelOverviewFromHost", () => {
  test("host catalog wins and real mappings attach both metrics", async () => {
    const vl_cache = f_createMemoryCache();
    await fh_writeCache(vl_cache, "llbm", [
      f_createTestBenchmark("llbmCoding", 61.8, {
        sourceModelId: "moonshotai/kimi-k2.6",
      }),
      f_createTestBenchmark("llbmIntelligence", 27, {
        sourceModelId: "moonshotai/kimi-k2.6",
      }),
    ]);
    await fh_writeCache(vl_cache, "models-dev", fh_createCrosswalk());

    const vl_hostModel = f_createTestModel({
      id: "opencode/kimi-k2.6",
      providerId: "opencode",
      modelId: "kimi-k2.6",
      name: "Kimi K2.6",
      inputPrice: 1,
      outputPrice: 2,
      source: "opencode",
    });

    const vl_snapshot = await f_getModelOverviewFromHost({
      cache: vl_cache,
      now: f_now,
      hostModels: f_adapterOk([vl_hostModel]),
    });

    expect(vl_snapshot.models).toHaveLength(1);
    expect(vl_snapshot.matches).toHaveLength(2);
    expect(vl_snapshot.matches.every((p_match) => p_match.strategy === "mapping")).toBe(true);
    expect(vl_snapshot.matches.every((p_match) => p_match.matchType === "exact")).toBe(true);
    expect(vl_snapshot.warnings).toEqual([]);
    expect(vl_snapshot.status.state).toBe("ready");
    expect(vl_snapshot.models[0]?.modelId).toBe("kimi-k2.6");
    expect(
      vl_snapshot.models[0]?.benchmarks.map((p_row) => [p_row.benchmarkId, p_row.score]),
    ).toEqual([
      ["llbmCoding", 61.8],
      ["llbmIntelligence", 27],
    ]);
  });

  test("empty host list falls back to cached snapshot", async () => {
    const vl_cache = f_createMemoryCache();
    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_getModelOverviewFromHost({
      cache: vl_cache,
      now: f_now,
      hostModels: f_adapterOk([]),
    });

    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.warnings.some((p_w) => p_w.code === "host-catalog-fallback")).toBe(true);
  });

  test("failed host read falls back to cached snapshot", async () => {
    const vl_cache = f_createMemoryCache();
    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_getModelOverviewFromHost({
      cache: vl_cache,
      now: f_now,
      hostModels: f_adapterFail("boom"),
    });

    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.warnings.some((p_w) => p_w.message.includes("boom"))).toBe(true);
  });

  test("no cache plus host failure yields no models", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_getModelOverviewFromHost({
      cache: vl_cache,
      now: f_now,
      hostModels: f_adapterFail("boom"),
    });

    expect(vl_snapshot.models).toHaveLength(0);
  });
});
