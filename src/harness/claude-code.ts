/**
 * Claude Code Harness Adapter
 *
 * Claude Code CLI is one-shot: `claude -p` takes a prompt, outputs JSON, exits.
 * Each interaction spawns a fresh process; sessions are resumed via `--resume`.
 */

import { spawn } from "child_process";
import { IHarness, HarnessProcess, SessionStartConfig, Mode } from "../types.js";

/**
 * Run `claude -p` with the given args, write input to stdin, and parse the JSON response.
 */
async function runClaude(
  args: string[],
  input: string,
  cwd?: string
): Promise<{ result: string; sessionId: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!child.pid) {
      reject(new Error("Failed to spawn Claude Code process"));
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.stdin?.write(input + "\n");
    child.stdin?.end();

    child.on("exit", (code) => {
      const parsed = parseClaudeOutput(stdout);
      if (parsed) {
        resolve(parsed);
        return;
      }
      reject(new Error(`Claude Code failed (exit ${code}): ${stderr || stdout}`));
    });
  });
}

function parseClaudeOutput(stdout: string): { result: string; sessionId: string } | null {
  // Claude outputs one JSON object per line; find the last one with result + session_id
  const lines = stdout.trim().split("\n").filter(l => l.trim().startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.result !== undefined && parsed.session_id) {
        const result = typeof parsed.result === "string"
          ? parsed.result
          : JSON.stringify(parsed.result);
        return { result, sessionId: parsed.session_id };
      }
    } catch {
      // Not valid JSON, skip
    }
  }
  return null;
}

export class ClaudeCodeProcess implements HarnessProcess {
  processId: number = 0;
  sessionId: string;
  mode: Mode;
  private workdir: string;

  constructor(sessionId: string, mode: Mode, workdir: string) {
    this.sessionId = sessionId;
    this.mode = mode;
    this.workdir = workdir;
  }

  async send(message: string): Promise<string> {
    const { result } = await runClaude(
      ["-p", "--output-format", "json", "--dangerously-skip-permissions", "--resume", this.sessionId],
      message,
      this.workdir
    );
    return result;
  }

  async approve(corrections?: string): Promise<void> {
    const message = corrections
      ? `${corrections}\nPlease proceed with executing the plan.`
      : "Approved. Please proceed with executing the plan.";
    await this.send(message);
    this.mode = "auto";
  }

  async read(): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    return [];
  }

  async kill(): Promise<void> {
    // No long-running process; one-shot processes exit on their own
  }
}

export class ClaudeCodeHarness implements IHarness {
  type: "claude-code" = "claude-code";

  async start(config: SessionStartConfig): Promise<HarnessProcess> {
    const mode = config.mode || "plan";
    const args = this.buildArgs(config, mode);

    const { sessionId } = await runClaude(args, config.prompt, config.workdir);
    return new ClaudeCodeProcess(sessionId, mode, config.workdir);
  }

  async resume(sessionId: string, config: Partial<SessionStartConfig>): Promise<HarnessProcess> {
    const mode = (config.mode as Mode) || "auto";
    const workdir = config.workdir || process.cwd();
    return new ClaudeCodeProcess(sessionId, mode, workdir);
  }

  async kill(_processId: number): Promise<void> {
    // No-op: one-shot processes exit on their own
  }

  /**
   * Build CLI args for starting a new session.
   * `-p` puts Claude in print (one-shot) mode; permission is set via `--permission-mode`.
   */
  private buildArgs(config: SessionStartConfig, mode: Mode): string[] {
    const args: string[] = [
      "-p",
      "--permission-mode", mode,
      "--output-format", "json",
    ];

    if (config.model) {
      args.push("--model", config.model);
    }

    if (config.claudeArgs && config.claudeArgs.length > 0) {
      args.push(...config.claudeArgs);
    }

    return args;
  }
}
