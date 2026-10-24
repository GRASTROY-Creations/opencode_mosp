import { describe, expect, test } from "bun:test";

import {
  f_fetchJson,
  f_fetchJsonWithRetry,
  FetchJsonError,
  type FetchLike,
} from "../../src/utils/fetch-json";

async function fh_captureError(p_promise: Promise<unknown>): Promise<FetchJsonError> {
  try {
    await p_promise;
  } catch (p_error) {
    if (p_error instanceof FetchJsonError) {
      return p_error;
    }

    throw p_error;
  }

  throw new Error("expected the promise to reject");
}

function fh_jsonResponse(p_body: unknown, p_status = 200): Response {
  return new Response(JSON.stringify(p_body), {
    status: p_status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetch-json", () => {
  test("returns parsed JSON from the injected fetch", async () => {
    const vl_fetch: FetchLike = () => Promise.resolve(fh_jsonResponse({ value: 42 }));

    const vl_result = await f_fetchJson<{ value: number }>(
      "https://example.test/data",
      { timeoutMs: 1_000, fetchImpl: vl_fetch },
    );

    expect(vl_result.value).toBe(42);
  });

  test("does not leak query strings or credentials in HTTP errors", async () => {
    const vl_fetch: FetchLike = () => Promise.resolve(new Response("denied", { status: 403 }));

    const vl_error = await fh_captureError(
      f_fetchJson("https://example.test/data?token=super-secret", {
        timeoutMs: 1_000,
        fetchImpl: vl_fetch,
      }),
    );

    expect(vl_error.kind).toBe("http");
    expect(vl_error.status).toBe(403);
    expect(vl_error.message).toContain("example.test");
    expect(vl_error.message).not.toContain("super-secret");
    expect(vl_error.message).not.toContain("token=");
  });

  test("retries transient HTTP failures and honors Retry-After", async () => {
    let vl_attempts = 0;
    const vl_sleeps: number[] = [];

    const vl_fetch: FetchLike = () => {
      vl_attempts += 1;

      if (vl_attempts === 1) {
        return Promise.resolve(
          new Response("busy", {
            status: 503,
            headers: { "retry-after": "0" },
          }),
        );
      }

      return Promise.resolve(fh_jsonResponse({ ok: true }));
    };

    const vl_result = await f_fetchJsonWithRetry<{ ok: boolean }>(
      "https://example.test/data",
      {
        timeoutMs: 1_000,
        maxAttempts: 2,
        fetchImpl: vl_fetch,
        sleep: (p_ms) => {
          vl_sleeps.push(p_ms);
          return Promise.resolve();
        },
      },
    );

    expect(vl_result.ok).toBe(true);
    expect(vl_attempts).toBe(2);
    expect(vl_sleeps).toEqual([0]);
  });

  test("does not retry authentication failures", async () => {
    let vl_attempts = 0;
    const vl_fetch: FetchLike = () => {
      vl_attempts += 1;
      return Promise.resolve(new Response("unauthorized", { status: 401 }));
    };

    const vl_error = await fh_captureError(
      f_fetchJsonWithRetry("https://example.test/data", {
        timeoutMs: 1_000,
        maxAttempts: 3,
        fetchImpl: vl_fetch,
        sleep: () => Promise.resolve(),
      }),
    );

    expect(vl_error.status).toBe(401);
    expect(vl_attempts).toBe(1);
  });

  test("retries network errors and then succeeds", async () => {
    let vl_attempts = 0;
    const vl_fetch: FetchLike = () => {
      vl_attempts += 1;

      if (vl_attempts === 1) {
        throw new TypeError("socket closed");
      }

      return Promise.resolve(fh_jsonResponse({ ok: true }));
    };

    const vl_result = await f_fetchJsonWithRetry<{ ok: boolean }>(
      "https://example.test/data",
      {
        timeoutMs: 1_000,
        maxAttempts: 2,
        fetchImpl: vl_fetch,
        sleep: () => Promise.resolve(),
      },
    );

    expect(vl_result.ok).toBe(true);
    expect(vl_attempts).toBe(2);
  });

  test("aborts timed-out requests with a timeout error", async () => {
    const vl_fetch: FetchLike = (_p_input, p_init) =>
      new Promise((_p_resolve, p_reject) => {
        p_init?.signal?.addEventListener(
          "abort",
          () => {
            p_reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });

    const vl_error = await fh_captureError(
      f_fetchJson("https://example.test/slow", {
        timeoutMs: 5,
        fetchImpl: vl_fetch,
      }),
    );

    expect(vl_error.kind).toBe("timeout");
  });

  test("rejects invalid JSON without retrying it", async () => {
    let vl_attempts = 0;
    const vl_fetch: FetchLike = () => {
      vl_attempts += 1;
      return Promise.resolve(new Response("not json", { status: 200 }));
    };

    const vl_error = await fh_captureError(
      f_fetchJsonWithRetry("https://example.test/data", {
        timeoutMs: 1_000,
        maxAttempts: 3,
        fetchImpl: vl_fetch,
        sleep: () => Promise.resolve(),
      }),
    );

    expect(vl_error.kind).toBe("parse");
    expect(vl_attempts).toBe(1);
  });

  test("rejects invalid options without making a request", async () => {
    const vl_error = await fh_captureError(
      f_fetchJson("https://example.test/data?token=super-secret", {
        timeoutMs: 0,
        fetchImpl: () => Promise.resolve(fh_jsonResponse({})),
      }),
    );

    expect(vl_error.kind).toBe("invalid-options");
  });
});
