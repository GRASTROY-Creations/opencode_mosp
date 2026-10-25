import { describe, expect, test } from "bun:test";

import { f_filterModels } from "../../src/services/model-filter";
import {
  f_createTestBenchmark,
  f_createTestModel,
} from "./test-models";

const k_gpqaModel = f_createTestModel({
  modelId: "llbm-model",
  name: "Scored Model",
  canonicalId: "canonical-llbm",
  benchmarks: [
    f_createTestBenchmark("llbm", 80, { sourceModelId: "llbm-model" }),
  ],
});

const k_lcbOnlyModel = f_createTestModel({
  modelId: "llbm-only",
  name: "Coding Model",
  providerId: "other",
  providerName: "Other Provider",
  benchmarks: [
    f_createTestBenchmark("llbm", 50, {
      sourceModelId: "llbm-only",
    }),
  ],
});

const k_missingModel = f_createTestModel({
  modelId: "missing-model",
  name: "No Benchmarks",
  inputPrice: null,
  outputPrice: null,
});

const k_freeModel = f_createTestModel({
  modelId: "free-model",
  name: "Free Model",
  providerId: "free-provider",
  inputPrice: 0,
  outputPrice: 0,
  tiers: [
    {
      contextThresholdTokens: 100_000,
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      cacheReadUsdPerMillionTokens: null,
      cacheWriteUsdPerMillionTokens: null,
    },
  ],
});

describe("f_filterModels", () => {
  test("returns every record when no filter is set", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_missingModel];

    expect(f_filterModels(vl_models)).toEqual(vl_models);
  });

  test("filters by exact provider ID", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_freeModel];

    expect(
      f_filterModels(vl_models, { providerIds: ["free-provider"] }).map(
        (p_model) => p_model.modelId,
      ),
    ).toEqual(["free-model"]);
  });

  test("shows only explicitly free models", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_missingModel, k_freeModel];

    expect(
      f_filterModels(vl_models, { freeOnly: true }).map(
        (p_model) => p_model.modelId,
      ),
    ).toEqual(["free-model"]);
  });

  test("treats a nonzero tier as not free", () => {
    const vl_tiered = f_createTestModel({
      modelId: "tiered",
      inputPrice: 0,
      outputPrice: 0,
      tiers: [
        {
          contextThresholdTokens: 200_000,
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 2,
          cacheReadUsdPerMillionTokens: null,
          cacheWriteUsdPerMillionTokens: null,
        },
      ],
    });

    expect(f_filterModels([vl_tiered], { freeOnly: true })).toEqual([]);
  });

  test("filters on LLMBM presence and absence", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_missingModel];

    expect(
      f_filterModels(vl_models, {
        benchmarkPresence: { scope: "llbm", state: "present" },
      }).map((p_model) => p_model.modelId),
    ).toEqual(["llbm-model", "llbm-only"]);

    expect(
      f_filterModels(vl_models, {
        benchmarkPresence: { scope: "llbm", state: "missing" },
      }).map((p_model) => p_model.modelId),
    ).toEqual(["missing-model"]);
  });

  test("filters on any benchmark presence", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_missingModel];

    expect(
      f_filterModels(vl_models, {
        benchmarkPresence: { scope: "all", state: "missing" },
      }).map((p_model) => p_model.modelId),
    ).toEqual(["missing-model"]);
  });

  test("treats a null score as missing", () => {
    const vl_nullScore = f_createTestModel({
      modelId: "null-score",
      benchmarks: [
        f_createTestBenchmark("llbm", null, {
          sourceModelId: "null-score",
        }),
      ],
    });

    expect(
      f_filterModels([vl_nullScore], {
        benchmarkPresence: { scope: "llbm", state: "present" },
      }),
    ).toEqual([]);
  });

  test("composes filters with AND semantics", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel, k_missingModel, k_freeModel];

    expect(
      f_filterModels(vl_models, {
        providerIds: ["other"],
        benchmarkPresence: { scope: "llbm", state: "present" },
      }).map((p_model) => p_model.modelId),
    ).toEqual(["llbm-only"]);
  });

  test("does not mutate the input array", () => {
    const vl_models = [k_gpqaModel, k_lcbOnlyModel];

    const vl_filtered = f_filterModels(vl_models);

    expect(vl_filtered).not.toBe(vl_models);
    expect(vl_models).toHaveLength(2);
  });
});
