/**
 * Token accounting for Antigravity turns.
 *
 * agy stream-json reports usage per step (`step_update.usage`, "when known") and a session-cumulative
 * `result.usage`. GravityBridge sums DONE step usage to get the cost of *this* turn and keeps a
 * per-task total. "tokens" in budgets = total_tokens (input + output, cache reads excluded).
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}

export function zeroUsage(): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Normalise an agy usage object. Returns undefined when it carries no numbers at all. */
export function normalizeUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const u: TokenUsage = {
    input_tokens: num(r.input_tokens),
    output_tokens: num(r.output_tokens),
    thinking_tokens: num(r.thinking_tokens),
    cache_read_tokens: num(r.cache_read_tokens ?? r.cached_tokens ?? r.cache_tokens),
    total_tokens: num(r.total_tokens),
  };
  if (!u.total_tokens) u.total_tokens = u.input_tokens + u.output_tokens;
  const any = u.input_tokens + u.output_tokens + u.thinking_tokens + u.cache_read_tokens + u.total_tokens;
  return any > 0 ? u : undefined;
}

export function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage {
  const x = a ?? zeroUsage();
  const y = b ?? zeroUsage();
  return {
    input_tokens: x.input_tokens + y.input_tokens,
    output_tokens: x.output_tokens + y.output_tokens,
    thinking_tokens: x.thinking_tokens + y.thinking_tokens,
    cache_read_tokens: x.cache_read_tokens + y.cache_read_tokens,
    total_tokens: x.total_tokens + y.total_tokens,
  };
}

/** Non-negative difference (cumulative envelope minus previous cumulative envelope). */
export function subUsage(a: TokenUsage, b: TokenUsage | undefined): TokenUsage | undefined {
  if (!b) return a;
  const d = (k: keyof TokenUsage) => a[k] - b[k];
  if ((Object.keys(a) as (keyof TokenUsage)[]).some((k) => d(k) < 0)) return undefined;
  return {
    input_tokens: d("input_tokens"), output_tokens: d("output_tokens"), thinking_tokens: d("thinking_tokens"),
    cache_read_tokens: d("cache_read_tokens"), total_tokens: d("total_tokens"),
  };
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

/** One-line, human-readable usage string (kept short for Codex context). */
export function usageLine(u: TokenUsage | undefined): string | undefined {
  if (!u) return undefined;
  const parts = [`total ${fmtTokens(u.total_tokens)}`, `in ${fmtTokens(u.input_tokens)}`, `out ${fmtTokens(u.output_tokens)}`];
  if (u.thinking_tokens) parts.push(`think ${fmtTokens(u.thinking_tokens)}`);
  if (u.cache_read_tokens) parts.push(`cache ${fmtTokens(u.cache_read_tokens)}`);
  return parts.join(" · ");
}

export function budgetLine(used: number, max: number): string {
  if (!max) return `${fmtTokens(used)} (no limit)`;
  return `${fmtTokens(used)} / ${fmtTokens(max)} (${Math.round((used / max) * 100)}%)`;
}
