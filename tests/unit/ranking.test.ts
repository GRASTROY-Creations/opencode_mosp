import { describe, expect, test } from "bun:test";

import {
  f_compareModels,
  f_sortModels,
} from "../../src/services/ranking";
import {
  f_createTestBenchmark,
  f_createTestModel,
} from "./test-models";

const k_cheap = f_createTestModel({
  modelId: "cheap",
  inputPrice: 1,
  outputPrice: 4,
});

const k_expensive = f_createTestModel({
  modelId: "expensive",
  inputPrice: 10,
  outputPrice: 40,
});

const k_unknownPrice = f_createTestModel({
  modelId: "unknown-price",
  inputPrice: null,
  outputPrice: null,
});

describe("f_sortModels", () => {
  test("sorts input prices numerically in both directions", () => {
    expect(
      f_sortModels(
        [k_expensive, k_cheap, k_unknownPrice],
        "inputPrice",
        "asc",
      ).map((p_model) => p_model.modelId),
    ).toEqual(["cheap", "expensive", "unknown-price"]);

    expect(
      f_sortModels(
        [k_expensive, k_cheap, k_unknownPrice],
        "inputPrice",
        "desc",
      ).map((p_model) => p_model.modelId),
    ).toEqual(["expensive", "cheap", "unknown-price"]);
  });

  test("keeps missing prices last in both directions", () => {
    const vl_models = [k_unknownPrice, k_cheap, k_expensive];

    for (const vl_direction of ["asc", "desc"] as const) {
      const vl_sorted = f_sortModels(vl_models, "outputPrice", vl_direction);
      expect(vl_sorted.at(-1)?.modelId).toBe("unknown-price");
    }
  });

  test("sorts names case-insensitively and naturally", () => {
    const vl_models = [
      f_createTestModel({ modelId: "m10", name: "Model 10" }),
      f_createTestModel({ modelId: "m2", name: "Model 2" }),
      f_createTestModel({ modelId: "m1", name: "model 1" }),
    ];

    expect(
      f_sortModels(vl_models, "name", "asc").map((p_model) => p_model.name),
    ).toEqual(["model 1", "Model 2", "Model 10"]);
  });

  test("breaks ties deterministically by model ID in both directions", () => {
    const vl_models = [
      f_createTestModel({ modelId: "b", inputPrice: 3 }),
      f_createTestModel({ modelId: "a", inputPrice: 3 }),
    ];

    for (const vl_direction of ["asc", "desc"] as const) {
      expect(
        f_sortModels(vl_models, "inputPrice", vl_direction).map(
          (p_model) => p_model.modelId,
        ),
      ).toEqual(["a", "b"]);
    }
  });

  test("sorts the coding and intelligence columns independently", () => {
    const vl_coder = f_createTestModel({
      modelId: "coder",
      benchmarks: [
        f_createTestBenchmark("llbmCoding", 90, { sourceModelId: "coder" }),
        f_createTestBenchmark("llbmIntelligence", 40, { sourceModelId: "coder" }),
      ],
    });
    const vl_thinker = f_createTestModel({
      modelId: "thinker",
      benchmarks: [
        f_createTestBenchmark("llbmCoding", 80, { sourceModelId: "thinker" }),
        f_createTestBenchmark("llbmIntelligence", 60, { sourceModelId: "thinker" }),
      ],
    });

    expect(
      f_sortModels([vl_thinker, vl_coder], "codingScore", "desc").map(
        (p_model) => p_model.modelId,
      ),
    ).toEqual(["coder", "thinker"]);

    expect(
      f_sortModels([vl_coder, vl_thinker], "intelligenceScore", "desc").map(
        (p_model) => p_model.modelId,
      ),
    ).toEqual(["thinker", "coder"]);
  });

  test("keeps missing benchmark scores last in both directions", () => {
    const vl_scored = f_createTestModel({
      modelId: "scored",
      benchmarks: [
        f_createTestBenchmark("llbmCoding", 75, { sourceModelId: "scored" }),
      ],
    });
    // Intelligence-only: missing for the coding column.
    const vl_other = f_createTestModel({
      modelId: "other",
      benchmarks: [
        f_createTestBenchmark("llbmIntelligence", 50, { sourceModelId: "other" }),
      ],
    });
    const vl_missing = f_createTestModel({ modelId: "missing" });

    for (const vl_direction of ["asc", "desc"] as const) {
      expect(
        f_sortModels(
          [vl_missing, vl_other, vl_scored],
          "codingScore",
          vl_direction,
        ).map((p_model) => p_model.modelId),
      ).toEqual(["scored", "missing", "other"]);
    }
  });

  test("sorts release dates and keeps missing dates last", () => {
    const vl_old = f_createTestModel({
      modelId: "old",
      releaseDate: "2024-01-01T00:00:00.000Z",
    });
    const vl_new = f_createTestModel({
      modelId: "new",
      releaseDate: "2025-01-01T00:00:00.000Z",
    });
    const vl_missing = f_createTestModel({ modelId: "missing" });

    expect(
      f_sortModels(
        [vl_missing, vl_new, vl_old],
        "releaseDate",
        "asc",
      ).map((p_model) => p_model.modelId),
    ).toEqual(["old", "new", "missing"]);
  });

  test("does not mutate the input array", () => {
    const vl_models = [k_expensive, k_cheap];
    const vl_original = vl_models.map((p_model) => p_model.modelId);

    f_sortModels(vl_models, "inputPrice", "asc");

    expect(vl_models.map((p_model) => p_model.modelId)).toEqual(vl_original);
  });

  test("f_compareModels reflects missing-last semantics", () => {
    expect(f_compareModels(k_unknownPrice, k_cheap, "inputPrice", "asc")).toBe(1);
    expect(f_compareModels(k_cheap, k_unknownPrice, "inputPrice", "desc")).toBe(-1);
  });
});
