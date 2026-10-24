/**
 * Unit tests for the panel controller's pure logic and format helpers.
 *
 * The controller factory itself needs a host, so these tests cover every
 * decision that can be exercised without one: sorting/ranking state
 * transitions, command parsing, row derivation, and status text.
 */

import { describe, expect, test } from "bun:test";
import type { OverviewState, SourceStatus } from "../../src/domain/source-status";
import type { ModelOverviewSnapshot } from "../../src/services/model-overview";
import {
  f_formatContext,
  f_formatPrice,
  f_formatRank,
  f_formatScore,
  f_formatTimestamp,
  f_truncate,
} from "../../src/ui/format";
import {
  f_buildSidebarSummary,
  f_buildStatusLine,
  f_buildStatusLines,
  f_deriveOverviewRows,
  f_getDefaultSortDirection,
  f_getSortKeyLabel,
  f_nextRankingState,
  f_nextSortState,
  f_parseOverviewCommand,
  k_defaultFilters,
  k_defaultSearchState,
  k_defaultViewPreferences,
  type OverviewViewPreferences,
} from "../../src/ui/panel-controller";
import { f_createTestBenchmark, f_createTestModel } from "./test-models";

function fh_preferences(p_overrides: Partial<OverviewViewPreferences> = {}): OverviewViewPreferences {
  return { ...k_defaultViewPreferences, ...p_overrides };
}

function f_createSnapshot(
  p_models: ModelOverviewSnapshot["models"],
  p_state: OverviewState = "ready",
  p_warningCount: number = 0,
): ModelOverviewSnapshot {
  const vl_source = (p_source: SourceStatus["source"]): SourceStatus => ({
    source: p_source,
    state: "fresh",
    lastSuccessAt: "2026-10-24T10:00:00.000Z",
    lastAttemptAt: "2026-10-24T10:00:00.000Z",
    error: null,
  });
  return {
    models: p_models,
    status: {
      state: p_state,
      lastRefreshAt: "2026-10-24T10:00:00.000Z",
      sources: [
        vl_source("opencode-models"),
        vl_source("opencode-pricing"),
        vl_source("gpqa"),
        vl_source("livecodebench"),
      ],
    },
    matches: [],
    unmatched: [],
    warnings: Array.from({ length: p_warningCount }, (_, p_index) => ({
      source: "gpqa",
      code: "test",
      message: `warning ${p_index}`,
    })),
  };
}

describe("format helpers", () => {
  test("prices distinguish missing, free, and paid", () => {
    expect(f_formatPrice(null)).toBe("—");
    expect(f_formatPrice(0)).toBe("free");
    expect(f_formatPrice(12.5)).toBe("$12.50/M");
    expect(f_formatPrice(0.05)).toBe("$0.05/M");
  });

  test("context windows use compact K/M form", () => {
    expect(f_formatContext(null)).toBe("—");
    expect(f_formatContext(131_072)).toBe("131K");
    expect(f_formatContext(1_000_000)).toBe("1.0M");
  });

  test("scores and ranks never fabricate values", () => {
    expect(f_formatScore(null)).toBe("—");
    expect(f_formatScore(80.176)).toBe("80.2");
    expect(f_formatRank(null)).toBe("—");
    expect(f_formatRank(3)).toBe("#3");
  });

  test("timestamps render compactly and null means never", () => {
    expect(f_formatTimestamp(null)).toBe("never");
    expect(f_formatTimestamp("2026-10-24T12:34:56.000Z")).toBe("2026-10-24 12:34");
  });

  test("truncation keeps short values and ellipsizes long ones", () => {
    expect(f_truncate("short", 10)).toBe("short");
    expect(f_truncate("a-very-long-name", 8)).toBe("a-very-…");
    expect(f_truncate("anything", 0)).toBe("");
    expect(f_truncate("anything", 1)).toBe("…");
  });
});

describe("sort and ranking state", () => {
  test("default direction is descending for score/date columns, ascending otherwise", () => {
    expect(f_getDefaultSortDirection("gpqaScore")).toBe("desc");
    expect(f_getDefaultSortDirection("livecodebenchScore")).toBe("desc");
    expect(f_getDefaultSortDirection("releaseDate")).toBe("desc");
    expect(f_getDefaultSortDirection("gpqaRank")).toBe("asc");
    expect(f_getDefaultSortDirection("inputPrice")).toBe("asc");
    expect(f_getDefaultSortDirection("name")).toBe("asc");
  });

  test("selecting the active column toggles direction", () => {
    expect(f_nextSortState(fh_preferences({ sortKey: "name", sortDirection: "asc" }), "name")).toEqual({
      sortKey: "name",
      sortDirection: "desc",
    });
    expect(
      f_nextSortState(fh_preferences({ sortKey: "name", sortDirection: "desc" }), "name"),
    ).toEqual({ sortKey: "name", sortDirection: "asc" });
  });

  test("selecting a new column uses its default direction", () => {
    expect(f_nextSortState(fh_preferences({ sortKey: "name" }), "gpqaScore")).toEqual({
      sortKey: "gpqaScore",
      sortDirection: "desc",
    });
    expect(f_nextSortState(fh_preferences({ sortKey: "name" }), "inputPrice")).toEqual({
      sortKey: "inputPrice",
      sortDirection: "asc",
    });
  });

  test("switching ranking moves a benchmark sort column to the active benchmark", () => {
    expect(
      f_nextRankingState(fh_preferences({ ranking: "gpqa", sortKey: "gpqaRank", sortDirection: "desc" }), "livecodebench"),
    ).toEqual({ ranking: "livecodebench", sortKey: "livecodebenchRank", sortDirection: "asc" });
    expect(
      f_nextRankingState(
        fh_preferences({ ranking: "livecodebench", sortKey: "livecodebenchScore", sortDirection: "asc" }),
        "gpqa",
      ),
    ).toEqual({ ranking: "gpqa", sortKey: "gpqaRank", sortDirection: "asc" });
  });

  test("switching ranking keeps unrelated sort columns untouched", () => {
    expect(
      f_nextRankingState(fh_preferences({ ranking: "gpqa", sortKey: "name", sortDirection: "desc" }), "livecodebench"),
    ).toEqual({ ranking: "livecodebench", sortKey: "name", sortDirection: "desc" });
  });

  test("re-selecting the same ranking changes nothing", () => {
    const vl_preferences = fh_preferences({ ranking: "gpqa", sortKey: "gpqaScore", sortDirection: "desc" });
    expect(f_nextRankingState(vl_preferences, "gpqa")).toEqual({
      ranking: "gpqa",
      sortKey: "gpqaScore",
      sortDirection: "desc",
    });
  });
});

describe("command parsing", () => {
  test("empty input and toggle both toggle the panel", () => {
    expect(f_parseOverviewCommand("")).toEqual({ kind: "toggle" });
    expect(f_parseOverviewCommand("  ")).toEqual({ kind: "toggle" });
    expect(f_parseOverviewCommand("toggle")).toEqual({ kind: "toggle" });
  });

  test("status and refresh parse case-insensitively", () => {
    expect(f_parseOverviewCommand(" STATUS ")).toEqual({ kind: "status" });
    expect(f_parseOverviewCommand("Refresh")).toEqual({ kind: "refresh" });
  });

  test("sort accepts friendly aliases and column keys", () => {
    expect(f_parseOverviewCommand("sort gpqa")).toEqual({ kind: "sort", key: "gpqaRank" });
    expect(f_parseOverviewCommand("sort lcb")).toEqual({ kind: "sort", key: "livecodebenchRank" });
    expect(f_parseOverviewCommand("sort input-price")).toEqual({ kind: "sort", key: "inputPrice" });
    expect(f_parseOverviewCommand("sort inputPrice")).toEqual({ kind: "sort", key: "inputPrice" });
    expect(f_parseOverviewCommand("sort output-price")).toEqual({ kind: "sort", key: "outputPrice" });
    expect(f_parseOverviewCommand("sort releaseDate")).toEqual({ kind: "sort", key: "releaseDate" });
  });

  test("invalid commands are rejected", () => {
    expect(f_parseOverviewCommand("sort")).toBeUndefined();
    expect(f_parseOverviewCommand("sort nonsense")).toBeUndefined();
    expect(f_parseOverviewCommand("ranking lcb")).toBeUndefined();
    expect(f_parseOverviewCommand("nope")).toBeUndefined();
  });

  test("ranking parses both verified benchmarks", () => {
    expect(f_parseOverviewCommand("ranking gpqa")).toEqual({ kind: "ranking", ranking: "gpqa" });
    expect(f_parseOverviewCommand("ranking livecodebench")).toEqual({
      kind: "ranking",
      ranking: "livecodebench",
    });
  });

  test("extra trailing tokens are ignored", () => {
    expect(f_parseOverviewCommand("toggle extra words")).toEqual({ kind: "toggle" });
  });

  test("sort key labels are human readable", () => {
    expect(f_getSortKeyLabel("name")).toBe("Model");
    expect(f_getSortKeyLabel("providerName")).toBe("Provider");
    expect(f_getSortKeyLabel("gpqaScore")).toBe("GPQA");
    expect(f_getSortKeyLabel("livecodebenchRank")).toBe("LCB");
    expect(f_getSortKeyLabel("inputPrice")).toBe("In $/M");
  });
});

describe("derived rows", () => {
  const vl_models = [
    f_createTestModel({
      id: "anthropic/claude-test",
      modelId: "claude-test",
      providerId: "anthropic",
      providerName: "Anthropic",
      name: "Claude Test",
      inputPrice: 3,
      outputPrice: 15,
      benchmarks: [f_createTestBenchmark("gpqa", 80.1, { rank: 2 })],
    }),
    f_createTestModel({
      id: "openai/gpt-test",
      modelId: "gpt-test",
      providerId: "openai",
      providerName: "OpenAI",
      name: "GPT Test",
      inputPrice: 0,
      outputPrice: 0,
    }),
    f_createTestModel({
      id: "google/gemini-test",
      modelId: "gemini-test",
      providerId: "google",
      providerName: "Google",
      name: "Gemini Test",
      inputPrice: null,
      outputPrice: null,
      benchmarks: [f_createTestBenchmark("livecodebench", 50.5, { rank: 1 })],
    }),
  ];

  test("no filters returns everything sorted by the active column", () => {
    const vl_rows = f_deriveOverviewRows(vl_models, fh_preferences(), k_defaultSearchState, k_defaultFilters);
    expect(vl_rows.totalCount).toBe(3);
    expect(vl_rows.filteredCount).toBe(3);
    // Default is gpqaRank asc with missing ranks last (ties break by model ID).
    expect(vl_rows.rows.map((p_model) => p_model.id)).toEqual([
      "anthropic/claude-test",
      "google/gemini-test",
      "openai/gpt-test",
    ]);
  });

  test("search matches name, provider, and ids case-insensitively", () => {
    const vl_byName = f_deriveOverviewRows(
      vl_models,
      fh_preferences(),
      { text: "CLAUDE" },
      k_defaultFilters,
    );
    expect(vl_byName.rows.map((p_model) => p_model.id)).toEqual(["anthropic/claude-test"]);
    const vl_byProvider = f_deriveOverviewRows(
      vl_models,
      fh_preferences(),
      { text: "openai" },
      k_defaultFilters,
    );
    expect(vl_byProvider.rows.map((p_model) => p_model.id)).toEqual(["openai/gpt-test"]);
  });

  test("free filter requires explicit zero pricing", () => {
    const vl_rows = f_deriveOverviewRows(
      vl_models,
      fh_preferences(),
      k_defaultSearchState,
      { ...k_defaultFilters, freeOnly: true },
    );
    expect(vl_rows.rows.map((p_model) => p_model.id)).toEqual(["openai/gpt-test"]);
  });

  test("missing-benchmark filters select models without a score", () => {
    const vl_gpqa = f_deriveOverviewRows(
      vl_models,
      fh_preferences(),
      k_defaultSearchState,
      { ...k_defaultFilters, missingGpqa: true },
    );
    expect(vl_gpqa.rows.map((p_model) => p_model.id)).toEqual([
      "google/gemini-test",
      "openai/gpt-test",
    ]);
    const vl_lcb = f_deriveOverviewRows(
      vl_models,
      fh_preferences(),
      k_defaultSearchState,
      { ...k_defaultFilters, missingLiveCodeBench: true },
    );
    expect(vl_lcb.rows.map((p_model) => p_model.id)).toEqual([
      "anthropic/claude-test",
      "openai/gpt-test",
    ]);
  });

  test("price sorting is numeric with missing values last", () => {
    const vl_asc = f_deriveOverviewRows(
      vl_models,
      fh_preferences({ sortKey: "inputPrice", sortDirection: "asc" }),
      k_defaultSearchState,
      k_defaultFilters,
    );
    expect(vl_asc.rows.map((p_model) => p_model.id)).toEqual([
      "openai/gpt-test",
      "anthropic/claude-test",
      "google/gemini-test",
    ]);
  });
});

describe("status text", () => {
  test("status line covers missing data, loading, and errors", () => {
    expect(f_buildStatusLine(undefined, false, null)).toBe(
      "no cached data — run /model-overview refresh",
    );
    expect(f_buildStatusLine(undefined, true, null)).toBe("refreshing…");
    expect(f_buildStatusLine(f_createSnapshot([]), false, "boom")).toBe("error: boom");
  });

  test("status line summarizes aggregate state, sources, and warnings", () => {
    const vl_line = f_buildStatusLine(f_createSnapshot([], "partial", 2), false, null);
    expect(vl_line).toContain("partial");
    expect(vl_line).toContain("models: fresh");
    expect(vl_line).toContain("2 warning(s)");
    expect(vl_line).toContain("updated 2026-10-24 10:00");
  });

  test("status dialog lists configuration and search state", () => {
    const vl_rows = f_deriveOverviewRows(f_createDialogModels(), fh_preferences(), { text: "gpt" }, {
      ...k_defaultFilters,
      freeOnly: true,
    });
    const vl_lines = f_buildStatusLines(
      f_createSnapshot(f_createDialogModels()),
      vl_rows,
      fh_preferences({ sortKey: "inputPrice", sortDirection: "desc" }),
      "gpt",
      { ...k_defaultFilters, freeOnly: true },
      false,
      null,
    );
    expect(vl_lines.length).toBeGreaterThanOrEqual(4);
    expect(vl_lines[0]).toBe(
      `status: ${f_buildStatusLine(f_createSnapshot(f_createDialogModels()), false, null)}`,
    );
    expect(vl_lines.join("\n")).toContain("sort: In $/M descending");
    expect(vl_lines.join("\n")).toContain("search: gpt");
    expect(vl_lines.join("\n")).toContain("filters: free");
  });

  test("sidebar summary shows the ranking leader or an honest gap", () => {
    const vl_leader = f_createTestModel({
      id: "anthropic/claude-test",
      name: "Claude Test",
      benchmarks: [f_createTestBenchmark("gpqa", 80.1, { rank: 1 })],
    });
    expect(f_buildSidebarSummary(vl_leader, 16, "gpqa")).toBe(
      "16 models · GPQA #1 Claude Test 80.1",
    );
    expect(f_buildSidebarSummary(null, 16, "livecodebench")).toBe(
      "16 models · no LCB data",
    );
  });
});

function f_createDialogModels() {
  return [
    f_createTestModel({
      id: "openai/gpt-test",
      modelId: "gpt-test",
      providerId: "openai",
      providerName: "OpenAI",
      name: "GPT Test",
      inputPrice: 0,
      outputPrice: 0,
    }),
  ];
}
