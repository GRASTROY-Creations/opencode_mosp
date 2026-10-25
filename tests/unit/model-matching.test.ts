import { describe, expect, test } from "bun:test";

import type { BenchmarkMapping } from "../../src/config/benchmark-mappings";
import type { ModelAlias } from "../../src/config/model-aliases";
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
    const vl_benchmark = f_createTestBenchmark("gpqa", 70, {
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
    const vl_benchmark = f_createTestBenchmark("gpqa", 70, {
      sourceModelId: "model-b",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("exact-model-id");
    expect(vl_result.unmatched).toHaveLength(0);
  });

  test("falls back to an exact canonical ID", () => {
    const vl_model = f_createTestModel({ canonicalId: "canonical-b" });
    const vl_benchmark = f_createTestBenchmark("livecodebench", 42, {
      sourceModelId: "canonical-b",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.matches[0]?.strategy).toBe("canonical-id");
  });

  test("resolves a reviewed alias to exactly one model", () => {
    const vl_model = f_createTestModel({
      providerId: "test",
      modelId: "model-c",
    });
    const vl_alias: ModelAlias = {
      providerId: "test",
      canonicalModelId: "model-c",
      aliases: ["external-c"],
      reason: "test mapping",
    };

    const vl_result = f_matchBenchmarkRecords(
      [vl_model],
      [f_createTestBenchmark("gpqa", 60, { sourceModelId: "external-c" })],
      [vl_alias],
    );

    expect(vl_result.matches[0]?.strategy).toBe("alias");
    expect(vl_result.matches[0]?.matchType).toBe("alias");
    expect(vl_result.matches[0]?.modelId).toBe("test/model-c");
  });

  test("uses conservative normalized matching when unique", () => {
    const vl_model = f_createTestModel({ modelId: "model-d" });
    const vl_benchmark = f_createTestBenchmark("gpqa", 55, {
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
    const vl_benchmark = f_createTestBenchmark("gpqa", 55, {
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
    const vl_benchmark = f_createTestBenchmark("gpqa", 55, {
      sourceModelId: "shared",
    });

    const vl_result = f_matchBenchmarkRecords(vl_models, [vl_benchmark]);

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("does not strip a provider prefix during normalization", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("gpqa", 55, {
      sourceModelId: "test/model_a",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark]);

    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });

  test("records an alias whose target is absent", () => {
    const vl_alias: ModelAlias = {
      providerId: "test",
      canonicalModelId: "missing-model",
      aliases: ["external-z"],
      reason: "test mapping",
    };

    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel()],
      [f_createTestBenchmark("gpqa", 50, { sourceModelId: "external-z" })],
      [vl_alias],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("alias-target-missing");
  });

  test("rejects two aliases that resolve to different models", () => {
    const vl_aliases: readonly ModelAlias[] = [
      {
        providerId: "test",
        canonicalModelId: "model-a",
        aliases: ["shared-alias"],
        reason: "test mapping",
      },
      {
        providerId: "test",
        canonicalModelId: "model-b",
        aliases: ["shared-alias"],
        reason: "test mapping",
      },
    ];

    const vl_result = f_matchBenchmarkRecords(
      [
        f_createTestModel({ modelId: "model-a" }),
        f_createTestModel({ modelId: "model-b" }),
      ],
      [
        f_createTestBenchmark("gpqa", 50, {
          sourceModelId: "shared-alias",
        }),
      ],
      vl_aliases,
    );

    expect(vl_result.unmatched[0]?.reason).toBe("ambiguous");
  });

  test("does not overwrite an existing benchmark row", () => {
    const vl_existing = f_createTestBenchmark("gpqa", 40, {
      sourceModelId: "test/model-a",
    });
    const vl_model = f_createTestModel({ benchmarks: [vl_existing] });
    const vl_result = f_matchBenchmarkRecords(
      [vl_model],
      [
        f_createTestBenchmark("gpqa", 90, {
          sourceModelId: "test/model-a",
        }),
      ],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("duplicate-benchmark");
    expect(vl_result.models[0]?.benchmarks[0]?.score).toBe(40);
  });

  test("attaches both benchmark types in a stable order", () => {
    const vl_model = f_createTestModel();
    const vl_result = f_matchBenchmarkRecords(
      [vl_model],
      [
        f_createTestBenchmark("livecodebench", 30, {
          sourceModelId: "test/model-a",
        }),
        f_createTestBenchmark("gpqa", 70, {
          sourceModelId: "test/model-a",
        }),
      ],
    );

    expect(
      vl_result.models[0]?.benchmarks.map((p_entry) => p_entry.benchmarkId),
    ).toEqual(["gpqa", "livecodebench"]);
    expect(vl_model.benchmarks).toEqual([]);
  });

  test("marks a benchmark without a source model ID as unmatched", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel()],
      [
        f_createTestBenchmark("gpqa", 70, {
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
        f_createTestBenchmark("gpqa", 70, {
          sourceModelId: "test/model-a",
        }),
      ],
    );

    expect(vl_result.models).not.toBe(vl_models);
    expect(vl_models[0]?.benchmarks).toEqual([]);
  });
});

describe("reviewed benchmark mappings", () => {
  const k_mapping: BenchmarkMapping = {
    benchmarkId: "gpqa",
    sourceModelId: "External Alpha",
    opencodeModelId: "test/model-a",
    matchType: "family_proxy",
    reason: "test mapping",
  };

  test("attaches through a mapping and records the entry kind", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("gpqa", 66, {
      sourceModelId: "External Alpha",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark], [], [
      k_mapping,
    ]);

    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("family_proxy");
    expect(vl_result.models[0]?.benchmarks[0]?.matchType).toBe("family_proxy");
  });

  test("records a mapping whose registry target is absent", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ modelId: "model-a" })],
      [f_createTestBenchmark("gpqa", 66, { sourceModelId: "External Alpha" })],
      [],
      [{ ...k_mapping, opencodeModelId: "test/missing" }],
    );

    expect(vl_result.unmatched[0]?.reason).toBe("mapping-target-missing");
  });

  test("drops ambiguous duplicate mapping keys", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ modelId: "model-a" })],
      [f_createTestBenchmark("gpqa", 66, { sourceModelId: "External Alpha" })],
      [],
      [k_mapping, { ...k_mapping, opencodeModelId: "test/model-b" }],
    );

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });

  test("mapping runs before normalized matching", () => {
    const vl_model = f_createTestModel({ modelId: "model-a" });
    const vl_benchmark = f_createTestBenchmark("gpqa", 66, {
      sourceModelId: "MODEL_A",
    });

    const vl_result = f_matchBenchmarkRecords([vl_model], [vl_benchmark], [], [
      { ...k_mapping, sourceModelId: "MODEL_A", matchType: "version_proxy" },
    ]);

    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("version_proxy");
  });
});

describe("seeded production mappings (defaults)", () => {
  test("attach the three owner-verified GPQA rows without explicit inputs", () => {
    const vl_models = [
      f_createTestModel({
        id: "opencode/kimi-k2.6",
        providerId: "opencode",
        modelId: "kimi-k2.6",
      }),
      f_createTestModel({
        id: "opencode/kimi-k2.5",
        providerId: "opencode",
        modelId: "kimi-k2.5",
      }),
      f_createTestModel({
        id: "opencode/qwen3.5-plus",
        providerId: "opencode",
        modelId: "qwen3.5-plus",
      }),
    ];
    const vl_benchmarks = [
      f_createTestBenchmark("gpqa", 90.5, { sourceModelId: "moonshotai/Kimi-K2.6" }),
      f_createTestBenchmark("gpqa", 87.6, { sourceModelId: "moonshotai/Kimi-K2.5" }),
      f_createTestBenchmark("gpqa", 88.4, { sourceModelId: "Qwen/Qwen3.5-397B-A17B" }),
    ];

    const vl_result = f_matchBenchmarkRecords(vl_models, vl_benchmarks);

    expect(vl_result.matches).toHaveLength(3);
    expect(vl_result.matches.every((p_match) => p_match.strategy === "mapping")).toBe(true);
    expect(vl_result.matches[2]?.matchType).toBe("family_proxy");
    const vl_qwen = vl_result.models.find(
      (p_model) => p_model.id === "opencode/qwen3.5-plus",
    );
    expect(vl_qwen?.benchmarks[0]?.matchType).toBe("family_proxy");
  });
});

describe("casefolded mapping lookup", () => {
  const k_foldMappings: readonly BenchmarkMapping[] = [
    {
      benchmarkId: "gpqa",
      sourceModelId: "Kimi-K2.6",
      opencodeModelId: "test/model-a",
      matchType: "alias",
      reason: "test",
    },
  ];

  test("casefolded fallback attaches when the exact string misses", () => {
    const vl_result = f_matchBenchmarkRecords(
      [f_createTestModel({ id: "test/model-a" })],
      [f_createTestBenchmark("gpqa", 90.5, { sourceModelId: "kimi-k2.6" })],
      [],
      k_foldMappings,
    );

    expect(vl_result.matches).toHaveLength(1);
    expect(vl_result.matches[0]?.strategy).toBe("mapping");
    expect(vl_result.matches[0]?.matchType).toBe("alias");
  });

  test("exact entries win; an ambiguous casefold key resolves nothing", () => {
    const vl_mappings: readonly BenchmarkMapping[] = [
      {
        benchmarkId: "gpqa",
        sourceModelId: "Foo",
        opencodeModelId: "test/model-a",
        matchType: "alias",
        reason: "test",
      },
      {
        benchmarkId: "gpqa",
        sourceModelId: "foo",
        opencodeModelId: "test/model-b",
        matchType: "family_proxy",
        reason: "test",
      },
    ];
    const vl_models = [
      f_createTestModel({ id: "test/model-a" }),
      f_createTestModel({ id: "test/model-b" }),
    ];

    const vl_upper = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("gpqa", 90, { sourceModelId: "Foo" })],
      [],
      vl_mappings,
    );
    expect(vl_upper.matches[0]?.modelId).toBe("test/model-a");

    const vl_lower = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("gpqa", 90, { sourceModelId: "foo" })],
      [],
      vl_mappings,
    );
    expect(vl_lower.matches[0]?.modelId).toBe("test/model-b");

    const vl_other = f_matchBenchmarkRecords(
      vl_models,
      [f_createTestBenchmark("gpqa", 90, { sourceModelId: "FOO" })],
      [],
      vl_mappings,
    );
    expect(vl_other.matches).toHaveLength(0);
    expect(vl_other.unmatched[0]?.reason).toBe("no-match");
  });

  test("duplicate identical sources drop from both views", () => {
    const vl_mappings: readonly BenchmarkMapping[] = [
      {
        benchmarkId: "gpqa",
        sourceModelId: "Dup",
        opencodeModelId: "test/model-a",
        matchType: "alias",
        reason: "test",
      },
      {
        benchmarkId: "gpqa",
        sourceModelId: "Dup",
        opencodeModelId: "test/model-b",
        matchType: "alias",
        reason: "test",
      },
    ];

    const vl_result = f_matchBenchmarkRecords(
      [
        f_createTestModel({ id: "test/model-a" }),
        f_createTestModel({ id: "test/model-b" }),
      ],
      [f_createTestBenchmark("gpqa", 90, { sourceModelId: "Dup" })],
      [],
      vl_mappings,
    );

    expect(vl_result.matches).toHaveLength(0);
    expect(vl_result.unmatched[0]?.reason).toBe("no-match");
  });
});
