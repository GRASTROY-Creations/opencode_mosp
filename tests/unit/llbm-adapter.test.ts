/**
 * LLMBM adapter tests (Adjustments 20, 22). Fixture-driven only — no live network.
 */

import { describe, expect, test } from "bun:test";

import llbmFixture from "../fixtures/llbm-export.sample.json";
import {
  f_fetchLlbmBenchmarks,
  f_parseLlbmExport,
  k_llbmExportUrl,
} from "../../src/providers/llbm";

function fh_jsonResponse(p_body: unknown, p_status = 200): Response {
  return new Response(JSON.stringify(p_body), {
    status: p_status,
    headers: { "content-type": "application/json" },
  });
}

function fh_scoreRow(p_overrides: Record<string, unknown>): unknown {
  return {
    modelId: "test/model",
    source: "test",
    metric: "aa_coding_index",
    value: 50,
    unit: "points",
    observedAt: "2026-10-25",
    ...p_overrides,
  };
}

function fh_exportPayload(p_scores: readonly unknown[]): unknown {
  return { dataset: { models: [], scores: p_scores } };
}

describe("f_parseLlbmExport", () => {
  test("parses the fixture into deterministic percent-scale rows", () => {
    const vl_result = f_parseLlbmExport(llbmFixture);

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;

    // Coding rows first, then intelligence rows; each sorted by source id.
    expect(
      vl_result.value.map((p_row) => `${p_row.benchmarkId}:${p_row.sourceModelId}`),
    ).toEqual([
      "llbmCoding:anthropic/claude-fable-5",
      "llbmCoding:google/gemini-3.8-flash",
      "llbmCoding:moonshotai/kimi-k2.6",
      "llbmCoding:nvidia/nemotron-3.5-lightning",
      "llbmCoding:openai/gpt-5.6-sol",
      "llbmCoding:z-ai/glm-5.3",
      "llbmIntelligence:anthropic/claude-fable-5",
      "llbmIntelligence:moonshotai/kimi-k2.6",
      "llbmIntelligence:openai/gpt-5.2",
    ]);

    const vl_fable = vl_result.value[0];
    expect(vl_fable?.benchmarkId).toBe("llbmCoding");
    expect(vl_fable?.variant).toBe("llbm-aa_coding_index");
    expect(vl_fable?.score).toBe(76.5);
    expect(vl_fable?.scoreUnit).toBe("percent");
    expect(vl_fable?.sampleCount).toBeNull();
    expect(vl_fable?.windowStart).toBeNull();
    expect(vl_fable?.windowEnd).toBeNull();
    expect(vl_fable?.matchType).toBeNull();
    expect(vl_fable?.sourceUrl).toBe("https://artificialanalysis.ai/models");
    expect(vl_fable?.evaluatedAt).toBe("2026-10-25T00:00:00.000Z");

    const vl_fableIntel = vl_result.value.find(
      (p_row) =>
        p_row.benchmarkId === "llbmIntelligence" &&
        p_row.sourceModelId === "anthropic/claude-fable-5",
    );
    expect(vl_fableIntel?.variant).toBe("llbm-aa_intelligence_index");
    expect(vl_fableIntel?.score).toBe(49.6);

    // The duplicate setting row loses to the higher score.
    const vl_sol = vl_result.value.find(
      (p_row) => p_row.sourceModelId === "openai/gpt-5.6-sol",
    );
    expect(vl_sol?.score).toBe(77.4);

    // Rows for other metrics (unit "usd") never enter the scored set.
    const vl_kimi = vl_result.value.find(
      (p_row) =>
        p_row.benchmarkId === "llbmCoding" &&
        p_row.sourceModelId === "moonshotai/kimi-k2.6",
    );
    expect(vl_kimi?.score).toBe(61.8);

    const vl_duplicates = vl_result.warnings.filter(
      (p_warning) => p_warning.code === "duplicate-score-row",
    );
    expect(vl_duplicates).toHaveLength(1);
    expect(vl_result.warnings).toHaveLength(1);
  });

  test("scales ratio values to two-decimal percents", () => {
    const vl_result = f_parseLlbmExport(
      fh_exportPayload([fh_scoreRow({ unit: "ratio", value: 0.55 })]),
    );

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(vl_result.value[0]?.score).toBe(55);
  });

  test("skips unsupported units with a warning", () => {
    const vl_result = f_parseLlbmExport(
      fh_exportPayload([
        fh_scoreRow({ modelId: "elo/model", unit: "elo", value: 1300 }),
        fh_scoreRow({ modelId: "keep/model", value: 60 }),
      ]),
    );

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(vl_result.value.map((p_row) => p_row.sourceModelId)).toEqual([
      "keep/model",
    ]);
    expect(vl_result.warnings[0]?.code).toBe("unsupported-unit");
  });

  test("skips out-of-range scores with a warning", () => {
    const vl_result = f_parseLlbmExport(
      fh_exportPayload([
        fh_scoreRow({ modelId: "big/model", value: 150 }),
        fh_scoreRow({ modelId: "negative/model", value: -1 }),
      ]),
    );

    expect(vl_result.ok).toBe(false);
    if (vl_result.ok) return;
    expect(vl_result.error).toContain("no score rows");
    expect(
      vl_result.warnings.every((p_warning) => p_warning.code === "score-out-of-range"),
    ).toBe(true);
    expect(vl_result.warnings).toHaveLength(2);
  });

  test("warns about malformed rows and keeps valid ones", () => {
    const vl_result = f_parseLlbmExport(
      fh_exportPayload([
        fh_scoreRow({ modelId: "" }),
        fh_scoreRow({ modelId: "string/model", value: "70" }),
        fh_scoreRow({ modelId: "good/model", value: 70 }),
      ]),
    );

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(vl_result.value.map((p_row) => p_row.sourceModelId)).toEqual([
      "good/model",
    ]);
    expect(vl_result.warnings).toHaveLength(2);
    expect(
      vl_result.warnings.every((p_warning) => p_warning.code === "malformed-score-row"),
    ).toBe(true);
  });

  test("keeps a single scored metric and fails only when none is scored", () => {
    const vl_intelOnly = f_parseLlbmExport(
      fh_exportPayload([fh_scoreRow({ metric: "aa_intelligence_index", value: 40 })]),
    );

    expect(vl_intelOnly.ok).toBe(true);
    if (!vl_intelOnly.ok) return;
    expect(vl_intelOnly.value.map((p_row) => p_row.benchmarkId)).toEqual([
      "llbmIntelligence",
    ]);

    const vl_none = f_parseLlbmExport(
      fh_exportPayload([fh_scoreRow({ metric: "matharena_expected_cost_usd" })]),
    );

    expect(vl_none.ok).toBe(false);
    if (vl_none.ok) return;
    expect(vl_none.error).toBe(
      "LLMBM returned no score rows for any supported metric",
    );
  });

  test("rejects malformed export structures", () => {
    const vl_payload = f_parseLlbmExport("not-an-object");
    expect(vl_payload.ok).toBe(false);
    if (vl_payload.ok) return;
    expect(vl_payload.error).toBe("LLMBM export payload is not an object");

    const vl_noDataset = f_parseLlbmExport({});
    expect(vl_noDataset.ok).toBe(false);
    if (vl_noDataset.ok) return;
    expect(vl_noDataset.error).toBe("LLMBM export is missing its dataset object");

    const vl_noScores = f_parseLlbmExport({ dataset: {} });
    expect(vl_noScores.ok).toBe(false);
    if (vl_noScores.ok) return;
    expect(vl_noScores.error).toBe("LLMBM export dataset has no scores array");

    const vl_noRows = f_parseLlbmExport(fh_exportPayload([]));
    expect(vl_noRows.ok).toBe(false);
    if (vl_noRows.ok) return;
    expect(vl_noRows.error).toContain("no score rows");
  });
});

describe("f_fetchLlbmBenchmarks", () => {
  test("fetches the export URL and parses the payload", async () => {
    const vl_requested: unknown[] = [];
    const vl_result = await f_fetchLlbmBenchmarks({
      timeoutMs: 1_000,
      fetchImpl: (p_url: unknown) => {
        vl_requested.push(p_url);
        return Promise.resolve(fh_jsonResponse(llbmFixture));
      },
    });

    expect(vl_result.ok).toBe(true);
    expect(vl_requested).toEqual([k_llbmExportUrl]);
    if (!vl_result.ok) return;
    expect(vl_result.value).toHaveLength(9);
  });

  test("reports a sanitized error for HTTP failures", async () => {
    const vl_result = await f_fetchLlbmBenchmarks({
      timeoutMs: 1_000,
      maxAttempts: 1,
      fetchImpl: () => Promise.resolve(fh_jsonResponse({ error: "boom" }, 500)),
    });

    expect(vl_result.ok).toBe(false);
    if (vl_result.ok) return;
    expect(vl_result.error.length).toBeGreaterThan(0);
    expect(vl_result.error).not.toContain(k_llbmExportUrl);
  });
});