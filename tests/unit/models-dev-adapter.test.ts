/**
 * models.dev crosswalk adapter tests (Adjustment 16). Fixture-driven only —
 * no live network in the ordinary suite.
 */

import { describe, expect, test } from "bun:test";

import modelDevFixture from "../fixtures/models-dev.sample.json";
import {
  f_fetchModelsDevCrosswalk,
  f_parseModelsDevCrosswalk,
  k_modelsDevProviderId,
  k_modelsDevUrl,
} from "../../src/providers/models-dev";

function fh_jsonResponse(p_body: unknown, p_status = 200): Response {
  return new Response(JSON.stringify(p_body), {
    status: p_status,
    headers: { "content-type": "application/json" },
  });
}

describe("f_parseModelsDevCrosswalk", () => {
  test("trims the fixture to name/family/releaseDate", () => {
    const vl_result = f_parseModelsDevCrosswalk(modelDevFixture);

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(vl_result.warnings).toEqual([]);
    const vl_keys = Object.keys(vl_result.value);
    expect(vl_keys).toHaveLength(130);
    expect(vl_keys.every((p_key) => p_key.startsWith("opencode/"))).toBe(true);
    for (const vl_expected of [
      "opencode/gpt-6-luna",
      "opencode/big-pickle",
      "opencode/beam-free",
      "opencode/kimi-k2.6",
    ]) {
      expect(vl_keys).toContain(vl_expected);
    }

    const vl_luna = vl_result.value["opencode/gpt-6-luna"];
    expect(vl_luna?.name).toBe("GPT-6 Luna");
    expect(vl_luna?.family).toBe("gpt-luna");
    expect(vl_luna?.releaseDate?.startsWith("2026-09-22")).toBe(true);

    const vl_beam = vl_result.value["opencode/beam-free"];
    expect(vl_beam?.family).toBe("beam");

    const vl_pickle = vl_result.value["opencode/big-pickle"];
    expect(vl_pickle?.releaseDate?.startsWith("2025-10-17")).toBe(true);
  });

  test("keeps only the opencode provider", () => {
    const vl_result = f_parseModelsDevCrosswalk(modelDevFixture);

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(
      Object.keys(vl_result.value).every((p_key) =>
        p_key.startsWith(`${k_modelsDevProviderId}/`),
      ),
    ).toBe(true);
    expect(vl_result.value["openai/gpt-4o"]).toBeUndefined();
  });

  test("skips invalid entries with warnings", () => {
    const vl_result = f_parseModelsDevCrosswalk({
      opencode: {
        models: {
          "good-model": { name: "Good Model" },
          "bad-entry": "not-an-object",
          "": { name: "Empty Key" },
          "no-name": { family: "x" },
        },
      },
    });

    expect(vl_result.ok).toBe(true);
    if (!vl_result.ok) return;
    expect(Object.keys(vl_result.value)).toEqual(["opencode/good-model"]);
    expect(vl_result.warnings.length).toBeGreaterThan(0);
    expect(
      vl_result.warnings.every((p_warning) => p_warning.code === "skipped-model"),
    ).toBe(true);
    expect(vl_result.value["opencode/good-model"]?.family).toBeNull();
    expect(vl_result.value["opencode/good-model"]?.releaseDate).toBeNull();
  });

  test("fails when no usable opencode models are present", () => {
    expect(f_parseModelsDevCrosswalk({}).ok).toBe(false);
    expect(f_parseModelsDevCrosswalk({ openai: { models: {} } }).ok).toBe(false);
    expect(f_parseModelsDevCrosswalk("not-json").ok).toBe(false);
    expect(f_parseModelsDevCrosswalk({ opencode: { models: { bad: 1 } } }).ok).toBe(
      false,
    );
  });
});

describe("f_fetchModelsDevCrosswalk", () => {
  test("fetches the catalog URL and parses the payload", async () => {
    const vl_requested: unknown[] = [];
    const vl_result = await f_fetchModelsDevCrosswalk({
      timeoutMs: 1_000,
      fetchImpl: (p_url: unknown) => {
        vl_requested.push(p_url);
        return Promise.resolve(fh_jsonResponse(modelDevFixture));
      },
    });

    expect(vl_result.ok).toBe(true);
    expect(vl_requested).toEqual([k_modelsDevUrl]);
    if (!vl_result.ok) return;
    expect(Object.keys(vl_result.value)).toHaveLength(130);
  });

  test("reports a sanitized error for HTTP failures", async () => {
    const vl_result = await f_fetchModelsDevCrosswalk({
      timeoutMs: 1_000,
      maxAttempts: 1,
      fetchImpl: () => Promise.resolve(fh_jsonResponse({ error: "boom" }, 500)),
    });

    expect(vl_result.ok).toBe(false);
    if (vl_result.ok) return;
    expect(vl_result.error).not.toContain(k_modelsDevUrl);
    expect(vl_result.error.length).toBeGreaterThan(0);
  });
});
