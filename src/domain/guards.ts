/**
 * Primitive validation helpers for data crossing an external boundary.
 *
 * Every parser returns a typed `DomainResult` instead of throwing or returning
 * `any`. Callers decide whether an invalid record is dropped, flagged, or
 * replaced by a last-known-good value.
 *
 * Missing data is represented by `null` - never by `0`, `""`, or a fabricated
 * default. A parser only returns `null` when the source explicitly omitted the
 * value (or sent an empty optional string); malformed values are errors.
 */

/** Successful or failed validation. The failure branch carries a safe message. */
export type DomainResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** A JSON object after `typeof` checking; values still need their own validation. */
export type JsonRecord = Readonly<Record<string, unknown>>;

/** Build a successful result. */
export function f_ok<T>(p_value: T): DomainResult<T> {
  return { ok: true, value: p_value };
}

/** Build a failed result. The message must not contain secrets or raw payloads. */
export function f_fail<T = never>(p_error: string): DomainResult<T> {
  return { ok: false, error: p_error };
}

/** True for non-null, non-array objects (the shape JSON decoders actually produce). */
export function f_isRecord(p_value: unknown): p_value is Record<string, unknown> {
  return typeof p_value === "object" && p_value !== null && !Array.isArray(p_value);
}

/** True for finite numbers only; rejects NaN and both infinities. */
export function f_isFiniteNumber(p_value: unknown): p_value is number {
  return typeof p_value === "number" && Number.isFinite(p_value);
}

/** True for finite numbers greater than or equal to zero. */
export function f_isNonNegativeFiniteNumber(p_value: unknown): p_value is number {
  return f_isFiniteNumber(p_value) && p_value >= 0;
}

/** True for integers greater than or equal to zero. */
export function f_isNonNegativeInteger(p_value: unknown): p_value is number {
  return typeof p_value === "number" && Number.isInteger(p_value) && p_value >= 0;
}

/** True for integers greater than or equal to one (e.g. context windows). */
export function f_isPositiveInteger(p_value: unknown): p_value is number {
  return typeof p_value === "number" && Number.isInteger(p_value) && p_value >= 1;
}

/** True for strings with at least one non-whitespace character. */
export function f_isNonEmptyString(p_value: unknown): p_value is string {
  return typeof p_value === "string" && p_value.trim().length > 0;
}

/** Parse a required, trimmed, non-empty string. */
export function f_parseNonEmptyString(
  p_value: unknown,
  p_field: string,
): DomainResult<string> {
  if (!f_isNonEmptyString(p_value)) {
    return f_fail(`${p_field} must be a non-empty string`);
  }

  return f_ok(p_value.trim());
}

/**
 * Parse an optional string. `null`, `undefined`, and blank strings become
 * `null`; non-string values are errors.
 */
export function f_parseNullableString(
  p_value: unknown,
  p_field: string,
): DomainResult<string | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (typeof p_value !== "string") {
    return f_fail(`${p_field} must be a string or null`);
  }

  const vl_trimmed = p_value.trim();

  return f_ok(vl_trimmed.length === 0 ? null : vl_trimmed);
}

/**
 * Parse an optional HTTP(S) URL. The original (trimmed) value is preserved;
 * it is only validated, never rewritten.
 */
export function f_parseNullableHttpUrl(
  p_value: unknown,
  p_field: string,
): DomainResult<string | null> {
  const vl_string = f_parseNullableString(p_value, p_field);

  if (!vl_string.ok || vl_string.value === null) {
    return vl_string;
  }

  try {
    const vl_url = new URL(vl_string.value);

    if (vl_url.protocol !== "http:" && vl_url.protocol !== "https:") {
      return f_fail(`${p_field} must use http or https`);
    }
  } catch {
    return f_fail(`${p_field} must be a valid URL`);
  }

  return vl_string;
}

/**
 * Parse an optional non-negative number. Zero is a real, published value and is
 * kept; only `null`/`undefined` mean the source did not provide one.
 */
export function f_parseNullableNonNegativeNumber(
  p_value: unknown,
  p_field: string,
): DomainResult<number | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isNonNegativeFiniteNumber(p_value)) {
    return f_fail(`${p_field} must be a finite, non-negative number or null`);
  }

  return f_ok(p_value);
}

/** Parse an optional positive integer (e.g. a context window in tokens). */
export function f_parseNullablePositiveInteger(
  p_value: unknown,
  p_field: string,
): DomainResult<number | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isPositiveInteger(p_value)) {
    return f_fail(`${p_field} must be a positive integer or null`);
  }

  return f_ok(p_value);
}

/** Parse an optional non-negative integer (for sample counts). */
export function f_parseNullableNonNegativeInteger(
  p_value: unknown,
  p_field: string,
): DomainResult<number | null> {
  if (p_value === null || p_value === undefined) {
    return f_ok(null);
  }

  if (!f_isNonNegativeInteger(p_value)) {
    return f_fail(`${p_field} must be a non-negative integer or null`);
  }

  return f_ok(p_value);
}

/**
 * Parse a required timestamp. Accepts an ISO-8601 string or epoch
 * milliseconds (the formats used by the OpenCode registry and LLMBM export)
 * and canonicalizes both to an ISO-8601 UTC string, so lexicographic and
 * chronological ordering agree.
 */
export function f_parseTimestamp(
  p_value: unknown,
  p_field: string,
): DomainResult<string> {
  const vl_epochMs = fh_toEpochMilliseconds(p_value);

  if (vl_epochMs === null) {
    return f_fail(
      `${p_field} must be an ISO-8601 timestamp or epoch milliseconds`,
    );
  }

  return f_ok(new Date(vl_epochMs).toISOString());
}

/** Parse an optional timestamp with the same rules as `f_parseTimestamp`. */
export function f_parseNullableTimestamp(
  p_value: unknown,
  p_field: string,
): DomainResult<string | null> {
  if (p_value === null || p_value === undefined || p_value === "") {
    return f_ok(null);
  }

  return f_parseTimestamp(p_value, p_field);
}

/** Parse a value that must belong to a fixed string union. */
export function f_parseEnum<T extends string>(
  p_value: unknown,
  p_allowed: readonly T[],
  p_field: string,
): DomainResult<T> {
  const vl_match = p_allowed.find((p_entry) => p_entry === p_value);

  if (vl_match === undefined) {
    return f_fail(`${p_field} must be one of: ${p_allowed.join(", ")}`);
  }

  return f_ok(vl_match);
}

/** Internal conversion shared by the timestamp parsers. */
function fh_toEpochMilliseconds(p_value: unknown): number | null {
  if (f_isFiniteNumber(p_value)) {
    return Number.isFinite(new Date(p_value).getTime()) ? p_value : null;
  }

  if (typeof p_value === "string" && p_value.trim().length > 0) {
    const vl_epochMs = Date.parse(p_value);

    return Number.isNaN(vl_epochMs) ? null : vl_epochMs;
  }

  return null;
}
