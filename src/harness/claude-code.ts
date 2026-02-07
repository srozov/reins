/**
 * Claude Code Harness Adapter
 * 
 * Supports flexible CLI arguments - callers can override defaults via claudeArgs
 */

import { spawn, ChildProcess } from "child_process";
import { IHarness, HarnessProcess, SessionStartConfig, Mode } from "../types.js";

export class ClaudeCodeProcess implements HarnessProcess {
  processId: number;
  sessionId: string;
  mode: Mode;
  private process: ChildProcess;
  private buffer: string = "";

  constructor(process: ChildProcess, sessionId: string, mode: Mode) {
    this.process = process;
    this.processId = process.pid || 0;
    this.sessionId = sessionId;
    this.mode = mode;
  }

  async send(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.process.stdin) {
        reject(new Error("Process stdin is not available"));
        return;
      }

      let responseTimeout: NodeJS.Timeout | null = null;

      const listener = (data: Buffer) => {
        this.buffer += data.toString();
      };

      this.process.stdout?.on("data", listener);

      // Send message and close stdin
      this.process.stdin.write(message + "\n");
      this.process.stdin.end();

      // Wait for and parse response
      const parseResponse = (): boolean => {
        // Look for JSON object in buffer
        const jsonMatch = this.buffer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Capture session_id from Claude Code response
            if (parsed.session_id && !this.sessionId.startsWith('session-')) {
              (this as any).sessionId = parsed.session_id;
            }
            
            if (parsed.result !== undefined) {
              if (responseTimeout) clearTimeout(responseTimeout);
              this.process.stdout?.removeListener("data", listener);
              const response = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
              this.buffer = "";
              resolve(response);
              return true;
            }
          } catch {
            // Not valid JSON yet, continue collecting
          }
        }
        return false;
      };

      if (parseResponse()) return;

      const pollInterval = setInterval(() => {
        if (parseResponse()) {
          clearInterval(pollInterval);
        }
      }, 50);

      responseTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        this.process.stdout?.removeListener("data", listener);
        this.process.kill();
        reject(new Error("Claude Code process timeout"));
      }, 60000);
    });
  }

  async approve(corrections?: string): Promise<void> {
    if (!this.process.stdin) {
      throw new Error("Process stdin is not available");
    }
    if (corrections) {
      this.process.stdin.write(corrections + "\n");
      this.process.stdin.end();
    }
  }

  async read(): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    return [];
  }

  async kill(): Promise<void> {
    this.process.kill();
  }
}

export class ClaudeCodeHarness implements IHarness {
  type: "claude-code" = "claude-code";

  async start(config: SessionStartConfig): Promise<HarnessProcess> {
    const mode = config.mode || "plan";
    const args = this.buildArgs(config, mode);

    const childProcess = spawn("claude", args, {
      cwd: config.workdir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!childProcess.pid) {
      throw new Error("Failed to spawn Claude Code process");
    }

    const sessionId = `session-${Date.now()}`;
    return new ClaudeCodeProcess(childProcess, sessionId, mode);
  }

  async resume(sessionId: string, config: Partial<SessionStartConfig>): Promise<HarnessProcess> {
    const mode = (config.mode as Mode) || "auto";
    const workdir = config.workdir || process.cwd();

    // Build args - caller can override with claudeArgs
    const customArgs = config.claudeArgs || [];
    
    // Default resume args
    const defaultArgs = [
      "-p",
      "--output-format", "json",
      "--dangerously-skip-permissions",
      "--resume", sessionId
    ];

    // Merge: custom args override defaults
    // If caller provides claudeArgs, use those instead of defaults
    const args = customArgs.length > 0 ? customArgs : defaultArgs;

    const childProcess = spawn("claude", args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!childProcess.pid) {
      throw new Error("Failed to spawn Claude Code process");
    }

    return new ClaudeCodeProcess(childProcess, sessionId, mode);
  }

  async kill(processId: number): Promise<void> {
    try {
      process.kill(processId);
    } catch {
      // Process might already be dead
    }
  }

  /**
   * Build CLI arguments for starting a new session
   * 
   * Order matters:
   * 1. Base args: --permission-mode, --output-format
   * 2. Model (if specified)
   * 3. Custom args (if provided by caller)
   */
  private buildArgs(config: SessionStartConfig, mode: Mode): string[] {
    const args: string[] = [
      "--permission-mode",
      mode,
      "--output-format",
      "json",
    ];

    if (config.model) {
      args.push("--model", config.model);
    }

    // Allow caller to override with custom args
    // These are appended last and can override previous args
    if (config.claudeArgs && config.claudeArgs.length > 0) {
      args.push(...config.claudeArgs);
    }

    return args;
  }
}
