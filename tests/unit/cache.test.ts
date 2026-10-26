import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { SourceId } from "../../src/domain/source-status";
import {
  f_createFileCache,
  f_createMemoryCache,
  f_getDefaultCacheDirectory,
  f_resolveCacheTtls,
  k_cacheDirectoryEnv,
  k_cacheSchemaVersion,
  k_defaultBenchmarkCacheTtlMs,
  k_defaultModelCacheTtlMs,
} from "../../src/services/cache";

const k_now = new Date("2026-10-24T12:00:00.000Z");
const k_ttlMs = 60_000;
const k_payload = [{ source: "fixture", value: 42 }];

async function fh_createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "model-overview-cache-"));
}

describe("f_createMemoryCache", () => {
  test("round-trips a payload and uses a unique default key", async () => {
    const vl_first = f_createMemoryCache();
    const vl_second = f_createMemoryCache();

    expect(vl_first.key).not.toBe(vl_second.key);

    const vl_write = await vl_first.write("llbm", k_payload, k_now, k_ttlMs);
    expect(vl_write).toEqual({ ok: true });

    const vl_read = await vl_first.read("llbm", k_now);
    expect(vl_read.ok).toBe(true);

    if (!vl_read.ok) {
      throw new Error("expected a cached entry");
    }

    expect(vl_read.value.fresh).toBe(true);
    expect(vl_read.value.envelope).toMatchObject({
      schemaVersion: k_cacheSchemaVersion,
      source: "llbm",
      fetchedAt: k_now.toISOString(),
      ttlMs: k_ttlMs,
    });
    expect(vl_read.value.envelope.payload).toEqual(k_payload);
  });

  test("reports missing entries and enforces the freshness boundary", async () => {
    const vl_cache = f_createMemoryCache();

    expect(await vl_cache.read("llbm", k_now)).toEqual({
      ok: false,
      reason: "missing",
    });

    await vl_cache.write("llbm", k_payload, k_now, k_ttlMs);

    const vl_atBoundary = await vl_cache.read("llbm", new Date(k_now.getTime() + k_ttlMs));
    expect(vl_atBoundary.ok).toBe(true);

    if (vl_atBoundary.ok) {
      expect(vl_atBoundary.value.fresh).toBe(true);
    }

    const vl_afterBoundary = await vl_cache.read("llbm", new Date(k_now.getTime() + k_ttlMs + 1));
    expect(vl_afterBoundary.ok).toBe(true);

    if (vl_afterBoundary.ok) {
      expect(vl_afterBoundary.value.fresh).toBe(false);
    }
  });

  test("rejects invalid sources and TTL values", async () => {
    const vl_cache = f_createMemoryCache();
    const vl_invalidSource = "not-a-source" as SourceId;

    expect(await vl_cache.write(vl_invalidSource, k_payload, k_now, k_ttlMs)).toEqual({
      ok: false,
      error: "cache source is invalid",
    });

    expect(await vl_cache.write("llbm", k_payload, k_now, -1)).toEqual({
      ok: false,
      error: "cache TTL is invalid",
    });

    expect(await vl_cache.write("llbm", k_payload, k_now, Number.NaN)).toEqual({
      ok: false,
      error: "cache TTL is invalid",
    });
  });
});

describe("f_createFileCache", () => {
  test("writes one atomic file per source and reads it back", async () => {
    const vl_directory = await fh_createTempDirectory();

    try {
      const vl_cache = f_createFileCache(vl_directory);

      expect(vl_cache.key).toBe(`file:${resolve(vl_directory)}`);
      expect(await vl_cache.read("llbm", k_now)).toEqual({
        ok: false,
        reason: "missing",
      });

      const vl_write = await vl_cache.write("llbm", k_payload, k_now, k_ttlMs);
      expect(vl_write).toEqual({ ok: true });

      const vl_read = await vl_cache.read("llbm", k_now);
      expect(vl_read.ok).toBe(true);

      if (!vl_read.ok) {
        throw new Error("expected a cached entry");
      }

      expect(vl_read.value.envelope.payload).toEqual(k_payload);
      expect(vl_read.value.fresh).toBe(true);

      const vl_entries = await readdir(vl_directory);
      expect(vl_entries).toContain("llbm.json");
      expect(vl_entries.some((p_entry) => p_entry.endsWith(".tmp"))).toBe(false);
    } finally {
      await rm(vl_directory, { recursive: true, force: true });
    }
  });

  test("overwrites the previous entry instead of appending", async () => {
    const vl_directory = await fh_createTempDirectory();

    try {
      const vl_cache = f_createFileCache(vl_directory);

      await vl_cache.write("llbm", [{ version: 1 }], k_now, k_ttlMs);
      await vl_cache.write("llbm", [{ version: 2 }], new Date(k_now.getTime() + 1_000), k_ttlMs);

      const vl_read = await vl_cache.read("llbm", new Date(k_now.getTime() + 2_000));

      if (!vl_read.ok) {
        throw new Error("expected a cached entry");
      }

      expect(vl_read.value.envelope.payload).toEqual([{ version: 2 }]);

      const vl_entries = await readdir(vl_directory);
      expect(vl_entries).toEqual(["llbm.json"]);
    } finally {
      await rm(vl_directory, { recursive: true, force: true });
    }
  });

  test("maps corrupt JSON and mismatched envelopes to invalid", async () => {
    const vl_directory = await fh_createTempDirectory();

    try {
      const vl_cache = f_createFileCache(vl_directory);
      const vl_path = join(vl_directory, "llbm.json");

      await writeFile(vl_path, "{ not json", "utf8");
      expect(await vl_cache.read("llbm", k_now)).toEqual({
        ok: false,
        reason: "invalid",
      });

      await writeFile(
        vl_path,
        JSON.stringify({
          schemaVersion: k_cacheSchemaVersion + 1,
          source: "llbm",
          fetchedAt: k_now.toISOString(),
          ttlMs: k_ttlMs,
          payload: k_payload,
        }),
        "utf8",
      );
      expect(await vl_cache.read("llbm", k_now)).toEqual({
        ok: false,
        reason: "invalid",
      });

      await writeFile(
        vl_path,
        JSON.stringify({
          schemaVersion: k_cacheSchemaVersion,
          source: "models-dev",
          fetchedAt: k_now.toISOString(),
          ttlMs: k_ttlMs,
          payload: k_payload,
        }),
        "utf8",
      );
      expect(await vl_cache.read("llbm", k_now)).toEqual({
        ok: false,
        reason: "invalid",
      });
    } finally {
      await rm(vl_directory, { recursive: true, force: true });
    }
  });
});

describe("f_resolveCacheTtls", () => {
  test("uses defaults for missing or invalid environment values", () => {
    expect(f_resolveCacheTtls({})).toEqual({
      modelTtlMs: k_defaultModelCacheTtlMs,
      benchmarkTtlMs: k_defaultBenchmarkCacheTtlMs,
    });

    expect(
      f_resolveCacheTtls({
        OPENCODE_MODEL_CACHE_TTL_SECONDS: "0",
        OPENCODE_BENCHMARK_CACHE_TTL_SECONDS: "not-a-number",
      }),
    ).toEqual({
      modelTtlMs: k_defaultModelCacheTtlMs,
      benchmarkTtlMs: k_defaultBenchmarkCacheTtlMs,
    });
  });

  test("converts positive seconds to milliseconds", () => {
    expect(
      f_resolveCacheTtls({
        OPENCODE_MODEL_CACHE_TTL_SECONDS: "120",
        OPENCODE_BENCHMARK_CACHE_TTL_SECONDS: "7200",
      }),
    ).toEqual({
      modelTtlMs: 120_000,
      benchmarkTtlMs: 7_200_000,
    });
  });
});

describe("f_getDefaultCacheDirectory", () => {
  test("prefers the explicit environment variable", () => {
    const vl_previous = process.env[k_cacheDirectoryEnv];

    try {
      process.env[k_cacheDirectoryEnv] = "relative/cache";
      expect(f_getDefaultCacheDirectory()).toBe(resolve("relative/cache"));
    } finally {
      if (vl_previous === undefined) {
        delete process.env[k_cacheDirectoryEnv];
      } else {
        process.env[k_cacheDirectoryEnv] = vl_previous;
      }
    }
  });

  test("falls back to the XDG cache home", () => {
    const vl_previousDirectory = process.env[k_cacheDirectoryEnv];
    const vl_previousXdg = process.env.XDG_CACHE_HOME;

    try {
      delete process.env[k_cacheDirectoryEnv];
      process.env.XDG_CACHE_HOME = "/tmp/model-overview-xdg";

      expect(f_getDefaultCacheDirectory()).toBe(
        resolve("/tmp/model-overview-xdg", "opencode-model-overview"),
      );
    } finally {
      if (vl_previousDirectory !== undefined) {
        process.env[k_cacheDirectoryEnv] = vl_previousDirectory;
      }

      if (vl_previousXdg === undefined) {
        delete process.env.XDG_CACHE_HOME;
      } else {
        process.env.XDG_CACHE_HOME = vl_previousXdg;
      }
    }
  });
});
