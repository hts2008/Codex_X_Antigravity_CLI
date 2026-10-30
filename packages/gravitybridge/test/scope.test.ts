import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScope, globToRegExp, scopeViolation } from "../src/scope.ts";

test("glob matching", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
  assert.ok(globToRegExp("src/**").test("src/a.ts"));
  assert.ok(!globToRegExp("src/**").test("srcx/a.ts"));
  assert.ok(globToRegExp("src/*.ts").test("src/a.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/x/a.ts"));
  assert.ok(globToRegExp("**/*.md").test("README.md"));
  assert.ok(globToRegExp("**/*.md").test("docs/a/b.md"));
  assert.ok(globToRegExp("src/app").test("src/app/page.tsx"));
  assert.ok(globToRegExp("src/").test("src/x"));
});

test("scope rules", () => {
  const scope = { allowed_paths: ["src/**", "AGENTS.md"], forbidden_paths: ["src/secret/**"], mutating: true };
  assert.equal(scopeViolation("src/a.ts", scope), null);
  assert.match(scopeViolation("src/secret/k.ts", scope)!, /forbidden/);
  assert.match(scopeViolation("server/a.ts", scope)!, /outside/);
  assert.match(scopeViolation("AGENTS.md", scope)!, /protected/);
  assert.match(scopeViolation(".agents/hooks.json", scope)!, /protected/);
  assert.match(scopeViolation("src/a.ts", { ...scope, mutating: false })!, /read-only/);
  const v = checkScope([{ status: "R", old_path: "server/old.ts", path: "src/new.ts" }], scope);
  assert.equal(v.length, 1);
  assert.match(v[0], /server\/old\.ts/);
});

test("canonicalPath handles not-yet-existing files", async () => {
  const { canonicalPath } = await import("../src/paths.ts");
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const real = fs.realpathSync.native(os.tmpdir());
  assert.equal(canonicalPath(path.join(os.tmpdir(), "gb-nope", "x.txt")), path.join(real, "gb-nope", "x.txt"));
});
