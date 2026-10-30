import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gb-test-"));
process.env.GRAVITYBRIDGE_HOME = path.join(tmpRoot, "home");
process.env.GRAVITYBRIDGE_AGY = path.join(here, "fake-agy.mjs");
process.env.GRAVITYBRIDGE_MAX_PARALLEL = "10";

let n = 0;
export function makeRepo(): string {
  const dir = path.join(tmpRoot, `repo-${++n}`);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "server"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.txt"), "a\n");
  fs.writeFileSync(path.join(dir, "server", "x.txt"), "x\n");
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", dir, ...a], { stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return fs.realpathSync(dir);
}

export function task(id: string, over: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    task_id: id,
    type: "test",
    goal: "Do the fake thing for tests",
    scope: { allowed_paths: ["src/**"] },
    acceptance_criteria: ["works"],
    validation_commands: [`node -e "process.exit(require('fs').existsSync('src/new.txt')?0:1)"`],
    ...over,
  };
}

export function setScenario(s: string): void {
  process.env.FAKE_AGY_SCENARIO = s;
}
