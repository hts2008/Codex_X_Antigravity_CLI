/**
 * Generate schemas/*.schema.json from the zod schemas in src/types.ts (single source of truth).
 *   npm run gen:schemas          write files
 *   npm run gen:schemas -- --check   fail if files are out of date (used by tests/CI)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ReviewSchema, TaskContractSchema, WorkerResultSchema } from "../src/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "propertyNames") continue; // not supported by some structured-output engines
      out[k] = strip(v);
    }
    return out;
  }
  return node;
}

export function renderSchemas(): Record<string, string> {
  const make = (name: string, title: string, schema: z.ZodType, io: "input" | "output") =>
    JSON.stringify({
      $id: `https://gravitybridge.local/schemas/${name}`,
      title,
      ...(strip(z.toJSONSchema(schema, { io })) as object),
    }, null, 2) + "\n";
  return {
    "task.schema.json": make("task.schema.json", "GravityBridge Task Contract", TaskContractSchema, "input"),
    "result.schema.json": make("result.schema.json", "GravityBridge Antigravity Worker Result", WorkerResultSchema, "output"),
    "review.schema.json": make("review.schema.json", "GravityBridge Codex Review", ReviewSchema, "input"),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, content] of Object.entries(renderSchemas())) {
    const file = path.join(root, "schemas", name);
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current === content) continue;
    if (check) { console.error(`out of date: schemas/${name}`); stale++; }
    else { fs.writeFileSync(file, content); console.log(`wrote schemas/${name}`); }
  }
  process.exit(stale ? 1 : 0);
}
