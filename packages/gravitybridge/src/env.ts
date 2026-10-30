/**
 * Build the environment passed to Antigravity and to bridge-run commands.
 * Secrets of the Codex process (OpenAI keys, GitHub tokens, cloud credentials...) are removed,
 * because the worker can run shell commands.
 */
const SECRET_PATTERN = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL|SESSION_?KEY)/i;
const KEEP_PREFIXES = ["GEMINI_", "GOOGLE_", "ANTIGRAVITY_", "AGY_", "GRAVITYBRIDGE_", "FAKE_AGY_"];
const DROP_PREFIXES = ["OPENAI_", "CODEX_", "AWS_", "AZURE_", "GH_", "GITHUB_", "NPM_TOKEN"];

export function workerEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = new Set((process.env.GRAVITYBRIDGE_ENV_KEEP ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    const upper = k.toUpperCase();
    if (keep.has(k) || KEEP_PREFIXES.some((p) => upper.startsWith(p))) {
      env[k] = v;
      continue;
    }
    if (DROP_PREFIXES.some((p) => upper.startsWith(p))) continue;
    if (SECRET_PATTERN.test(upper)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}
