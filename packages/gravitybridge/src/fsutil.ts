import fs from "node:fs/promises";
import path from "node:path";

/** Write JSON atomically (temp file + rename) so a crash never leaves a half-written file. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

export async function writeTextAtomic(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, value, "utf8");
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Keep only the last `max` characters of a string. */
export function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `[...truncated ${text.length - max} chars...]\n` + text.slice(-max);
}

/** Keep only the first `max` characters of a string. */
export function head(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n[...truncated ${text.length - max} chars...]`;
}
