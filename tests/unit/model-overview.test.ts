import { describe, expect, test } from "bun:test";

import type { ModelBenchmark } from "../../src/domain/model-benchmark";
import type { ModelPricingTier } from "../../src/domain/model-pricing";
import type { ModelRecord } from "../../src/domain/model-record";
import type { SourceId } from "../../src/domain/source-status";
import {
  f_adapterFail,
  f_adapterOk,
} from "../../src/providers/adapter-result";
import { f_createMemoryCache, type OverviewCache } from "../../src/services/cache";
import {
  f_getModelOverview,
  f_getOverviewStatus,
  f_mergeModelSources,
  f_refreshModelOverview,
  f_resolveRequestTimeoutMs,
  k_defaultRequestTimeoutMs,
} from "../../src/services/model-overview";
import {
  f_createTestBenchmark,
  f_createTestModel,
} from "./test-models";

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

function fh_createGpqaRows(): readonly ModelBenchmark[] {
  return [
    f_createTestBenchmark("gpqa", 80, {
      sourceModelId: "test/alpha",
    }),
  ];
}

function fh_createLiveCodeBenchRows(): readonly ModelBenchmark[] {
  return [
    f_createTestBenchmark("livecodebench", 60, {
      sourceModelId: "test/beta",
      sampleCount: 454,
      windowStart: "2024-08-01T00:00:00.000Z",
      windowEnd: "2025-05-01T00:00:00.000Z",
    }),
  ];
}

async function fh_writeCache(
  p_cache: OverviewCache,
  p_source: SourceId,
  p_payload: unknown,
  p_fetchedAt: Date = k_now,
  p_ttlMs: number = k_ttlMs,
): Promise<void> {
  const vl_result = await p_cache.write(
    p_source,
    p_payload,
    p_fetchedAt,
    p_ttlMs,
  );

  if (!vl_result.ok) {
    throw new Error(`test cache seed failed: ${vl_result.error}`);
  }
}

async function fh_seedReadyCache(p_cache: OverviewCache): Promise<void> {
  await fh_writeCache(p_cache, "opencode-models", fh_createReadyModels());
  await fh_writeCache(p_cache, "gpqa", fh_createGpqaRows());
  await fh_writeCache(
    p_cache,
    "livecodebench",
    fh_createLiveCodeBenchRows(),
  );
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
    expect(
      vl_snapshot.status.sources.map((p_source) => p_source.source),
    ).toEqual([
      "opencode-models",
      "opencode-pricing",
      "gpqa",
      "livecodebench",
    ]);
    expect(
      vl_snapshot.status.sources.every(
        (p_source) => p_source.state === "fresh",
      ),
    ).toBe(true);
    expect(vl_snapshot.matches).toHaveLength(2);
    expect(vl_snapshot.warnings).toEqual([]);

    const vl_alpha = vl_snapshot.models.find(
      (p_model) => p_model.modelId === "alpha",
    );
    const vl_beta = vl_snapshot.models.find(
      (p_model) => p_model.modelId === "beta",
    );

    expect(vl_alpha?.benchmarks[0]?.rank).toBe(1);
    expect(vl_beta?.benchmarks[0]?.rank).toBe(1);
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
    expect(
      vl_snapshot.status.sources.every(
        (p_source) => p_source.state === "unavailable",
      ),
    ).toBe(true);
  });

  test("marks pricing unavailable when no model publishes a price", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_models = [
      f_createTestModel({ modelId: "free-unknown" }),
    ];

    await fh_writeCache(vl_cache, "opencode-models", vl_models);
    await fh_writeCache(vl_cache, "gpqa", fh_createGpqaRows());
    await fh_writeCache(
      vl_cache,
      "livecodebench",
      fh_createLiveCodeBenchRows(),
    );

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
    await fh_writeCache(vl_cache, "gpqa", [{ broken: true }]);
    await fh_writeCache(
      vl_cache,
      "livecodebench",
      fh_createLiveCodeBenchRows(),
    );

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });
    const vl_gpqa = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "gpqa",
    );

    expect(vl_gpqa?.state).toBe("error");
    expect(vl_gpqa?.error).toBe("cached benchmark data is invalid");
    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(1);
    expect(vl_snapshot.matches[0]?.benchmark.benchmarkId).toBe(
      "livecodebench",
    );
  });

  test("fails cleanly when the cached model payload is invalid", async () => {
    const vl_cache = f_createMemoryCache();

    await fh_writeCache(vl_cache, "opencode-models", [{ id: "broken" }]);
    await fh_writeCache(vl_cache, "gpqa", fh_createGpqaRows());
    await fh_writeCache(
      vl_cache,
      "livecodebench",
      fh_createLiveCodeBenchRows(),
    );

    const vl_snapshot = await f_getModelOverview({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_snapshot.models).toEqual([]);
    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.status.sources[0]?.error).toBe(
      "cached model data is invalid",
    );
  });
});

describe("f_refreshModelOverview", () => {
  test("refreshes every missing source and writes the cache", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_models = fh_createReadyModels();
    const vl_gpqa = fh_createGpqaRows();
    const vl_liveCodeBench = fh_createLiveCodeBenchRows();
    let vl_modelCalls = 0;
    let vl_gpqaCalls = 0;
    let vl_liveCodeBenchCalls = 0;

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(vl_models));
      },
      loadGpqa: () => {
        vl_gpqaCalls += 1;
        return Promise.resolve(f_adapterOk(vl_gpqa));
      },
      loadLiveCodeBench: () => {
        vl_liveCodeBenchCalls += 1;
        return Promise.resolve(f_adapterOk(vl_liveCodeBench));
      },
    });

    expect(vl_modelCalls).toBe(1);
    expect(vl_gpqaCalls).toBe(1);
    expect(vl_liveCodeBenchCalls).toBe(1);
    expect(vl_snapshot.status.state).toBe("ready");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(2);
    expect(vl_snapshot.warnings).toEqual([]);

    for (const vl_source of [
      "opencode-models",
      "gpqa",
      "livecodebench",
    ] as const) {
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

  test("keeps models and LiveCodeBench when GPQA fails", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () =>
        Promise.resolve(f_adapterOk(fh_createReadyModels())),
      loadGpqa: () =>
        Promise.resolve(
          f_adapterFail<readonly ModelBenchmark[]>("gpqa is down", [
            { code: "http", message: "gpqa is down" },
          ]),
        ),
      loadLiveCodeBench: () =>
        Promise.resolve(f_adapterOk(fh_createLiveCodeBenchRows())),
    });

    const vl_gpqa = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "gpqa",
    );

    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_gpqa?.state).toBe("error");
    expect(vl_gpqa?.error).toBe("gpqa is down");
    expect(vl_snapshot.warnings).toEqual([
      { source: "gpqa", code: "http", message: "gpqa is down" },
    ]);
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(1);
    expect(vl_snapshot.matches[0]?.benchmark.benchmarkId).toBe(
      "livecodebench",
    );
  });

  test("keeps models and GPQA when LiveCodeBench fails", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () =>
        Promise.resolve(f_adapterOk(fh_createReadyModels())),
      loadGpqa: () => Promise.resolve(f_adapterOk(fh_createGpqaRows())),
      loadLiveCodeBench: () =>
        Promise.resolve(
          f_adapterFail<readonly ModelBenchmark[]>(
            "livecodebench is down",
          ),
        ),
    });

    const vl_liveCodeBench = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "livecodebench",
    );

    expect(vl_snapshot.status.state).toBe("partial");
    expect(vl_liveCodeBench?.state).toBe("error");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.matches).toHaveLength(1);
    expect(vl_snapshot.matches[0]?.benchmark.benchmarkId).toBe("gpqa");
  });

  test("serves the last-known-good catalog as stale when the model refresh fails", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_later = new Date(k_now.getTime() + 2_000);
    let vl_gpqaCalls = 0;
    let vl_liveCodeBenchCalls = 0;

    await fh_writeCache(
      vl_cache,
      "opencode-models",
      fh_createReadyModels(),
      k_now,
      1_000,
    );
    await fh_writeCache(vl_cache, "gpqa", fh_createGpqaRows());
    await fh_writeCache(
      vl_cache,
      "livecodebench",
      fh_createLiveCodeBenchRows(),
    );

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: () => vl_later,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () =>
        Promise.resolve(
          f_adapterFail<readonly ModelRecord[]>("registry is down"),
        ),
      loadGpqa: () => {
        vl_gpqaCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createGpqaRows()));
      },
      loadLiveCodeBench: () => {
        vl_liveCodeBenchCalls += 1;
        return Promise.resolve(
          f_adapterOk(fh_createLiveCodeBenchRows()),
        );
      },
    });

    const vl_models = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-models",
    );
    const vl_pricing = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-pricing",
    );

    expect(vl_gpqaCalls).toBe(0);
    expect(vl_liveCodeBenchCalls).toBe(0);
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_models?.state).toBe("stale");
    expect(vl_models?.error).toBe("registry is down");
    expect(vl_models?.lastAttemptAt).toBe(vl_later.toISOString());
    expect(vl_pricing?.state).toBe("stale");
    expect(vl_snapshot.status.state).toBe("stale");
    expect(vl_snapshot.matches).toHaveLength(2);
  });

  test("returns an error when the first model refresh fails", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () =>
        Promise.resolve(
          f_adapterFail<readonly ModelRecord[]>("registry is down"),
        ),
      loadGpqa: () => Promise.resolve(f_adapterOk(fh_createGpqaRows())),
      loadLiveCodeBench: () =>
        Promise.resolve(f_adapterOk(fh_createLiveCodeBenchRows())),
    });

    expect(vl_snapshot.models).toEqual([]);
    expect(vl_snapshot.status.state).toBe("error");
    expect(vl_snapshot.status.sources[0]?.state).toBe("error");
    expect(vl_snapshot.status.sources[0]?.error).toBe("registry is down");
  });

  test("treats an empty successful payload as a failure and keeps the cache", async () => {
    const vl_cache = f_createMemoryCache();

    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      force: true,
      loadModels: () =>
        Promise.resolve(f_adapterOk<readonly ModelRecord[]>([])),
      loadGpqa: () => Promise.resolve(f_adapterOk(fh_createGpqaRows())),
      loadLiveCodeBench: () =>
        Promise.resolve(f_adapterOk(fh_createLiveCodeBenchRows())),
    });
    const vl_models = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-models",
    );

    expect(vl_models?.state).toBe("stale");
    expect(vl_models?.error).toBe("model catalog returned no models");
    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.status.state).toBe("stale");
  });

  test("skips loaders when every cache entry is fresh", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_calls = 0;

    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () => {
        vl_calls += 1;
        return Promise.reject(new Error("models should not run"));
      },
      loadGpqa: () => {
        vl_calls += 1;
        return Promise.reject(new Error("gpqa should not run"));
      },
      loadLiveCodeBench: () => {
        vl_calls += 1;
        return Promise.reject(new Error("lcb should not run"));
      },
    });

    expect(vl_calls).toBe(0);
    expect(vl_snapshot.status.state).toBe("ready");
  });

  test("force refresh bypasses fresh caches", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_calls = 0;

    await fh_seedReadyCache(vl_cache);

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      force: true,
      modelTtlMs: k_ttlMs,
      benchmarkTtlMs: k_ttlMs,
      loadModels: () => {
        vl_calls += 1;
        return Promise.resolve(f_adapterOk(fh_createReadyModels()));
      },
      loadGpqa: () => {
        vl_calls += 1;
        return Promise.resolve(f_adapterOk(fh_createGpqaRows()));
      },
      loadLiveCodeBench: () => {
        vl_calls += 1;
        return Promise.resolve(
          f_adapterOk(fh_createLiveCodeBenchRows()),
        );
      },
    });

    expect(vl_calls).toBe(3);
    expect(vl_snapshot.status.state).toBe("ready");
  });

  test("deduplicates concurrent refreshes for the same cache", async () => {
    const vl_cache = f_createMemoryCache();
    let vl_modelCalls = 0;
    let vl_gpqaCalls = 0;
    let vl_liveCodeBenchCalls = 0;

    const vl_options = {
      cache: vl_cache,
      now: f_now,
      loadModels: () => {
        vl_modelCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createReadyModels()));
      },
      loadGpqa: () => {
        vl_gpqaCalls += 1;
        return Promise.resolve(f_adapterOk(fh_createGpqaRows()));
      },
      loadLiveCodeBench: () => {
        vl_liveCodeBenchCalls += 1;
        return Promise.resolve(
          f_adapterOk(fh_createLiveCodeBenchRows()),
        );
      },
    };

    const vl_first = f_refreshModelOverview(vl_options);
    const vl_second = f_refreshModelOverview(vl_options);

    expect(vl_second).toBe(vl_first);

    await vl_first;

    expect(vl_modelCalls).toBe(1);
    expect(vl_gpqaCalls).toBe(1);
    expect(vl_liveCodeBenchCalls).toBe(1);
  });

  test("keeps data and reports a warning when the cache write fails", async () => {
    const vl_base = f_createMemoryCache();
    const vl_cache: OverviewCache = {
      key: vl_base.key,
      read: (p_source, p_now) => vl_base.read(p_source, p_now),
      write: () =>
        Promise.resolve({ ok: false, error: "cache write failed" }),
    };

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () =>
        Promise.resolve(f_adapterOk(fh_createReadyModels())),
      loadGpqa: () => Promise.resolve(f_adapterOk(fh_createGpqaRows())),
      loadLiveCodeBench: () =>
        Promise.resolve(f_adapterOk(fh_createLiveCodeBenchRows())),
    });

    expect(vl_snapshot.models).toHaveLength(2);
    expect(vl_snapshot.status.state).toBe("ready");
    expect(
      vl_snapshot.warnings.filter(
        (p_warning) => p_warning.code === "cache-write",
      ),
    ).toHaveLength(3);
  });

  test("sanitizes loader exceptions", async () => {
    const vl_cache = f_createMemoryCache();

    const vl_snapshot = await f_refreshModelOverview({
      cache: vl_cache,
      now: f_now,
      loadModels: () =>
        Promise.reject(new Error("leaked https://secret.example")),
      loadGpqa: () => Promise.resolve(f_adapterOk(fh_createGpqaRows())),
      loadLiveCodeBench: () =>
        Promise.resolve(f_adapterOk(fh_createLiveCodeBenchRows())),
    });

    const vl_models = vl_snapshot.status.sources.find(
      (p_source) => p_source.source === "opencode-models",
    );

    expect(vl_models?.state).toBe("error");
    expect(vl_models?.error).toBe("model refresh failed unexpectedly");
    expect(vl_models?.error).not.toContain("secret");
    expect(vl_snapshot.status.state).toBe("error");
  });
});

describe("f_mergeModelSources", () => {
  const k_tierFirst: ModelPricingTier = {
    contextThresholdTokens: 1_000,
    inputUsdPerMillionTokens: 1,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
  };
  const k_tierSecond: ModelPricingTier = {
    contextThresholdTokens: 1_000,
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: 2,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
  };

  test("fills metadata, pricing tiers, and benchmarks from later sources", () => {
    const vl_first = f_createTestModel({
      modelId: "shared",
      name: "First",
      canonicalId: null,
      releaseDate: null,
      contextWindow: null,
      inputPrice: 5,
      outputPrice: null,
      tiers: [k_tierFirst],
      benchmarks: [f_createTestBenchmark("gpqa", null)],
    });
    const vl_second = f_createTestModel({
      modelId: "shared",
      name: "Second",
      canonicalId: "canonical-shared",
      releaseDate: "2026-01-01T00:00:00.000Z",
      contextWindow: 200_000,
      inputPrice: null,
      outputPrice: 6,
      tiers: [k_tierSecond],
      benchmarks: [
        f_createTestBenchmark("gpqa", 80),
        f_createTestBenchmark("livecodebench", 40),
      ],
    });
    const vl_firstSource: ModelRecord = { ...vl_first, source: "opencode" };

    const vl_merged = f_mergeModelSources([
      [vl_firstSource],
      [vl_second],
    ]);

    expect(vl_merged).toHaveLength(1);

    const vl_model = vl_merged[0];

    if (vl_model === undefined) {
      throw new Error("expected a merged model");
    }

    expect(vl_model.name).toBe("First");
    expect(vl_model.canonicalId).toBe("canonical-shared");
    expect(vl_model.releaseDate).toBe("2026-01-01T00:00:00.000Z");
    expect(vl_model.contextWindow).toBe(200_000);
    expect(vl_model.pricing.inputUsdPerMillionTokens).toBe(5);
    expect(vl_model.pricing.outputUsdPerMillionTokens).toBe(6);
    expect(vl_model.pricing.tiers).toHaveLength(1);
    expect(vl_model.pricing.tiers[0]?.inputUsdPerMillionTokens).toBe(1);
    expect(vl_model.pricing.tiers[0]?.outputUsdPerMillionTokens).toBe(2);
    expect(vl_model.benchmarks.map((p_row) => p_row.benchmarkId)).toEqual([
      "gpqa",
      "livecodebench",
    ]);
    expect(vl_model.benchmarks[0]?.score).toBe(80);
    expect(vl_model.source).toBe("merged");

    // The source records are read-only inputs, not working state.
    expect(vl_firstSource.benchmarks[0]?.score).toBeNull();
    expect(vl_firstSource.canonicalId).toBeNull();
    expect(vl_firstSource.source).toBe("opencode");
  });

  test("does not mark models that appeared only once as merged", () => {
    const vl_only: ModelRecord = {
      ...f_createTestModel({ modelId: "only" }),
      source: "opencode",
    };

    const vl_merged = f_mergeModelSources([[vl_only]]);

    expect(vl_merged).toHaveLength(1);
    expect(vl_merged[0]?.source).toBe("opencode");
  });
});

describe("f_getOverviewStatus", () => {
  test("reports the latest source timestamp and per-source order", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_gpqaTime = new Date(k_now.getTime() + 1_000);
    const vl_liveCodeBenchTime = new Date(k_now.getTime() + 2_000);

    await fh_writeCache(vl_cache, "opencode-models", fh_createReadyModels());
    await fh_writeCache(
      vl_cache,
      "gpqa",
      fh_createGpqaRows(),
      vl_gpqaTime,
    );
    await fh_writeCache(
      vl_cache,
      "livecodebench",
      fh_createLiveCodeBenchRows(),
      vl_liveCodeBenchTime,
    );

    const vl_status = await f_getOverviewStatus({
      cache: vl_cache,
      now: f_now,
    });

    expect(vl_status.state).toBe("ready");
    expect(vl_status.lastRefreshAt).toBe(
      vl_liveCodeBenchTime.toISOString(),
    );
    expect(vl_status.sources.map((p_source) => p_source.source)).toEqual([
      "opencode-models",
      "opencode-pricing",
      "gpqa",
      "livecodebench",
    ]);
  });
});

describe("f_resolveRequestTimeoutMs", () => {
  test("uses defaults for missing or invalid values", () => {
    expect(f_resolveRequestTimeoutMs({})).toBe(k_defaultRequestTimeoutMs);
    expect(
      f_resolveRequestTimeoutMs({ OPENCODE_REQUEST_TIMEOUT_MS: "0" }),
    ).toBe(k_defaultRequestTimeoutMs);
    expect(
      f_resolveRequestTimeoutMs({
        OPENCODE_REQUEST_TIMEOUT_MS: "not-a-number",
      }),
    ).toBe(k_defaultRequestTimeoutMs);
  });

  test("accepts a positive millisecond override", () => {
    expect(
      f_resolveRequestTimeoutMs({ OPENCODE_REQUEST_TIMEOUT_MS: "2500" }),
    ).toBe(2_500);
  });
});
