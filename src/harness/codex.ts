/**
 * Codex Harness Adapter
 *
 * Supports the Codex CLI for AI-assisted coding
 * 
 * CLI Reference: https://developers.openai.com/codex/cli/reference/
 * Non-interactive mode: https://developers.openai.com/codex/noninteractive/
 */

import { spawn, ChildProcess } from "child_process";
import { IHarness, HarnessProcess, SessionStartConfig, Mode } from "../types.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("codex");

/**
 * JSONL event types from Codex CLI --json output
 */
interface CodexEvent {
  type: "thread.started" | "turn.started" | "turn.completed" | "turn.failed" | 
        "item.started" | "item.completed" | "error";
  thread_id?: string;
  item?: {
    id: string;
    type: string;
    text?: string;
    content?: string;
    [key: string]: unknown;
  };
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
  [key: string]: unknown;
}

export class CodexProcess implements HarnessProcess {
  processId: number;
  sessionId: string;
  mode: Mode;
  private process: ChildProcess;
  private buffer: string = "";
  private messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  private killed: boolean = false;
  private stdinClosed: boolean = false;

  constructor(process: ChildProcess, sessionId: string, mode: Mode) {
    this.process = process;
    this.processId = process.pid || 0;
    this.sessionId = sessionId;
    this.mode = mode;

    // Handle process errors - critical for preventing unhandled rejections
    this.process.stdin?.on("error", (err: Error) => {
      if ((err as any).code !== "EPIPE" && !this.stdinClosed) {
        logger.error("Codex stdin error", { error: err.message });
      }
    });

    this.process.stdout?.on("error", (err: Error) => {
      logger.error("Codex stdout error", { error: err.message });
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const stderr = data.toString().trim();
      if (stderr) {
        logger.debug("Codex stderr:", { stderr });
      }
    });

    this.process.on("error", (err: Error) => {
      logger.error("Codex process error", { error: err.message });
    });

    this.process.on("exit", (code, signal) => {
      logger.debug(`Codex process exited with code ${code}, signal ${signal}`);
    });

    // Capture JSONL output from Codex CLI
    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.captureMessages();
    });
  }

  /**
   * Capture messages from JSONL buffer for read() method
   * Codex CLI outputs JSONL events when run with --json flag
   */
  private captureMessages(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as CodexEvent;
        
        // Extract content from item.completed events
        if (event.type === "item.completed" && event.item) {
          const content = event.item.text || event.item.content;
          if (content && typeof content === "string") {
            // Determine role based on item type
            const role = event.item.type === "agent_message" ? "assistant" : "user";
            this.messages.push({ role, content });
          }
        }
        
        // Capture session ID from thread.started
        if (event.type === "thread.started" && event.thread_id) {
          if (this.sessionId.startsWith("session")) {
            this.sessionId = event.thread_id;
            logger.debug(`Captured Codex session ID: ${this.sessionId}`);
          }
        }
      } catch {
        // Line might not be valid JSON - could be plain text output
        logger.debug("Non-JSON line from Codex:", { line: trimmed });
      }
    }
  }

  async send(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.process.stdin || this.killed || this.stdinClosed) {
        reject(new Error("Process stdin is not available or process killed"));
        return;
      }

      let responseTimeout: NodeJS.Timeout | null = null;
      let responseBuffer = "";
      let collectedMessages: string[] = [];

      const listener = (data: Buffer) => {
        responseBuffer += data.toString();
      };

      this.process.stdout?.on("data", listener);

      // Send message - Codex CLI processes prompts via stdin in interactive mode
      // For non-interactive (codex exec), prompts are passed as arguments
      const writeSuccess = this.process.stdin.write(message + "\n", (err) => {
        if (err) {
          logger.error("Error writing to Codex stdin", { error: err.message });
          if (responseTimeout) clearTimeout(responseTimeout);
          this.process.stdout?.removeListener("data", listener);
          reject(err);
        }
      });

      if (!writeSuccess) {
        logger.warn("Stdin write buffer full, draining...");
        this.process.stdin.once("drain", () => {
          logger.debug("Stdin drained");
          // Close stdin after drain for non-interactive mode
          this.process.stdin.end();
          this.stdinClosed = true;
        });
      } else {
        // Close stdin after successful write
        this.process.stdin.end();
        this.stdinClosed = true;
      }

      // Wait for and parse JSONL response
      const parseResponse = (): boolean => {
        const lines = responseBuffer.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed) as CodexEvent;

            // Capture session ID from thread.started
            if (event.type === "thread.started" && event.thread_id) {
              if (this.sessionId.startsWith("session")) {
                this.sessionId = event.thread_id;
              }
            }

            // Collect messages from item.completed events (for read() method)
            if (event.type === "item.completed" && event.item) {
              const content = event.item.text || event.item.content;
              if (content && typeof content === "string") {
                const role = event.item.type === "agent_message" ? "assistant" : "user";
                this.messages.push({ role, content });
                collectedMessages.push(content);
              }
            }

            // Check for turn completion (end of response)
            if (event.type === "turn.completed") {
              if (responseTimeout) clearTimeout(responseTimeout);
              this.process.stdout?.removeListener("data", listener);
              
              const response = collectedMessages.join("\n") || "No response from Codex";
              responseBuffer = "";
              resolve(response);
              return true;
            }

            // Check for turn failure
            if (event.type === "turn.failed" || event.type === "error") {
              if (responseTimeout) clearTimeout(responseTimeout);
              this.process.stdout?.removeListener("data", listener);
              const errorMsg = JSON.stringify(event);
              responseBuffer = "";
              reject(new Error(`Codex turn failed: ${errorMsg}`));
              return true;
            }
          } catch {
            // Not valid JSON, continue collecting
          }
        }
        return false;
      };

      if (parseResponse()) return;

      const pollInterval = setInterval(() => {
        if (parseResponse()) {
          clearInterval(pollInterval);
        }
      }, 100);

      responseTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        this.process.stdout?.removeListener("data", listener);
        
        // On timeout, return what we have so far
        const response = collectedMessages.join("\n") || "Codex process timeout - no response received";
        logger.warn("Codex response timeout");
        resolve(response);
      }, 120000); // 2 minute timeout for Codex operations
    });
  }

  async approve(corrections?: string): Promise<void> {
    if (!this.process.stdin || this.killed || this.stdinClosed) {
      throw new Error("Process stdin is not available or process killed");
    }
    
    if (corrections) {
      this.process.stdin.write(corrections + "\n", (err) => {
        if (err) {
          logger.error("Error writing corrections to Codex stdin", { error: err.message });
        }
      });
    }
    
    // Close stdin to signal completion
    // Note: Codex exec typically doesn't need manual approval in non-interactive mode
    this.process.stdin.end();
    this.stdinClosed = true;
  }

  async read(): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    // Return accumulated messages from JSONL events
    return [...this.messages];
  }

  async kill(): Promise<void> {
    this.killed = true;
    this.process.kill();
  }
}

export class CodexHarness implements IHarness {
  type: "codex" = "codex";

  async start(config: SessionStartConfig): Promise<HarnessProcess> {
    const mode = config.mode || "plan";
    const args = this.buildArgs(config, mode);

    // Build environment with passthrough from config
    const env = { 
      ...process.env,
      ...(config.env || {}),
    };

    // Set CODEX_API_KEY if provided in config
    if (config.apiKey) {
      env.CODEX_API_KEY = config.apiKey;
    }

    logger.debug("Starting Codex with args:", { args });

    const childProcess = spawn("codex", args, {
      cwd: config.workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    if (!childProcess.pid) {
      childProcess.stdin?.destroy();
      childProcess.stdout?.destroy();
      childProcess.stderr?.destroy();
      throw new Error("Failed to spawn Codex process");
    }

    // Handle spawn errors
    childProcess.on("spawn", () => {
      logger.debug(`Codex process spawned with PID ${childProcess.pid}`);
    });

    // Temporary session ID until we capture thread_id from JSONL output
    const sessionId = `session-${Date.now()}`;
    return new CodexProcess(childProcess, sessionId, mode);
  }

  async resume(sessionId: string, config: Partial<SessionStartConfig>): Promise<HarnessProcess> {
    const mode = (config.mode as Mode) || "auto";
    const workdir = config.workdir || process.cwd();

    // Build args - caller can override with claudeArgs
    const customArgs = config.claudeArgs || [];

    // Default resume args - Codex CLI uses "exec resume" subcommand
    const defaultArgs = [
      "exec",
      "resume",
      sessionId,
      "--json",  // Enable JSONL output
    ];

    // Merge: custom args override defaults
    const args = customArgs.length > 0 ? customArgs : defaultArgs;

    // Build environment with passthrough from config
    const env = { 
      ...process.env,
      ...(config.env || {}),
    };

    if (config.apiKey) {
      env.CODEX_API_KEY = config.apiKey;
    }

    logger.debug("Resuming Codex session with args:", { args });

    const childProcess = spawn("codex", args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    if (!childProcess.pid) {
      childProcess.stdin?.destroy();
      childProcess.stdout?.destroy();
      childProcess.stderr?.destroy();
      throw new Error("Failed to spawn Codex process");
    }

    // Handle spawn errors
    childProcess.on("spawn", () => {
      logger.debug(`Codex process spawned with PID ${childProcess.pid}`);
    });

    return new CodexProcess(childProcess, sessionId, mode);
  }

  async kill(processId: number): Promise<void> {
    try {
      process.kill(processId);
      logger.debug(`Killed Codex process ${processId}`);
    } catch (err) {
      logger.debug(`Failed to kill process ${processId}:`, { error: (err as Error).message });
      // Process might already be dead
    }
  }

  /**
   * Build CLI arguments for starting a new session
   * Based on: https://developers.openai.com/codex/cli/reference/#codex-exec
   */
  private buildArgs(config: SessionStartConfig, mode: Mode): string[] {
    const args: string[] = [
      "exec",  // Use non-interactive exec mode
      "--json",  // Enable JSONL event stream output
    ];

    // Map mode to Codex CLI sandbox/approval flags
    // Codex doesn't have --plan/--auto/--full flags
    // Instead, it uses --sandbox and --ask-for-approval
    if (mode === "plan") {
      // Plan mode = read-only sandbox
      args.push("--sandbox", "read-only");
    } else if (mode === "auto") {
      // Auto mode = workspace-write sandbox
      args.push("--sandbox", "workspace-write");
    } else if (mode === "full") {
      // Full mode = --full-auto preset
      args.push("--full-auto");
    }

    // Add model if specified
    if (config.model) {
      args.push("--model", config.model);
    }

    // Add working directory if different
    if (config.workdir && config.workdir !== process.cwd()) {
      args.push("--cd", config.workdir);
    }

    // Allow caller to override with custom args
    if (config.claudeArgs && config.claudeArgs.length > 0) {
      args.push(...config.claudeArgs);
    }

    // Add initial prompt if provided
    // Note: Codex exec expects prompt as final positional argument
    if (config.initialPrompt) {
      args.push(config.initialPrompt);
    }

    return args;
  }
}
