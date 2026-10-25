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
  test("prefers the exact provider/model key", async () => {
    const vl_model = f_createTestModel({
      providerId: "test",
      modelId: "model-a",
    });
    const vl_benchmark = f_createTestBenchmark("llbm", 70, {
      sourceModelId: "test/model-a",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(1);
    expect(vl_result.matches[0]?.strategy).toBe("exact-id");
    expect(vl_result.matches[0]?.matchType).toBe("exact");
    expect(vl_result.models[0]?.benchmarks).toHaveLength(1);
  });

  test("falls back to an exact model ID", async () => {
    const vl_model = f_createTestModel({ modelId: "model-b" });
    const vl_benchmark = f_createTestBenchmark("llbm", 70, {
      sourceModelId: "model-b",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("exact-model-id");
    expect(vl_result.unmatched).toHaveLength(0);
  });

  test("falls back to an exact canonical ID", async () => {
    const vl_model = f_createTestModel({ canonicalId: "canonical-b" });
    const vl_benchmark = f_createTestBenchmark("llbm", 42, {
      sourceModelId: "canonical-b",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("canonical-id");
  });

  test("uses conservative normalized matching when unique", async () => {
    const vl_model = f_createTestModel({ modelId: "model-d" });
    const vl_benchmark = f_createTestBenchmark("llbm", 55, {
      sourceModelId: "MODEL_D",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("normalized");
  });

  test("rejects an ambiguous normalized match", async () => {
    const vl_models = [
      f_createTestModel({ modelId: "model_x" }),
      f_createTestModel({ modelId: "model-x", providerId: "other" }),
    ];
    const vl_benchmark = f_createTestBenchmark("llbm", 55, {
      sourceModelId: "MODEL_X",
    });

    const vl_result = await f_matchBenchmarkRecords(vl_models, [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("rejects an exact model ID shared by two providers", async () => {
    const vl_models = [
      f_createTestModel({ providerId: "test", modelId: "shared" }),
      f_createTestModel({ providerId: "other", modelId: "shared" }),
    ];
    const vl_benchmark = f_createTestBenchmark("llbm", 55, {
      sourceModelId: "shared",
    });

    const vl_result = await f_matchBenchmarkRecords(vl_models, [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("does not strip a provider prefix during normalization", async () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbm", 55, {
      sourceModelId: "test/model_a",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });

  test("marks a benchmark without a source model ID as unmatched", async () => {
    const vl_result = await f_matchBenchmarkRecords(
      [f_createTestModel()],
      [
        f_createTestBenchmark("llbm", 70, {
          sourceModelId: null,
        }),
      ],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("missing-source-id");
  });

  test("does not mutate the input catalog", async () => {
    const vl_models = [f_createTestModel()];
    const vl_result = await f_matchBenchmarkRecords(
      vl_models,
      [
        f_createTestBenchmark("llbm", 70, {
          sourceModelId: "test/model-a",
        }),
      ],
    );

    expect(vl_result.models).not.toBe(vl_models);
    expect(vl_models[0]?.benchmarks).toEqual([]);
  });
});

describe("reviewed LLMBM mappings", () => {
  const k_mapping: LlbmMapping = {
    llbmId: "External Alpha",
    opencodeId: "test/model-a",
    matchType: "family_fallback",
  };

  test("attaches through a mapping and records the entry kind", async () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbm", 66, {
      sourceModelId: "External Alpha",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark], [], [k_mapping]);

    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("family_fallback");
    expect(vl_result.models[0]?.benchmarks[0]?.matchType).toBe("family_fallback");
  });

  test("records a mapping whose registry target is absent", async () => {
    const vl_result = await f_matchBenchmarkRecords(
      [f_createTestModel({ modelId: "model-a" })],
      [f_createTestBenchmark("llbm", 66, { sourceModelId: "External Alpha" })],
      [],
      [{ ...k_mapping, opencodeId: "test/missing" }],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("mapping-target-missing");
  });

  test("mapping runs before normalized matching", async () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("llbm", 66, {
      sourceModelId: "MODEL_A",
    });

    const vl_result = await f_matchBenchmarkRecords([vl_model], [vl_benchmark], [], [{ ...k_mapping, llbmId: "MODEL_A", matchType: "family_fallback" }]);

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

  test("casefolded fallback attaches when the exact string misses", async () => {
    const vl_result = await f_matchBenchmarkRecords(
      [f_createTestModel({ id: "test/model-a" })],
      [f_createTestBenchmark("llbm", 90.5, { sourceModelId: "kimi-k2.6" })],
      [],
      k_foldMappings,
    );

    expect(vl_result.matches).toHaveLength(1);
    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("exact");
  });

  test("exact entries win; an ambiguous casefold key resolves nothing", async () => {
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

    const vl_upper = await f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbm", 90, { sourceModelId: "Foo" })],
      [],
      vl_mappings,
    );
    expect(vl_upper.matches[0]?.modelId).toBe("test/model-a");

    const vl_lower = await f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbm", 90, { sourceModelId: "foo" })],
      [],
      vl_mappings,
    );
    expect(vl_lower.matches[0]?.modelId).toBe("test/model-b");

    const vl_other = await f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("llbm", 90, { sourceModelId: "FOO" })],
      [],
      vl_mappings,
    );
    expect(vl_other.matches).toHaveLength(0);
    expect(vl_other.unmatched[0]?.reason).toBe("no-match");
  });

  test("duplicate identical sources drop from both views", async () => {
    const vl_mappings: readonly LlbmMapping[] = [
      {
        llbmId: "Dup",
        opencodeId: "test/model-a",
        matchType: "exact",
      },
      {
        llbmId: "Dup",
        opencodeId: "test/model-b",
        matchType: "exact",
      },
    ];

    const vl_result = await f_matchBenchmarkRecords(
      [
        f_createTestModel({ id: "test/model-a" }),
        f_createTestModel({ id: "test/model-b" }),
      ],
      [f_createTestBenchmark("llbm", 90, { sourceModelId: "Dup" })],
      [],
      vl_mappings,
    );

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });
});

describe("seeded production mappings (defaults)", () => {
  test("attach regenerated LLMBM rows without explicit inputs", async () => {
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
      f_createTestBenchmark("llbm", 61.8, {
        sourceModelId: "moonshotai/kimi-k2.6",
      }),
      f_createTestBenchmark("llbm", 76.5, {
        sourceModelId: "anthropic/claude-fable-5",
      }),
      f_createTestBenchmark("llbm", 26.8, {
        sourceModelId: "nvidia/nemotron-3.5-lightning",
      }),
      f_createTestBenchmark("llbm", 71.5, {
        sourceModelId: "z-ai/glm-5.3-flash",
      }),
    ];

    const vl_result = await f_matchBenchmarkRecords(vl_models, vl_benchmarks);

    expect(vl_result.matches).toHaveLength(4);
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

    // The shared `z-ai/glm-5.3-flash` source id prefers the exact entry, so
    // the paid model is scored and the `-free` sibling stays unmatched.
    const vl_glmPaid = vl_result.models.find(
      (p_model) => p_model.id === "opencode/glm-5.3-flash",
    );
    expect(vl_glmPaid?.benchmarks[0]?.matchType).toBe("exact");
    const vl_glmFree = vl_result.models.find(
      (p_model) => p_model.id === "opencode/glm-5.3-flash-free",
    );
    expect(vl_glmFree?.benchmarks).toHaveLength(0);
  });
});