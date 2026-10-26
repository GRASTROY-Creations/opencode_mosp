/**
 * Per-source cache for the model overview.
 *
 * The cache stores untrusted JSON payloads in a versioned envelope. It never
 * validates domain payloads itself: callers validate what they read before the
 * data reaches a `ModelRecord`. Writes are atomic (temporary file + rename) and
 * land in the user cache directory, never in the repository.
 *
 * Timestamps are stored as ISO-8601 UTC strings. `ttlMs` is stored with the
 * entry so a later process can decide freshness without re-reading config.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { f_isRecord } from "../domain/guards";
import { k_sourceIds, type SourceId } from "../domain/source-status";

/** Bump when the envelope or any cached payload shape changes. */
export const k_cacheSchemaVersion = 2;

/** Default model/pricing TTL: one hour (`OPENCODE_MODEL_CACHE_TTL_SECONDS`). */
export const k_defaultModelCacheTtlMs = 60 * 60 * 1000;

/** Default benchmark TTL: six hours (`OPENCODE_BENCHMARK_CACHE_TTL_SECONDS`). */
export const k_defaultBenchmarkCacheTtlMs = 6 * 60 * 60 * 1000;

/** Optional explicit cache directory; otherwise the XDG cache path is used. */
export const k_cacheDirectoryEnv = "OPENCODE_MOSP_CACHE_DIR";

/** One cache file, validated at the envelope level. */
export interface CacheEnvelope {
  readonly schemaVersion: number;
  readonly source: SourceId;
  /** When the data was retrieved (ISO-8601 UTC). */
  readonly fetchedAt: string;
  /** How long this entry stays fresh, in milliseconds. */
  readonly ttlMs: number;
  /** Untrusted source payload; only the caller knows its domain shape. */
  readonly payload: unknown;
}

/** A readable cache entry plus its freshness at the time of the read. */
export interface CachedSource {
  readonly envelope: CacheEnvelope;
  readonly fresh: boolean;
}

/** Why a cache read did not produce an entry. */
export type CacheReadFailure = "missing" | "invalid" | "unreadable";

export type CacheReadResult =
  | { readonly ok: true; readonly value: CachedSource }
  | { readonly ok: false; readonly reason: CacheReadFailure };

export type CacheWriteResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Source-keyed cache seam. `key` identifies the backing store so refresh
 * deduplication can share one in-flight promise for the same cache.
 */
export interface OverviewCache {
  readonly key: string;
  read(p_source: SourceId, p_now: Date): Promise<CacheReadResult>;
  write(
    p_source: SourceId,
    p_payload: unknown,
    p_fetchedAt: Date,
    p_ttlMs: number,
  ): Promise<CacheWriteResult>;
}

export interface CacheTtlConfig {
  readonly modelTtlMs: number;
  readonly benchmarkTtlMs: number;
}

let fh_memoryCacheSequence = 0;

/**
 * In-memory cache used by tests and by callers that want a process-local
 * last-known-good snapshot. Each instance has its own deduplication key.
 */
export function f_createMemoryCache(p_key?: string): OverviewCache {
  fh_memoryCacheSequence += 1;
  const vl_key = p_key ?? `memory:${fh_memoryCacheSequence}`;
  const vl_entries = new Map<SourceId, CacheEnvelope>();

  return {
    key: vl_key,
    read(p_source: SourceId, p_now: Date): Promise<CacheReadResult> {
      const vl_entry = vl_entries.get(p_source);

      if (vl_entry === undefined) {
        return Promise.resolve({ ok: false, reason: "missing" });
      }

      return Promise.resolve({
        ok: true,
        value: {
          envelope: vl_entry,
          fresh: fh_isFresh(vl_entry, p_now),
        },
      });
    },
    write(
      p_source: SourceId,
      p_payload: unknown,
      p_fetchedAt: Date,
      p_ttlMs: number,
    ): Promise<CacheWriteResult> {
      if (!fh_isSourceId(p_source)) {
        return Promise.resolve({
          ok: false,
          error: "cache source is invalid",
        });
      }

      if (!fh_isValidTtl(p_ttlMs)) {
        return Promise.resolve({
          ok: false,
          error: "cache TTL is invalid",
        });
      }

      vl_entries.set(p_source, fh_createEnvelope(p_source, p_payload, p_fetchedAt, p_ttlMs));

      return Promise.resolve({ ok: true });
    },
  };
}

/**
 * File-backed cache. One JSON file per source under `p_directory`; each write
 * goes to a temporary file in the same directory and is renamed into place.
 */
export function f_createFileCache(p_directory: string): OverviewCache {
  const vl_directory = resolve(p_directory);

  return {
    key: `file:${vl_directory}`,
    async read(p_source: SourceId, p_now: Date): Promise<CacheReadResult> {
      if (!fh_isSourceId(p_source)) {
        return { ok: false, reason: "invalid" };
      }

      let vl_raw: string;

      try {
        vl_raw = await readFile(fh_cachePath(vl_directory, p_source), "utf8");
      } catch (p_error) {
        if (fh_isMissingFileError(p_error)) {
          return { ok: false, reason: "missing" };
        }

        return { ok: false, reason: "unreadable" };
      }

      let vl_parsed: unknown;

      try {
        vl_parsed = JSON.parse(vl_raw) as unknown;
      } catch {
        return { ok: false, reason: "invalid" };
      }

      const vl_envelope = fh_parseEnvelope(vl_parsed, p_source);

      if (vl_envelope === null) {
        return { ok: false, reason: "invalid" };
      }

      return {
        ok: true,
        value: {
          envelope: vl_envelope,
          fresh: fh_isFresh(vl_envelope, p_now),
        },
      };
    },
    async write(
      p_source: SourceId,
      p_payload: unknown,
      p_fetchedAt: Date,
      p_ttlMs: number,
    ): Promise<CacheWriteResult> {
      if (!fh_isSourceId(p_source)) {
        return { ok: false, error: "cache source is invalid" };
      }

      if (!fh_isValidTtl(p_ttlMs)) {
        return { ok: false, error: "cache TTL is invalid" };
      }

      const vl_target = fh_cachePath(vl_directory, p_source);
      const vl_temporary = `${vl_target}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`;

      try {
        await mkdir(vl_directory, { recursive: true, mode: 0o700 });
        await writeFile(
          vl_temporary,
          `${JSON.stringify(
            fh_createEnvelope(p_source, p_payload, p_fetchedAt, p_ttlMs),
            null,
            2,
          )}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
        await rename(vl_temporary, vl_target);

        return { ok: true };
      } catch {
        // Best-effort cleanup; the temporary name is unique per attempt.
        try {
          await unlink(vl_temporary);
        } catch {
          // Nothing to clean up.
        }

        // Never include the cache path in a status message.
        return { ok: false, error: "cache write failed" };
      }
    },
  };
}

/**
 * Resolve the user cache directory:
 * 1. `OPENCODE_MOSP_CACHE_DIR` when set;
 * 2. `$XDG_CACHE_HOME/opencode-mosp`;
 * 3. `~/.cache/opencode-mosp`.
 */
export function f_getDefaultCacheDirectory(): string {
  const vl_explicit = process.env[k_cacheDirectoryEnv]?.trim();

  if (vl_explicit !== undefined && vl_explicit.length > 0) {
    return resolve(vl_explicit);
  }

  const vl_xdg = process.env.XDG_CACHE_HOME?.trim();
  const vl_base = vl_xdg !== undefined && vl_xdg.length > 0 ? vl_xdg : join(homedir(), ".cache");

  return resolve(vl_base, "opencode-mosp");
}

/**
 * Read TTL overrides at plugin runtime. Invalid or non-positive values fall
 * back to defaults; environment values are seconds, stored values are ms.
 */
export function f_resolveCacheTtls(
  p_env: Readonly<Record<string, string | undefined>> = process.env,
): CacheTtlConfig {
  return {
    modelTtlMs: fh_parseTtlSeconds(
      p_env.OPENCODE_MODEL_CACHE_TTL_SECONDS,
      k_defaultModelCacheTtlMs,
    ),
    benchmarkTtlMs: fh_parseTtlSeconds(
      p_env.OPENCODE_BENCHMARK_CACHE_TTL_SECONDS,
      k_defaultBenchmarkCacheTtlMs,
    ),
  };
}

function fh_createEnvelope(
  p_source: SourceId,
  p_payload: unknown,
  p_fetchedAt: Date,
  p_ttlMs: number,
): CacheEnvelope {
  return {
    schemaVersion: k_cacheSchemaVersion,
    source: p_source,
    fetchedAt: p_fetchedAt.toISOString(),
    ttlMs: p_ttlMs,
    payload: p_payload,
  };
}

function fh_parseEnvelope(p_value: unknown, p_source: SourceId): CacheEnvelope | null {
  if (!f_isRecord(p_value)) {
    return null;
  }

  if (p_value.schemaVersion !== k_cacheSchemaVersion) {
    return null;
  }

  if (p_value.source !== p_source) {
    return null;
  }

  if (typeof p_value.fetchedAt !== "string") {
    return null;
  }

  const vl_fetchedAtMs = Date.parse(p_value.fetchedAt);

  if (!Number.isFinite(vl_fetchedAtMs)) {
    return null;
  }

  if (!fh_isValidTtl(p_value.ttlMs)) {
    return null;
  }

  if (!("payload" in p_value)) {
    return null;
  }

  return {
    schemaVersion: k_cacheSchemaVersion,
    source: p_source,
    fetchedAt: new Date(vl_fetchedAtMs).toISOString(),
    ttlMs: p_value.ttlMs,
    payload: p_value.payload,
  };
}

function fh_isFresh(p_envelope: CacheEnvelope, p_now: Date): boolean {
  const vl_fetchedAtMs = Date.parse(p_envelope.fetchedAt);

  if (!Number.isFinite(vl_fetchedAtMs)) {
    return false;
  }

  return p_now.getTime() <= vl_fetchedAtMs + p_envelope.ttlMs;
}

function fh_isValidTtl(p_value: unknown): p_value is number {
  return typeof p_value === "number" && Number.isFinite(p_value) && p_value >= 0;
}

function fh_isSourceId(p_value: unknown): p_value is SourceId {
  return typeof p_value === "string" && (k_sourceIds as readonly string[]).includes(p_value);
}

function fh_cachePath(p_directory: string, p_source: SourceId): string {
  return join(p_directory, `${p_source}.json`);
}

function fh_isMissingFileError(p_error: unknown): boolean {
  return f_isRecord(p_error) && typeof p_error.code === "string" && p_error.code === "ENOENT";
}

function fh_parseTtlSeconds(p_value: string | undefined, p_defaultMs: number): number {
  if (p_value === undefined || p_value.trim().length === 0) {
    return p_defaultMs;
  }

  const vl_seconds = Number(p_value);

  if (!Number.isFinite(vl_seconds) || vl_seconds <= 0) {
    return p_defaultMs;
  }

  return Math.round(vl_seconds * 1000);
}
