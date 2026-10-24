import { describe, expect, test } from "bun:test";

import {
  f_assignBenchmarkRanks,
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

  test("treats rank and score as distinct operations", () => {
    const vl_highScore = f_createTestModel({
      modelId: "high-score",
      benchmarks: [
        f_createTestBenchmark("gpqa", 90, { sourceModelId: "high-score", rank: 2 }),
      ],
    });
    const vl_topRank = f_createTestModel({
      modelId: "top-rank",
      benchmarks: [
        f_createTestBenchmark("gpqa", 80, { sourceModelId: "top-rank", rank: 1 }),
      ],
    });

    expect(
      f_sortModels(
        [vl_topRank, vl_highScore],
        "gpqaRank",
        "asc",
      ).map((p_model) => p_model.modelId),
    ).toEqual(["top-rank", "high-score"]);

    expect(
      f_sortModels(
        [vl_topRank, vl_highScore],
        "gpqaScore",
        "desc",
      ).map((p_model) => p_model.modelId),
    ).toEqual(["high-score", "top-rank"]);
  });

  test("keeps missing benchmark ranks last in both directions", () => {
    const vl_ranked = f_createTestModel({
      modelId: "ranked",
      benchmarks: [
        f_createTestBenchmark("gpqa", 75, {
          sourceModelId: "ranked",
          rank: 3,
        }),
      ],
    });
    const vl_missing = f_createTestModel({ modelId: "missing" });

    for (const vl_direction of ["asc", "desc"] as const) {
      expect(
        f_sortModels(
          [vl_missing, vl_ranked],
          "gpqaRank",
          vl_direction,
        ).map((p_model) => p_model.modelId),
      ).toEqual(["ranked", "missing"]);
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

describe("f_assignBenchmarkRanks", () => {
  test("uses competition ranking for ties and skips positions", () => {
    const vl_models = [
      f_createTestModel({
        modelId: "a",
        benchmarks: [f_createTestBenchmark("gpqa", 90, { sourceModelId: "a" })],
      }),
      f_createTestModel({
        modelId: "b",
        benchmarks: [f_createTestBenchmark("gpqa", 90, { sourceModelId: "b" })],
      }),
      f_createTestModel({
        modelId: "c",
        benchmarks: [f_createTestBenchmark("gpqa", 80, { sourceModelId: "c" })],
      }),
    ];

    const vl_ranked = f_assignBenchmarkRanks(vl_models);

    expect(vl_ranked.map((p_model) => p_model.benchmarks[0]?.rank)).toEqual([
      1, 1, 3,
    ]);
    expect(vl_models.map((p_model) => p_model.benchmarks[0]?.rank)).toEqual([
      null, null, null,
    ]);
  });

  test("never assigns a rank to a missing score", () => {
    const vl_models = [
      f_createTestModel({
        modelId: "no-score",
        benchmarks: [
          f_createTestBenchmark("gpqa", null, { sourceModelId: "no-score" }),
        ],
      }),
      f_createTestModel({ modelId: "no-row" }),
    ];

    const vl_ranked = f_assignBenchmarkRanks(vl_models);

    expect(vl_ranked[0]?.benchmarks[0]?.rank).toBeNull();
    expect(vl_ranked[1]?.benchmarks).toEqual([]);
  });

  test("clears a stale rank when the score is null", () => {
    const vl_model = f_createTestModel({
      modelId: "stale",
      benchmarks: [
        f_createTestBenchmark("gpqa", null, {
          sourceModelId: "stale",
          rank: 4,
        }),
      ],
    });

    const vl_ranked = f_assignBenchmarkRanks([vl_model]);

    expect(vl_ranked[0]?.benchmarks[0]?.rank).toBeNull();
  });

  test("ranks each benchmark independently", () => {
    const vl_models = [
      f_createTestModel({
        modelId: "a",
        benchmarks: [
          f_createTestBenchmark("gpqa", 90, { sourceModelId: "a" }),
          f_createTestBenchmark("livecodebench", 20, { sourceModelId: "a" }),
        ],
      }),
      f_createTestModel({
        modelId: "b",
        benchmarks: [
          f_createTestBenchmark("gpqa", 80, { sourceModelId: "b" }),
          f_createTestBenchmark("livecodebench", 60, { sourceModelId: "b" }),
        ],
      }),
    ];

    const vl_ranked = f_assignBenchmarkRanks(vl_models);

    expect(
      vl_ranked[0]?.benchmarks.map((p_entry) => [
        p_entry.benchmarkId,
        p_entry.rank,
      ]),
    ).toEqual([
      ["gpqa", 1],
      ["livecodebench", 2],
    ]);
    expect(
      vl_ranked[1]?.benchmarks.map((p_entry) => [
        p_entry.benchmarkId,
        p_entry.rank,
      ]),
    ).toEqual([
      ["gpqa", 2],
      ["livecodebench", 1],
    ]);
  });

  test("returns the same records when every rank is already correct", () => {
    const vl_model = f_createTestModel({
      modelId: "stable",
      benchmarks: [
        f_createTestBenchmark("gpqa", 88, {
          sourceModelId: "stable",
          rank: 1,
        }),
      ],
    });

    const vl_ranked = f_assignBenchmarkRanks([vl_model]);

    expect(vl_ranked[0]).toBe(vl_model);
  });
});
