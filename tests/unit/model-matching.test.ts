import { describe, expect, test } from "bun:test";

import type { LlbmMapping } from "../../src/config/llbm-mappings";
import {
  f_matchBenchmarkRecords,
  f_normalizeModelId,
} from "../../src/services/model-matching";
import {
  f_createTestBenchmark,
  f_createTestModel,
} from "./test-models";

describe("f_normalizeModelId", () => {
  test("trims, lowercases, and converts underscores only", () => {
    expect(f_normalizeModelId("  DeepSeek_V3  ")).toBe("deepseek-v3");
    expect(f_normalizeModelId("org/Model.V1")).toBe("org/model.v1");
  });
});

describe("f_matchBenchmarkRecords", () => {
  test("prefers the exact provider/model key", () => {
    const vl_model = f_createTestModel({
      providerId: "test",
      modelId: "model-a",
    });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 70, {
      sourceModelId: "test/model-a",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(1);
    expect(vl_result.matches[0]?.strategy).toBe("exact-id");
    expect(vl_result.matches[0]?.matchType).toBe("exact");
    expect(vl_result.models[0]?.benchmarks).toHaveLength(1);
  });

  test("falls back to an exact model ID", () => {
    const vl_model = f_createTestModel({ modelId: "model-b" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 70, {
      sourceModelId: "model-b",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("exact-model-id");
    expect(vl_result.unmatched).toHaveLength(0);
  });

  test("falls back to an exact canonical ID", () => {
    const vl_model = f_createTestModel({ canonicalId: "canonical-b" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 42, {
      sourceModelId: "canonical-b",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("canonical-id");
  });

  test("uses conservative normalized matching when unique", () => {
    const vl_model = f_createTestModel({ modelId: "model-d" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 55, {
      sourceModelId: "MODEL_D",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("normalized");
  });

  test("rejects an ambiguous normalized match", () => {
    const vl_models = [
      f_createTestModel({ modelId: "model_x" }),
      f_createTestModel({ modelId: "model-x", providerId: "other" }),
    ];
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 55, {
      sourceModelId: "MODEL_X",
    });

    const vl_result = f_matchBenchmarkRecords(vl_models, [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("rejects an exact model ID shared by two providers", () => {
    const vl_models = [
      f_createTestModel({ providerId: "test", modelId: "shared" }),
      f_createTestModel({ providerId: "other", modelId: "shared" }),
    ];
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 55, {
      sourceModelId: "shared",
    });

    const vl_result = f_matchBenchmarkRecords(vl_models, [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("does not strip a provider prefix during normalization", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 55, {
      sourceModelId: "test/model_a",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });

  test("marks a benchmark without a source model ID as unmatched", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel()],
      [
        f_createTestBenchmark("llbmCoding", 70, {
          sourceModelId: null,
        }),
      ],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("missing-source-id");
  });

  test("does not mutate the input catalog", () => {
    const vl_models = [f_createTestModel()];
    const vl_result = f_matchBenchmarkRecords(
      vl_models,
      [
        f_createTestBenchmark("llbmCoding", 70, {
          sourceModelId: "test/model-a",
        }),
      ],
    );

    expect(vl_result.models).not.toBe(vl_models);
    expect(vl_models[0]?.benchmarks).toEqual([]);
  });

  test("attaches one row per metric to the same model", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel()],
      [
        f_createTestBenchmark("llbmIntelligence", 40, { sourceModelId: "test/model-a" }),
        f_createTestBenchmark("llbmCoding", 70, { sourceModelId: "test/model-a" }),
      ],
    );

    expect(vl_result.matches).toHaveLength(2);
    // Rows are kept in display order regardless of input order.
    expect(vl_result.models[0]?.benchmarks.map((p_row) => p_row.benchmarkId)).toEqual([
      "llbmCoding",
      "llbmIntelligence",
    ]);
  });

  test("merges with existing rows and never overwrites one", () => {
    const vl_existing = f_createTestBenchmark("llbmCoding", 10, {
      sourceModelId: "test/model-a",
      matchType: "exact",
    });
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ benchmarks: [vl_existing] })],
      [
        f_createTestBenchmark("llbmCoding", 70, { sourceModelId: "test/model-a" }),
        f_createTestBenchmark("llbmIntelligence", 40, { sourceModelId: "test/model-a" }),
      ],
    );

    expect(vl_result.models[0]?.benchmarks.map((p_row) => p_row.score)).toEqual([10, 40]);
    expect(vl_result.unmatched).toEqual([
      {
        benchmarkId: "llbmCoding",
        sourceModelId: "test/model-a",
        reason: "duplicate-benchmark",
      },
    ]);
  });
});

describe("reviewed LLMBM mappings", () => {
  const k_mapping: LlbmMapping = {
    llbmId: "External Alpha",
    opencodeId: "test/model-a",
    matchType: "family_fallback",
  };

  test("attaches through a mapping and records the entry kind", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 66, {
      sourceModelId: "External Alpha",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark], [k_mapping]);

    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("family_fallback");
    expect(vl_result.models[0]?.benchmarks[0]?.matchType).toBe("family_fallback");
  });

  test("records a mapping whose registry target is absent", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ modelId: "model-a" })],
      [f_createTestBenchmark("llbmCoding", 66, { sourceModelId: "External Alpha" })],
      [{ ...k_mapping, opencodeId: "test/missing" }],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("mapping-target-missing");
  });

  test("mapping runs before normalized matching", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbmCoding", 66, {
      sourceModelId: "MODEL_A",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark], [{ ...k_mapping, llbmId: "MODEL_A", matchType: "family_fallback" }]);

    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("family_fallback");
  });
});

describe("casefolded mapping lookup", () => {
  const k_foldMappings: readonly LlbmMapping[] = [
    {
      llbmId: "Kimi-K2.6",
      opencodeId: "test/model-a",
      matchType: "exact",
    },
  ];

  test("casefolded fallback attaches when the exact string misses", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ id: "test/model-a" })],
      [f_createTestBenchmark("llbmCoding", 90.5, { sourceModelId: "kimi-k2.6" })],
      k_foldMappings,
    );

    expect(vl_result.matches).toHaveLength(1);
    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("exact");
  });

  test("exact keys resolve directly; a colliding casefold key resolves nothing", () => {
    const vl_mappings: readonly LlbmMapping[] = [
      {
        llbmId: "Foo",
        opencodeId: "test/model-a",
        matchType: "exact",
      },
      {
        llbmId: "foo",
        opencodeId: "test/model-b",
        matchType: "family_fallback",
      },
    ];
    const vl_models = [
      f_createTestModel({ id: "test/model-a" }),
      f_createTestModel({ id: "test/model-b" }),
    ];

    const vl_upper = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbmCoding", 90, { sourceModelId: "Foo" })],
      vl_mappings,
    );
    expect(vl_upper.matches[0]?.modelId).toBe("test/model-a");

    const vl_lower = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbmCoding", 90, { sourceModelId: "foo" })],
      vl_mappings,
    );
    expect(vl_lower.matches[0]?.modelId).toBe("test/model-b");

    const vl_other = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbmCoding", 90, { sourceModelId: "FOO" })],
      vl_mappings,
    );
    expect(vl_other.matches).toHaveLength(0);
    expect(vl_other.unmatched[0]?.reason).toBe("no-match");
  });

  test("distinct targets sharing one source id all attach (sharing)", () => {
    const vl_mappings: readonly LlbmMapping[] = [
      {
        llbmId: "Dup",
        opencodeId: "test/model-a",
        matchType: "exact",
      },
      {
        llbmId: "Dup",
        opencodeId: "test/model-b",
        matchType: "family_fallback",
      },
    ];

    const vl_result = f_matchBenchmarkRecords(
      [
        f_createTestModel({ id: "test/model-a" }),
        f_createTestModel({ id: "test/model-b" }),
      ],
      [f_createTestBenchmark("llbmCoding", 90, { sourceModelId: "Dup" })],
      vl_mappings,
    );

    expect(vl_result.matches).toHaveLength(2);
    expect(vl_result.matches[0]?.modelId).toBe("test/model-a");
    expect(vl_result.matches[0]?.matchType).toBe("exact");
    expect(vl_result.matches[1]?.modelId).toBe("test/model-b");
    expect(vl_result.matches[1]?.matchType).toBe("family_fallback");
    expect(vl_result.unmatched).toHaveLength(0);
  });
});

describe("seeded production mappings (defaults)", () => {
  test("attach regenerated LLMBM rows without explicit inputs", () => {
    const vl_models = [
      f_createTestModel({
        id: "opencode/kimi-k2.6",
        providerId: "opencode",
        modelId: "kimi-k2.6",
      }),
      f_createTestModel({
        id: "opencode/claude-fable-5",
        providerId: "opencode",
        modelId: "claude-fable-5",
      }),
      f_createTestModel({
        id: "opencode/nemotron-3.5-lightning-free",
        providerId: "opencode",
        modelId: "nemotron-3.5-lightning-free",
      }),
      f_createTestModel({
        id: "opencode/glm-5.3-flash",
        providerId: "opencode",
        modelId: "glm-5.3-flash",
      }),
      f_createTestModel({
        id: "opencode/glm-5.3-flash-free",
        providerId: "opencode",
        modelId: "glm-5.3-flash-free",
      }),
    ];
    const vl_benchmarks = [
      f_createTestBenchmark("llbmCoding", 61.8, {
        sourceModelId: "moonshotai/kimi-k2.6",
      }),
      f_createTestBenchmark("llbmCoding", 76.5, {
        sourceModelId: "anthropic/claude-fable-5",
      }),
      f_createTestBenchmark("llbmCoding", 26.8, {
        sourceModelId: "nvidia/nemotron-3.5-lightning",
      }),
      f_createTestBenchmark("llbmCoding", 71.5, {
        sourceModelId: "z-ai/glm-5.3-flash",
      }),
    ];

    const vl_result = f_matchBenchmarkRecords(vl_models, vl_benchmarks);

    expect(vl_result.matches).toHaveLength(5);
    expect(
      vl_result.matches.every((p_match) => p_match.strategy === "mapping"),
    ).toBe(true);

    const vl_nemotron = vl_result.models.find(
      (p_model) => p_model.id === "opencode/nemotron-3.5-lightning-free",
    );
    expect(vl_nemotron?.benchmarks[0]?.matchType).toBe("family_fallback");

    const vl_kimi = vl_result.models.find(
      (p_model) => p_model.id === "opencode/kimi-k2.6",
    );
    expect(vl_kimi?.benchmarks[0]?.matchType).toBe("exact");

    // The shared `z-ai/glm-5.3-flash` source id attaches to both reviewed
    // targets (Adjustment 21 sharing): the paid model owns the row and the
    // `-free` sibling receives a clone marked family_fallback (rendered ~).
    const vl_glmPaid = vl_result.models.find(
      (p_model) => p_model.id === "opencode/glm-5.3-flash",
    );
    expect(vl_glmPaid?.benchmarks[0]?.matchType).toBe("exact");
    const vl_glmFree = vl_result.models.find(
      (p_model) => p_model.id === "opencode/glm-5.3-flash-free",
    );
    expect(vl_glmFree?.benchmarks[0]?.matchType).toBe("family_fallback");
    expect(vl_glmFree?.benchmarks[0]?.score).toBe(
      vl_glmPaid?.benchmarks[0]?.score,
    );
  });
});