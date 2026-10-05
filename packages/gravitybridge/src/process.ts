import { spawn } from "node:child_process";

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function executable(name: string): string {
  if (process.platform === "win32" && !name.toLowerCase().endsWith(".exe") && !name.toLowerCase().endsWith(".cmd")) {
    return `${name}.cmd`;
  }
  return name;
}

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Process timed out: ${command} ${args.join(" ")}`));
      }, options.timeoutMs);
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
