import type { ChangedFile } from "./types.js";

/** Paths the worker may never touch, regardless of the task contract. */
export const ALWAYS_FORBIDDEN = [
  ".git/**",
  ".agents/**",
  ".codex/**",
  "AGENTS.md",
  "docs/GRAVITYBRIDGE/**",
];

export function normalizeRel(p: string): string {
  let s = p.replace(/\\/g, "/").trim();
  while (s.startsWith("./")) s = s.slice(2);
  return s.replace(/^\/+/, "");
}

/**
 * Convert a glob to a RegExp.
 *  - `**` matches across directories, `*` within one segment, `?` one char.
 *  - A trailing `/` or a pattern without wildcards also matches everything below it.
 */
export function globToRegExp(pattern: string, caseInsensitive = process.platform === "win32"): RegExp {
  let p = normalizeRel(pattern);
  const hasWildcard = /[*?]/.test(p);
  if (p.endsWith("/")) p += "**";
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        const slashAfter = p[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  if (!hasWildcard && !p.endsWith("**")) re += "(?:/.*)?";
  return new RegExp(`^${re}$`, caseInsensitive ? "i" : "");
}

export function matchesAny(file: string, patterns: readonly string[]): boolean {
  const rel = normalizeRel(file);
  return patterns.some((pattern) => globToRegExp(pattern).test(rel));
}

export interface ScopeInput {
  allowed_paths: readonly string[];
  forbidden_paths: readonly string[];
  mutating: boolean;
}

/** Return a human-readable reason if writing `file` is not allowed, else null. */
export function scopeViolation(file: string, scope: ScopeInput): string | null {
  const rel = normalizeRel(file);
  if (!scope.mutating) return `${rel}: task is read-only (mutating=false)`;
  if (matchesAny(rel, ALWAYS_FORBIDDEN)) return `${rel}: protected path (GravityBridge/agent configuration)`;
  if (matchesAny(rel, scope.forbidden_paths)) return `${rel}: matches forbidden_paths`;
  if (!matchesAny(rel, scope.allowed_paths)) return `${rel}: outside allowed_paths`;
  return null;
}

export function checkScope(files: readonly ChangedFile[], scope: ScopeInput): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const p of [f.path, f.old_path].filter(Boolean) as string[]) {
      const v = scopeViolation(p, scope);
      if (v) out.push(`[${f.status}] ${v}`);
    }
  }
  return [...new Set(out)];
}
