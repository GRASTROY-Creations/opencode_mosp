/**
 * Result envelope shared by source adapters.
 *
 * Adapters are boundary code: malformed rows are skipped with a warning when
 * the rest of the payload is still usable, but a broken envelope fails the
 * whole source. Warning messages must never include credentials or raw payloads.
 */

export interface AdapterWarning {
  readonly code: string;
  readonly message: string;
}

export type AdapterResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly warnings: readonly AdapterWarning[];
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly warnings: readonly AdapterWarning[];
    };

/** Build a successful adapter result with optional row-level warnings. */
export function f_adapterOk<T>(
  p_value: T,
  p_warnings: readonly AdapterWarning[] = [],
): AdapterResult<T> {
  return { ok: true, value: p_value, warnings: p_warnings };
}

/** Build a failed adapter result; warnings describe rows skipped before the failure. */
export function f_adapterFail<T = never>(
  p_error: string,
  p_warnings: readonly AdapterWarning[] = [],
): AdapterResult<T> {
  return { ok: false, error: p_error, warnings: p_warnings };
}
