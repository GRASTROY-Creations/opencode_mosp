/**
 * Shared JSON fetch helper for source adapters.
 *
 * - One attempt per `f_fetchJson` call, with an AbortController timeout.
 * - Retries, exponential backoff, and `Retry-After` live in
 *   `f_fetchJsonWithRetry`, so adapters share one policy.
 * - Errors identify only the host (never the full URL, query string, headers,
 *   credentials, or response body).
 * - Response JSON stays `unknown`; callers must validate it at the boundary.
 */

/** Machine-readable failure category for callers that isolate sources. */
export type FetchJsonErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "aborted"
  | "parse"
  | "invalid-url"
  | "invalid-options";

/** Minimal fetch seam so tests never touch the network. */
export type FetchLike = (
  p_input: string,
  p_init?: RequestInit,
) => Promise<Response>;

/** Injectable sleep seam for retry tests. */
export type SleepLike = (p_ms: number) => Promise<void>;

export interface FetchJsonOptions {
  /** Total request budget in milliseconds, including body parsing. */
  readonly timeoutMs: number;
  /** Extra request headers; never included in errors or logs. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Caller cancellation, composed with the timeout signal. */
  readonly signal?: AbortSignal;
  /** Test seam; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
}

export interface FetchJsonRetryOptions extends FetchJsonOptions {
  /** Total attempts, including the first one. Defaults to 3. */
  readonly maxAttempts?: number;
  /** First backoff delay in milliseconds. Defaults to 250. */
  readonly baseDelayMs?: number;
  /** Test seam; defaults to a real timer. */
  readonly sleep?: SleepLike;
}

/** Typed error safe to surface in status messages. */
export class FetchJsonError extends Error {
  readonly kind: FetchJsonErrorKind;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    p_kind: FetchJsonErrorKind,
    p_message: string,
    p_status: number | null = null,
    p_retryAfterMs: number | null = null,
  ) {
    super(p_message);
    this.name = "FetchJsonError";
    this.kind = p_kind;
    this.status = p_status;
    this.retryAfterMs = p_retryAfterMs;
  }
}

/** Retry-After delays are honored, but capped so a bad header cannot hang a refresh. */
const k_maxRetryAfterMs = 60_000;
const k_maxBackoffMs = 10_000;

/**
 * Perform one JSON GET request with a timeout. The generic parameter is only a
 * convenience: the returned value is still untrusted and must be validated.
 */
export async function f_fetchJson<T>(
  p_url: string,
  p_options: FetchJsonOptions,
): Promise<T> {
  const vl_target = fh_parseRequestUrl(p_url);
  const vl_timeoutMs = fh_parseTimeout(p_options.timeoutMs);
  const vl_controller = new AbortController();
  const vl_externalSignal = p_options.signal;
  let vl_timedOut = false;
  let vl_listening = false;

  const vl_onExternalAbort = (): void => {
    vl_controller.abort(vl_externalSignal?.reason);
  };

  if (vl_externalSignal !== undefined) {
    if (vl_externalSignal.aborted) {
      vl_onExternalAbort();
    } else {
      vl_externalSignal.addEventListener("abort", vl_onExternalAbort, {
        once: true,
      });
      vl_listening = true;
    }
  }

  const vl_timer = setTimeout(() => {
    vl_timedOut = true;
    vl_controller.abort();
  }, vl_timeoutMs);

  try {
    let vl_response: Response;

    try {
      vl_response = await (p_options.fetchImpl ?? fetch)(vl_target.href, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(p_options.headers ?? {}),
        },
        signal: vl_controller.signal,
      });
    } catch (p_error) {
      if (vl_timedOut) {
        throw new FetchJsonError(
          "timeout",
          `Request to ${vl_target.host} timed out after ${vl_timeoutMs} ms`,
        );
      }

      if (vl_externalSignal?.aborted === true) {
        throw new FetchJsonError(
          "aborted",
          `Request to ${vl_target.host} was aborted`,
        );
      }

      if (p_error instanceof FetchJsonError) {
        throw p_error;
      }

      throw new FetchJsonError(
        "network",
        `Network error while fetching ${vl_target.host}`,
      );
    }

    if (!vl_response.ok) {
      const vl_retryAfterMs = fh_parseRetryAfter(
        vl_response.headers.get("retry-after"),
      );

      throw new FetchJsonError(
        "http",
        `HTTP ${vl_response.status} while fetching ${vl_target.host}`,
        vl_response.status,
        vl_retryAfterMs,
      );
    }

    try {
      return (await vl_response.json()) as T;
    } catch {
      if (vl_timedOut) {
        throw new FetchJsonError(
          "timeout",
          `Request to ${vl_target.host} timed out after ${vl_timeoutMs} ms`,
        );
      }

      throw new FetchJsonError(
        "parse",
        `Invalid JSON from ${vl_target.host}`,
        vl_response.status,
      );
    }
  } finally {
    clearTimeout(vl_timer);

    if (vl_listening) {
      vl_externalSignal?.removeEventListener("abort", vl_onExternalAbort);
    }
  }
}

/**
 * Retry only transient failures. Authentication/authorization, malformed URLs,
 * and invalid JSON are not retried; caller cancellation stays cancelled.
 */
export async function f_fetchJsonWithRetry<T>(
  p_url: string,
  p_options: FetchJsonRetryOptions,
): Promise<T> {
  const vl_maxAttempts = fh_parseMaxAttempts(p_options.maxAttempts ?? 3);
  const vl_baseDelayMs = fh_parseBaseDelay(p_options.baseDelayMs ?? 250);
  const vl_sleep = p_options.sleep ?? fh_sleep;

  let vl_attempt = 1;

  while (true) {
    try {
      return await f_fetchJson<T>(p_url, p_options);
    } catch (p_error) {
      if (!(p_error instanceof FetchJsonError)) {
        throw p_error;
      }

      if (vl_attempt >= vl_maxAttempts || !fh_isRetryable(p_error)) {
        throw p_error;
      }

      const vl_backoffMs = Math.min(
        vl_baseDelayMs * 2 ** (vl_attempt - 1),
        k_maxBackoffMs,
      );
      const vl_delayMs = Math.min(
        p_error.retryAfterMs ?? vl_backoffMs,
        k_maxRetryAfterMs,
      );

      await vl_sleep(vl_delayMs);
      vl_attempt += 1;
    }
  }
}

interface RequestTarget {
  readonly href: string;
  readonly host: string;
}

function fh_parseRequestUrl(p_url: string): RequestTarget {
  try {
    const vl_url = new URL(p_url);

    if (vl_url.protocol !== "http:" && vl_url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    return { href: vl_url.toString(), host: vl_url.host };
  } catch {
    // Deliberately omit the raw URL: it may contain a token in its query string.
    throw new FetchJsonError("invalid-url", "Invalid request URL");
  }
}

function fh_parseTimeout(p_timeoutMs: number): number {
  if (!Number.isFinite(p_timeoutMs) || p_timeoutMs <= 0) {
    throw new FetchJsonError(
      "invalid-options",
      "timeoutMs must be a positive number",
    );
  }

  return p_timeoutMs;
}

function fh_parseMaxAttempts(p_maxAttempts: number): number {
  if (!Number.isInteger(p_maxAttempts) || p_maxAttempts < 1) {
    throw new FetchJsonError(
      "invalid-options",
      "maxAttempts must be a positive integer",
    );
  }

  return p_maxAttempts;
}

function fh_parseBaseDelay(p_baseDelayMs: number): number {
  if (!Number.isFinite(p_baseDelayMs) || p_baseDelayMs < 0) {
    throw new FetchJsonError(
      "invalid-options",
      "baseDelayMs must be a non-negative number",
    );
  }

  return p_baseDelayMs;
}

function fh_isRetryable(p_error: FetchJsonError): boolean {
  if (p_error.kind === "network" || p_error.kind === "timeout") {
    return true;
  }

  if (p_error.kind !== "http" || p_error.status === null) {
    return false;
  }

  return (
    p_error.status === 408 ||
    p_error.status === 425 ||
    p_error.status === 429 ||
    p_error.status >= 500
  );
}

function fh_parseRetryAfter(p_value: string | null): number | null {
  if (p_value === null) {
    return null;
  }

  const vl_trimmed = p_value.trim();

  if (/^\d+$/.test(vl_trimmed)) {
    return Number.parseInt(vl_trimmed, 10) * 1000;
  }

  const vl_epochMs = Date.parse(vl_trimmed);

  if (!Number.isFinite(vl_epochMs)) {
    return null;
  }

  return Math.max(0, vl_epochMs - Date.now());
}

function fh_sleep(p_ms: number): Promise<void> {
  return new Promise((p_resolve) => {
    setTimeout(p_resolve, p_ms);
  });
}
