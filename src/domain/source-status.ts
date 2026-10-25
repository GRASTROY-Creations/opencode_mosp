/**
 * Source health and overview state representations.
 *
 * These are metadata about data quality, not data itself. They let the UI show
 * a stale or partial table instead of hiding usable rows when one source fails.
 * Error strings must be sanitized (no credentials, auth headers, or raw
 * response bodies) before they reach this object.
 */

/** Optional data sources coordinated by the aggregation service. */
export type SourceId =
  | "opencode-models"
  | "opencode-pricing"
  | "llbm"
  | "models-dev";

/** Runtime registry used by refresh/status code. */
export const k_sourceIds: readonly SourceId[] = [
  "opencode-models",
  "opencode-pricing",
  "llbm",
  "models-dev",
];

/**
 * Per-source health:
 * - `fresh`: last refresh succeeded and the TTL has not expired.
 * - `stale`: last good data exists but its TTL expired; a refresh failed or has
 *   not run yet.
 * - `unavailable`: the source is unsupported/not configured for this run.
 * - `error`: the last attempt failed and no usable data exists.
 */
export type SourceState = "fresh" | "stale" | "unavailable" | "error";

/** Stable per-source status displayed next to the table. */
export interface SourceStatus {
  readonly source: SourceId;
  readonly state: SourceState;
  /** Last successful retrieval (ISO-8601 UTC); `null` if never succeeded. */
  readonly lastSuccessAt: string | null;
  /** Last attempt, successful or not (ISO-8601 UTC); `null` if never tried. */
  readonly lastAttemptAt: string | null;
  /** Sanitized failure summary; `null` when there is no active error. */
  readonly error: string | null;
}

/**
 * Overview-level state shown by the panel:
 * - `idle`: no snapshot loaded yet.
 * - `loading`: first load in progress, nothing to render yet.
 * - `ready`: complete snapshot, all sources fresh.
 * - `partial`: usable snapshot, at least one source failed/unavailable.
 * - `stale`: usable snapshot whose data is past its TTL.
 * - `error`: no usable snapshot.
 */
export type OverviewState =
  | "idle"
  | "loading"
  | "ready"
  | "partial"
  | "stale"
  | "error";

/** Aggregate status returned with every snapshot. */
export interface ModelOverviewStatus {
  readonly state: OverviewState;
  /** When the snapshot was assembled (ISO-8601 UTC); `null` for `idle`. */
  readonly lastRefreshAt: string | null;
  readonly sources: readonly SourceStatus[];
}