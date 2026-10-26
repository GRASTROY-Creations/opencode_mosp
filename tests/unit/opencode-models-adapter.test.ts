import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { f_isFreeModelPricing } from "../../src/domain/model-pricing";
import type { ModelRecord } from "../../src/domain/model-record";
import type { AdapterResult } from "../../src/providers/adapter-result";
import { f_parseOpencodeModels } from "../../src/providers/opencode-models";

const k_observedAt = "2026-10-24T00:00:00.000Z";

function fh_loadFixture(p_name: string): unknown {
  const vl_path = new URL(`../fixtures/${p_name}`, import.meta.url);

  return JSON.parse(readFileSync(vl_path, "utf8")) as unknown;
}

function fh_expectModels(p_result: AdapterResult<readonly ModelRecord[]>): readonly ModelRecord[] {
  if (!p_result.ok) {
    throw new Error(p_result.error);
  }

  return p_result.value;
}

function fh_findModel(p_models: readonly ModelRecord[], p_id: string): ModelRecord {
  const vl_model = p_models.find((p_entry) => p_entry.id === p_id);

  if (vl_model === undefined) {
    throw new Error(`missing model ${p_id}`);
  }

  return vl_model;
}

describe("opencode model adapter", () => {
  test("normalizes the verified catalog fixture", () => {
    const vl_result = f_parseOpencodeModels(fh_loadFixture("model-info.sample.json"), {
      observedAt: k_observedAt,
      providerNames: { opencode: "OpenCode" },
    });
    const vl_models = fh_expectModels(vl_result);

    expect(vl_models).toHaveLength(3);

    const vl_haiku = fh_findModel(vl_models, "opencode/claude-haiku-5-5");

    expect(vl_haiku.name).toBe("Claude Haiku 5.5");
    expect(vl_haiku.providerName).toBe("OpenCode");
    expect(vl_haiku.canonicalId).toBeNull();
    expect(vl_haiku.contextWindow).toBe(1_000_000);
    expect(vl_haiku.releaseDate).toBe(new Date(1_791_331_200_000).toISOString());
    expect(vl_haiku.pricing.inputUsdPerMillionTokens).toBe(0.1);
    expect(vl_haiku.pricing.outputUsdPerMillionTokens).toBe(0.5);
    expect(vl_haiku.pricing.cacheReadUsdPerMillionTokens).toBe(0.01);
    expect(vl_haiku.pricing.cacheWriteUsdPerMillionTokens).toBe(0.125);
    expect(vl_haiku.pricing.tiers).toHaveLength(1);
    expect(vl_haiku.pricing.tiers[0]?.contextThresholdTokens).toBe(100_000);
    expect(vl_haiku.pricing.tiers[0]?.inputUsdPerMillionTokens).toBe(0.5);
    expect(vl_haiku.pricing.source).toBe("opencode:model-registry");
    expect(vl_haiku.pricing.observedAt).toBe(k_observedAt);
    expect(vl_haiku.benchmarks).toEqual([]);
    expect(vl_haiku.source).toBe("opencode");
    expect(vl_haiku.lastUpdatedAt).toBe(k_observedAt);
  });

  test("keeps a genuine zero price free and a missing price unavailable", () => {
    const vl_models = fh_expectModels(
      f_parseOpencodeModels(fh_loadFixture("model-info.sample.json"), {
        observedAt: k_observedAt,
      }),
    );
    const vl_free = fh_findModel(vl_models, "opencode/deepseek-v4.1-flash-free");
    const vl_gpt = fh_findModel(vl_models, "opencode/gpt-5-nano");

    expect(f_isFreeModelPricing(vl_free.pricing)).toBe(true);
    expect(vl_free.pricing.inputUsdPerMillionTokens).toBe(0);
    expect(vl_gpt.pricing.tiers).toEqual([]);
    expect(vl_gpt.pricing.inputUsdPerMillionTokens).toBe(0.05);
  });

  test("accepts the HTTP envelope and falls back to the provider ID as name", () => {
    const vl_fixture = fh_loadFixture("model-info.sample.json");
    const vl_envelope = { data: vl_fixture };
    const vl_models = fh_expectModels(
      f_parseOpencodeModels(vl_envelope, { observedAt: k_observedAt }),
    );

    expect(vl_models).toHaveLength(3);
    expect(vl_models[0]?.providerName).toBe("opencode");
  });

  test("skips disabled rows unless explicitly included", () => {
    const vl_fixture = fh_loadFixture("model-info.sample.json");
    const vl_rows = vl_fixture as readonly Record<string, unknown>[];
    const vl_disabled = vl_rows.map((p_row) => ({
      ...p_row,
      enabled: false,
    }));

    const vl_default = fh_expectModels(
      f_parseOpencodeModels(vl_disabled, { observedAt: k_observedAt }),
    );
    const vl_included = fh_expectModels(
      f_parseOpencodeModels(vl_disabled, {
        observedAt: k_observedAt,
        includeDisabled: true,
      }),
    );

    expect(vl_default).toHaveLength(0);
    expect(vl_included).toHaveLength(3);
  });

  test("skips duplicate model IDs with a warning", () => {
    const vl_fixture = fh_loadFixture("model-info.sample.json");
    const vl_rows = vl_fixture as readonly Record<string, unknown>[];
    const vl_first = vl_rows[0];

    if (vl_first === undefined) {
      throw new Error("fixture is empty");
    }

    const vl_result = f_parseOpencodeModels([vl_first, vl_first], { observedAt: k_observedAt });
    const vl_models = fh_expectModels(vl_result);

    expect(vl_models).toHaveLength(1);
    expect(vl_result.ok).toBe(true);
    expect(vl_result.warnings).toContainEqual({
      code: "duplicate-model",
      message: "duplicate model opencode/claude-haiku-5-5 skipped",
    });
  });

  test("skips rows with invalid pricing but keeps valid siblings", () => {
    const vl_fixture = fh_loadFixture("model-info.sample.json");
    const vl_rows = vl_fixture as readonly Record<string, unknown>[];
    const vl_first = vl_rows[0];
    const vl_second = vl_rows[1];

    if (vl_first === undefined || vl_second === undefined) {
      throw new Error("fixture is incomplete");
    }

    const vl_invalid = {
      ...vl_first,
      cost: [
        {
          input: -1,
          output: 0.5,
          cache: { read: 0, write: 0 },
        },
      ],
    };

    const vl_result = f_parseOpencodeModels([vl_invalid, vl_second], { observedAt: k_observedAt });
    const vl_models = fh_expectModels(vl_result);

    expect(vl_models).toHaveLength(1);
    expect(vl_models[0]?.id).toBe("opencode/deepseek-v4.1-flash-free");
    expect(vl_result.warnings[0]?.code).toBe("skipped-model");
  });

  test("fails a broken envelope instead of inventing an empty catalog", () => {
    const vl_result = f_parseOpencodeModels({ models: [] }, { observedAt: k_observedAt });

    expect(vl_result.ok).toBe(false);

    if (!vl_result.ok) {
      expect(vl_result.error).toContain("data array");
    }
  });
});
