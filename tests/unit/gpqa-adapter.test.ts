import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { k_gpqaVariant, type ModelBenchmark } from "../../src/domain/model-benchmark";
import type { AdapterResult } from "../../src/providers/adapter-result";
import {
  f_buildHuggingFaceLeaderboardUrl,
  f_fetchGpqaBenchmarks,
  f_parseGpqaLeaderboard,
  k_gpqaLeaderboardUrl,
} from "../../src/providers/huggingface-gpqa";

function fh_loadFixture(p_name: string): unknown {
  const vl_path = new URL(`../fixtures/${p_name}`, import.meta.url);

  return JSON.parse(readFileSync(vl_path, "utf8")) as unknown;
}

function fh_expectBenchmarks(
  p_result: AdapterResult<readonly ModelBenchmark[]>,
): readonly ModelBenchmark[] {
  if (!p_result.ok) {
    throw new Error(p_result.error);
  }

  return p_result.value;
}

describe("Hugging Face GPQA adapter", () => {
  test("keeps only gpqa_diamond rows and never reuses the HF rank", () => {
    const vl_result = f_parseGpqaLeaderboard(
      fh_loadFixture("hf-gpqa-leaderboard.sample.json"),
    );
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(3);
    expect(vl_benchmarks.map((p_entry) => p_entry.sourceModelId)).toEqual([
      "FINAL-Bench/Darwin-180B-RSI",
      "FINAL-Bench/Darwin-397B-ZTC",
      "FINAL-Bench/Darwin-398B-JGOS",
    ]);

    const vl_first = vl_benchmarks[0];

    expect(vl_first?.benchmarkId).toBe("gpqa");
    expect(vl_first?.variant).toBe(k_gpqaVariant);
    expect(vl_first?.score).toBe(94.44);
    expect(vl_first?.scoreUnit).toBe("percent");
    expect(vl_first?.rank).toBeNull();
    expect(vl_first?.sampleCount).toBeNull();
    expect(vl_first?.windowStart).toBeNull();
    expect(vl_first?.windowEnd).toBeNull();
    expect(vl_first?.evaluatedAt).toBeNull();
    expect(vl_first?.sourceUrl).toBe(
      "https://huggingface.co/FINAL-Bench/Darwin-180B-RSI",
    );
  });

  test("skips a row marked lower-is-better", () => {
    const vl_fixture = fh_loadFixture(
      "hf-gpqa-leaderboard.sample.json",
    ) as readonly Record<string, unknown>[];
    const vl_first = vl_fixture[0];

    if (vl_first === undefined) {
      throw new Error("fixture is empty");
    }

    const vl_result = f_parseGpqaLeaderboard([
      { ...vl_first, lower_is_better: true },
      ...vl_fixture.slice(1),
    ]);
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(2);
    expect(
      vl_result.ok &&
        vl_result.warnings.some((p_warning) =>
          p_warning.message.includes("higher-is-better"),
        ),
    ).toBe(true);
  });

  test("leaves conflicting duplicate models unmatched", () => {
    const vl_fixture = fh_loadFixture(
      "hf-gpqa-leaderboard.sample.json",
    ) as readonly Record<string, unknown>[];
    const vl_first = vl_fixture[0];
    const vl_second = vl_fixture[1];

    if (vl_first === undefined || vl_second === undefined) {
      throw new Error("fixture is incomplete");
    }

    const vl_result = f_parseGpqaLeaderboard([
      vl_first,
      { ...vl_first, value: 90 },
      vl_second,
    ]);
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(1);
    expect(vl_benchmarks[0]?.sourceModelId).toBe(
      "FINAL-Bench/Darwin-397B-ZTC",
    );
    expect(vl_result.ok).toBe(true);
    expect(vl_result.warnings).toContainEqual({
      code: "duplicate-model",
      message:
        "multiple GPQA Diamond rows for FINAL-Bench/Darwin-180B-RSI; model left unmatched",
    });
  });

  test("skips out-of-range scores and falls back to the leaderboard URL", () => {
    const vl_fixture = fh_loadFixture(
      "hf-gpqa-leaderboard.sample.json",
    ) as readonly Record<string, unknown>[];
    const vl_first = vl_fixture[0];
    const vl_second = vl_fixture[1];

    if (vl_first === undefined || vl_second === undefined) {
      throw new Error("fixture is incomplete");
    }

    const vl_result = f_parseGpqaLeaderboard([
      { ...vl_first, value: 101, source: null },
      { ...vl_second, source: { url: "javascript:alert(1)" } },
    ]);
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(1);
    expect(vl_benchmarks[0]?.sourceUrl).toBe(k_gpqaLeaderboardUrl);
    expect(
      vl_result.ok &&
        vl_result.warnings.some((p_warning) =>
          p_warning.message.includes("invalid score"),
        ),
    ).toBe(true);
  });

  test("fails when no Diamond rows remain", () => {
    const vl_fixture = fh_loadFixture(
      "hf-gpqa-leaderboard.sample.json",
    ) as readonly Record<string, unknown>[];
    const vl_baseOnly = vl_fixture.filter(
      (p_row) => p_row.filename !== ".eval_results/gpqa_diamond.yaml",
    );

    const vl_result = f_parseGpqaLeaderboard(vl_baseOnly);

    expect(vl_result.ok).toBe(false);
  });

  test("builds the documented URL with encoded dataset segments", () => {
    expect(f_buildHuggingFaceLeaderboardUrl("org/my dataset")).toBe(
      "https://huggingface.co/api/datasets/org/my%20dataset/leaderboard",
    );
  });

  test("fetches and parses the fixture through the injected fetch", async () => {
    const vl_requests: string[] = [];
    const vl_payload = fh_loadFixture("hf-gpqa-leaderboard.sample.json");

    const vl_result = await f_fetchGpqaBenchmarks({
      timeoutMs: 1_000,
      fetchImpl: (p_url) => {
        vl_requests.push(p_url);

        return Promise.resolve(
          new Response(JSON.stringify(vl_payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    });

    expect(vl_requests).toEqual([
      "https://huggingface.co/api/datasets/Idavidrein/gpqa/leaderboard",
    ]);
    expect(fh_expectBenchmarks(vl_result)).toHaveLength(3);
  });
});
