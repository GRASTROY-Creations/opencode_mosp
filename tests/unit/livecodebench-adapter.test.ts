import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import type { ModelBenchmark } from "../../src/domain/model-benchmark";
import type { AdapterResult } from "../../src/providers/adapter-result";
import {
  f_deriveLiveCodeBenchWindow,
  f_fetchLiveCodeBench,
  f_parseLiveCodeBench,
  k_liveCodeBenchDataUrl,
  k_liveCodeBenchMinimumSamples,
  type LiveCodeBenchWindow,
} from "../../src/providers/livecodebench";

const k_fullFixtureWindow: LiveCodeBenchWindow = {
  startEpochMs: 1_692_662_400_000,
  endEpochMs: 1_696_118_400_000,
};

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

function fh_findBenchmark(
  p_benchmarks: readonly ModelBenchmark[],
  p_model: string,
): ModelBenchmark {
  const vl_match = p_benchmarks.find(
    (p_entry) => p_entry.sourceModelId === p_model,
  );

  if (vl_match === undefined) {
    throw new Error(`missing benchmark for ${p_model}`);
  }

  return vl_match;
}

describe("LiveCodeBench adapter", () => {
  test("derives the page's default window from short date_marks", () => {
    const vl_fixture = fh_loadFixture("livecodebench.sample.json") as {
      date_marks: number[];
    };
    const vl_window = f_deriveLiveCodeBenchWindow(vl_fixture.date_marks);

    if (!vl_window.ok) {
      throw new Error(vl_window.error);
    }

    expect(vl_window.value.startEpochMs).toBe(1_693_526_400_000);
    expect(vl_window.value.endEpochMs).toBe(1_696_118_400_000);
    expect(new Date(vl_window.value.startEpochMs).toISOString()).toBe(
      "2023-09-01T00:00:00.000Z",
    );
  });

  test("uses the default window when none is supplied", () => {
    const vl_result = f_parseLiveCodeBench(
      fh_loadFixture("livecodebench.sample.json"),
      { minimumSamples: 1 },
    );
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(3);

    const vl_deepseek = fh_findBenchmark(vl_benchmarks, "DeepSeek-V3");

    expect(vl_deepseek.score).toBe(60);
    expect(vl_deepseek.sampleCount).toBe(1);
    expect(vl_deepseek.windowStart).toBe("2023-09-01T00:00:00.000Z");
    expect(vl_deepseek.windowEnd).toBe("2023-10-01T00:00:00.000Z");
    expect(vl_deepseek.benchmarkId).toBe("livecodebench");
    expect(vl_deepseek.variant).toBe("generation");
    expect(vl_deepseek.rank).toBeNull();
    expect(vl_deepseek.evaluatedAt).toBeNull();
  });

  test("averages pass@1 over an explicit window and records sample counts", () => {
    const vl_result = f_parseLiveCodeBench(
      fh_loadFixture("livecodebench.sample.json"),
      { minimumSamples: 1, window: k_fullFixtureWindow },
    );
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(3);

    const vl_deepseek = fh_findBenchmark(vl_benchmarks, "DeepSeek-V3");
    const vl_turbo = fh_findBenchmark(
      vl_benchmarks,
      "GPT-4-Turbo-2024-04-09",
    );
    const vl_four = fh_findBenchmark(vl_benchmarks, "GPT-4O-2024-08-06");

    expect(vl_deepseek.score).toBe(90);
    expect(vl_turbo.score).toBe(27.5);
    expect(vl_four.score).toBe(35);
    expect(vl_deepseek.sampleCount).toBe(4);
    expect(vl_deepseek.sourceUrl).toBe(
      "https://huggingface.co/deepseek-ai/DeepSeek-V3",
    );
    expect(vl_deepseek.windowStart).toBe("2023-08-22T00:00:00.000Z");
    expect(vl_deepseek.windowEnd).toBe("2023-10-01T00:00:00.000Z");
  });

  test("omits models below the minimum sample guard", () => {
    const vl_result = f_parseLiveCodeBench(
      fh_loadFixture("livecodebench.sample.json"),
      { window: k_fullFixtureWindow },
    );
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(k_liveCodeBenchMinimumSamples).toBe(100);
    expect(vl_benchmarks).toHaveLength(0);
    expect(
      vl_result.ok &&
        vl_result.warnings.some(
          (p_warning) => p_warning.code === "below-minimum-samples",
        ),
    ).toBe(true);
  });

  test("leaves duplicate model representations unmatched", () => {
    const vl_fixture = fh_loadFixture("livecodebench.sample.json") as {
      models: unknown[];
      performances: unknown[];
      date_marks: number[];
    };
    const vl_firstModel = vl_fixture.models[0];

    if (vl_firstModel === undefined) {
      throw new Error("fixture has no models");
    }

    const vl_payload = {
      ...vl_fixture,
      models: [...vl_fixture.models, vl_firstModel],
    };
    const vl_result = f_parseLiveCodeBench(vl_payload, {
      minimumSamples: 1,
      window: k_fullFixtureWindow,
    });
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(2);
    expect(
      vl_benchmarks.some(
        (p_entry) => p_entry.sourceModelId === "DeepSeek-V3",
      ),
    ).toBe(false);
    expect(
      vl_result.ok &&
        vl_result.warnings.some(
          (p_warning) => p_warning.code === "duplicate-model",
        ),
    ).toBe(true);
  });

  test("ignores unknown models and invalid pass@1 values", () => {
    const vl_fixture = fh_loadFixture("livecodebench.sample.json") as {
      models: unknown[];
      performances: Record<string, unknown>[];
      date_marks: number[];
    };
    const vl_firstPerformance = vl_fixture.performances[0];

    if (vl_firstPerformance === undefined) {
      throw new Error("fixture has no performances");
    }

    const vl_payload = {
      ...vl_fixture,
      performances: [
        ...vl_fixture.performances,
        {
          ...vl_firstPerformance,
          model: "Unknown-Model",
        },
        {
          ...vl_firstPerformance,
          "pass@1": 150,
        },
      ],
    };
    const vl_result = f_parseLiveCodeBench(vl_payload, {
      minimumSamples: 1,
      window: k_fullFixtureWindow,
    });
    const vl_benchmarks = fh_expectBenchmarks(vl_result);

    expect(vl_benchmarks).toHaveLength(3);
    expect(
      vl_result.ok &&
        vl_result.warnings.some(
          (p_warning) => p_warning.code === "unknown-model",
        ),
    ).toBe(true);
    expect(
      vl_result.ok &&
        vl_result.warnings.some((p_warning) =>
          p_warning.message.includes("malformed"),
        ),
    ).toBe(true);
  });

  test("fails when the snapshot has no performances in the window", () => {
    const vl_fixture = fh_loadFixture("livecodebench.sample.json") as {
      date_marks: number[];
    };

    const vl_result = f_parseLiveCodeBench(vl_fixture, {
      minimumSamples: 1,
      window: {
        startEpochMs: 1_700_000_000_000,
        endEpochMs: 1_800_000_000_000,
      },
    });

    expect(vl_result.ok).toBe(false);
  });

  test("fetches and parses the fixture through the injected fetch", async () => {
    const vl_requests: string[] = [];
    const vl_payload = fh_loadFixture("livecodebench.sample.json");

    const vl_result = await f_fetchLiveCodeBench({
      timeoutMs: 1_000,
      minimumSamples: 1,
      window: k_fullFixtureWindow,
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

    expect(vl_requests).toEqual([k_liveCodeBenchDataUrl]);
    expect(fh_expectBenchmarks(vl_result)).toHaveLength(3);
  });
});
