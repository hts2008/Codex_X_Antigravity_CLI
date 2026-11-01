/**
 * Non-blocking quality checks on a Task Contract. Each warning points at something that is known
 * to make the worker explore more (and burn tokens) or to cause avoidable rework.
 */
import type { TaskContract } from "./types.js";

const WHOLE_REPO = new Set(["*", "**", "**/*", "./**", "./*", "."]);

/** Words that look like several words glued together ("freshreadadmission", "855boundmetadata"). */
export function gluedWords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (!w || /[\/\\._:-]/.test(w) || /^https?/i.test(raw)) continue; // paths, identifiers with separators, URLs
    if (/^[a-z]{18,}$/.test(w)) out.push(w); // long all-lowercase run
    else if (/^\d{2,}[a-z]{5,}$/i.test(w)) out.push(w); // number glued to words
    else if (/^[A-Z]{3,}[a-z]{6,}$/.test(w)) out.push(w); // SAMEcanonical
  }
  return [...new Set(out)];
}

export function lintContract(t: TaskContract): string[] {
  const w: string[] = [];
  const glued = gluedWords(`${t.goal} ${t.acceptance_criteria.join(" ")}`);
  if (glued.length >= 2) {
    w.push(`goal/criteria look compressed (words run together: ${glued.slice(0, 4).map((g) => `'${g}'`).join(", ")}). Write plain sentences; the worker misreads compressed text, explores more and needs rework.`);
  }
  if (!t.context.length) {
    w.push("context is empty: list the exact files (and the symbol/section) the worker should read first, otherwise it explores the repo on its own (the main token cost).");
  }
  if (t.scope.allowed_paths.some((p) => WHOLE_REPO.has(p.trim()))) {
    w.push("scope.allowed_paths covers the whole repo; narrow it to the folders the change belongs to.");
  }
  if (t.goal.length > 4_000) {
    w.push(`goal is ${t.goal.length} characters; keep the goal to the decision and the change, move background to notes or context files.`);
  }
  if (t.mutating && !t.validation_commands.length) {
    w.push("no validation_commands: nothing will be verified independently and the worker has no quick signal that it is done.");
  }
  if (t.worker.effort === "high" && t.acceptance_criteria.length <= 2 && t.goal.length < 400) {
    w.push("effort=high on a small task: medium is usually enough and uses fewer thinking tokens.");
  }
  return w;
}
