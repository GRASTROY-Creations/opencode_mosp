/**
 * Display formatting for the model overview UI.
 *
 * Pure string helpers only: a missing value always renders as an em dash and
 * never as a zero, an empty string, or a fabricated number.
 */

/** Format a USD-per-million price; zero is a real price ("free"). */
export function f_formatPrice(p_value: number | null): string {
  if (p_value === null) return "—";
  if (p_value === 0) return "free";
  return `$${p_value.toFixed(2)}/M`;
}

/** Format a context window in tokens (compact K/M form). */
export function f_formatContext(p_value: number | null): string {
  if (p_value === null) return "—";
  if (p_value >= 1_000_000) return `${(p_value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(p_value / 1000)}K`;
}

/** Format a benchmark score (percent, one decimal). */
export function f_formatScore(p_value: number | null): string {
  if (p_value === null) return "—";
  return p_value.toFixed(1);
}

/** Format a 1-based ranking position. */
export function f_formatRank(p_value: number | null): string {
  if (p_value === null) return "—";
  return `#${p_value}`;
}

/** Format an ISO timestamp for compact display; `null` means "never". */
export function f_formatTimestamp(p_value: string | null): string {
  if (p_value === null) return "never";
  return p_value.slice(0, 16).replace("T", " ");
}

/** Truncate with an ellipsis so table columns stay aligned. */
export function f_truncate(p_value: string, p_maxLength: number): string {
  if (p_maxLength <= 0) return "";
  if (p_value.length <= p_maxLength) return p_value;
  if (p_maxLength === 1) return "…";
  return `${p_value.slice(0, p_maxLength - 1)}…`;
}
