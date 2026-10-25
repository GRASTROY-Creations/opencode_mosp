/**
 * Small builder shared by the Phase 4 service tests. Values are explicit
 * defaults, not fixtures from a live source: tests should fail if a missing
 * value silently turns into a zero.
 */

import {
  k_llbmMetric,
  type BenchmarkId,
  type ModelBenchmark,
} from "../../src/domain/model-benchmark";
import type {
  ModelPricingTier,
} from "../../src/domain/model-pricing";
import type { ModelRecord, ModelSource } from "../../src/domain/model-record";

export interface TestModelOptions {
  readonly id?: string;
  readonly modelId?: string;
  readonly providerId?: string;
  readonly canonicalId?: string | null;
  readonly name?: string;
  readonly providerName?: string;
  readonly releaseDate?: string | null;
  readonly contextWindow?: number | null;
  readonly inputPrice?: number | null;
  readonly outputPrice?: number | null;
  readonly tiers?: readonly ModelPricingTier[];
  readonly benchmarks?: readonly ModelBenchmark[];
  readonly source?: ModelSource;
}

export function f_createTestModel(
  p_options: TestModelOptions = {},
): ModelRecord {
  const vl_providerId = p_options.providerId ?? "test";
  const vl_modelId = p_options.modelId ?? "model-a";

  return {
    id: p_options.id ?? `${vl_providerId}/${vl_modelId}`,
    modelId: vl_modelId,
    canonicalId: p_options.canonicalId ?? null,
    name: p_options.name ?? `Model ${vl_modelId}`,
    providerId: vl_providerId,
    providerName: p_options.providerName ?? "Test Provider",
    releaseDate: p_options.releaseDate ?? null,
    contextWindow: p_options.contextWindow ?? null,
    pricing: {
      inputUsdPerMillionTokens: p_options.inputPrice ?? null,
      outputUsdPerMillionTokens: p_options.outputPrice ?? null,
      cacheReadUsdPerMillionTokens: null,
      cacheWriteUsdPerMillionTokens: null,
      currency: "USD",
      source: "test",
      observedAt: null,
      tiers: p_options.tiers ?? [],
    },
    benchmarks: p_options.benchmarks ?? [],
    source: p_options.source ?? "merged",
    lastUpdatedAt: "2026-10-24T00:00:00.000Z",
  };
}

export function f_createTestBenchmark(
  p_benchmarkId: BenchmarkId,
  p_score: number | null,
  p_overrides: Partial<ModelBenchmark> = {},
): ModelBenchmark {
  return {
    benchmarkId: p_benchmarkId,
    variant: k_llbmMetric,
    score: p_score,
    scoreUnit: "percent",
    rank: null,
    sampleCount: null,
    windowStart: null,
    windowEnd: null,
    sourceModelId: "source-model",
    matchType: null,
    sourceUrl: null,
    evaluatedAt: null,
    ...p_overrides,
  };
}