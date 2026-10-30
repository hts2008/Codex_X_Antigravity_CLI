import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderSchemas } from "../scripts/gen-schemas.ts";

test("schemas/*.json are generated from src/types.ts (run npm run gen:schemas)", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  for (const [name, content] of Object.entries(renderSchemas())) {
    assert.equal(fs.readFileSync(path.join(root, "schemas", name), "utf8").replace(/\r\n/g, "\n"), content, name);
  }
});

test("examples/task.frontend-ui.json is a valid Task Contract", async () => {
  const { TaskContractSchema } = await import("../src/types.ts");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const parsed = TaskContractSchema.safeParse(JSON.parse(fs.readFileSync(path.join(root, "examples", "task.frontend-ui.json"), "utf8")));
  assert.ok(parsed.success, parsed.error?.message);
});
