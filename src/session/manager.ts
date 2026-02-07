/**
 * Session Manager - Simple wrapper around Claude Code native sessions
 * 
 * Key insight: We don't manage sessions ourselves. Claude Code does.
 * - Sessions are stored in ~/.claude/projects/<path>/<sessionId>.jsonl
 * - We use --resume to reconnect to existing sessions
 * - We list sessions by reading Claude Code's session index
 */

import {
  ISessionManager,
  SessionStartConfig,
  SessionMetadata,
  SessionState,
  IHarness,
  HarnessProcess,
} from "../types.js";
import { SessionStore } from "./store.js";
import { getLogger } from "../utils/logger.js";
import {
  ErrorCode,
  createError,
  isHarnessError,
} from "../errors.js";

const logger = getLogger("session-manager");

export class SessionManager implements ISessionManager {
  private store: SessionStore;
  private harness: IHarness;
  private runningProcesses: Map<string, HarnessProcess> = new Map();
  private maxConcurrentSessions: number;

  constructor(
    harness: IHarness,
    sessionsDir?: string,
    options?: { maxConcurrentSessions?: number }
  ) {
    this.harness = harness;
    this.maxConcurrentSessions = options?.maxConcurrentSessions || 10;
    this.store = new SessionStore(sessionsDir);

    logger.info("SessionManager initialized", {
      sessionsDir,
      maxConcurrentSessions: this.maxConcurrentSessions,
    });
  }

  /**
   * Create a new session - start Claude Code and send the prompt
   */
  async create(config: SessionStartConfig): Promise<SessionMetadata> {
    if (this.runningProcesses.size >= this.maxConcurrentSessions) {
      throw createError(
        ErrorCode.SESSION_LIMIT_EXCEEDED,
        `Maximum concurrent sessions (${this.maxConcurrentSessions}) reached`,
        { details: { limit: this.maxConcurrentSessions } }
      );
    }

    const mode = config.mode || "plan";

    logger.info("Starting new session", {
      workdir: config.workdir,
      mode,
      claudeArgs: config.claudeArgs,
    });

    try {
      const process = await this.harness.start(config);
      const sessionId = process.sessionId;

      this.runningProcesses.set(sessionId, process);

      logger.info("Session started", { sessionId, processId: process.processId });

      return {
        sessionId,
        workdir: config.workdir,
        mode,
        status: "active",
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        processId: process.processId,
      };
    } catch (error: unknown) {
      const cause = error instanceof Error ? error : new Error(String(error));

      if (isHarnessError(error)) {
        throw error;
      }

      logger.error(`Failed to create session: ${cause.message}`);

      throw createError(
        ErrorCode.SESSION_CREATE_FAILED,
        `Failed to create session: ${cause.message}`,
        { cause, details: { workdir: config.workdir } }
      );
    }
  }

  /**
   * Resume an existing session using Claude Code's native --resume
   */
  async resume(sessionId: string, message?: string): Promise<SessionMetadata> {
    const state = this.store.get(sessionId);
    if (!state) {
      throw createError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session not found: ${sessionId}`,
        { sessionId }
      );
    }

    logger.info("Resuming session", { sessionId });

    try {
      // Start Claude Code with --resume (harness handles custom args)
      const process = await this.harness.resume(sessionId, {
        workdir: state.workdir,
      });
      this.runningProcesses.set(sessionId, process);

      if (message) {
        await this.send(sessionId, message);
      }

      return {
        sessionId,
        workdir: state.workdir,
        mode: state.mode,
        status: "active",
        createdAt: state.createdAt,
        lastActive: new Date().toISOString(),
        processId: process.processId,
      };
    } catch (error: unknown) {
      if (isHarnessError(error)) {
        throw error;
      }

      const cause = error instanceof Error ? error : new Error(String(error));

      throw createError(
        ErrorCode.SESSION_RESUME_FAILED,
        `Failed to resume session: ${cause.message}`,
        { sessionId, cause }
      );
    }
  }

  /**
   * Send a message to a running session
   */
  async send(
    sessionId: string,
    message: string
  ): Promise<{ response: string; sessionId: string }> {
    let process = this.runningProcesses.get(sessionId);

    if (!process) {
      const state = this.store.get(sessionId);
      if (!state) {
        throw createError(
          ErrorCode.SESSION_NOT_FOUND,
          `Session not found: ${sessionId}`,
          { sessionId }
        );
      }
      process = await this.harness.resume(sessionId, { workdir: state.workdir });
      this.runningProcesses.set(sessionId, process);
    }

    logger.info("Sending message", { sessionId, messageLength: message.length });

    try {
      const response = await process.send(message);
      return { response, sessionId };
    } catch (error: unknown) {
      const cause = error instanceof Error ? error : new Error(String(error));

      throw createError(
        ErrorCode.HARNESS_SEND_FAILED,
        `Failed to send message: ${cause.message}`,
        { sessionId, cause }
      );
    }
  }

  /**
   * Approve a session (switch from plan to execute mode)
   */
  async approve(
    sessionId: string,
    corrections?: string
  ): Promise<SessionMetadata> {
    const state = this.store.get(sessionId);
    if (!state) {
      throw createError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session not found: ${sessionId}`,
        { sessionId }
      );
    }

    const process = this.runningProcesses.get(sessionId);
    if (process) {
      try {
        await process.approve(corrections);
      } catch (error: unknown) {
        const cause = error instanceof Error ? error : new Error(String(error));

        throw createError(
          ErrorCode.HARNESS_SEND_FAILED,
          `Failed to approve session: ${cause.message}`,
          { sessionId, cause }
        );
      }
    }

    return {
      sessionId,
      workdir: state.workdir,
      mode: "auto",
      status: "active",
      createdAt: state.createdAt,
      lastActive: new Date().toISOString(),
    };
  }

  /**
   * Kill a running session
   */
  async kill(sessionId: string): Promise<SessionMetadata> {
    const process = this.runningProcesses.get(sessionId);
    if (process) {
      try {
        await process.kill();
      } catch {
        // Process might already be dead, that's fine
      }
      this.runningProcesses.delete(sessionId);
    }

    const state = this.store.get(sessionId);

    return {
      sessionId,
      workdir: state?.workdir || "/tmp",
      mode: state?.mode || "plan",
      status: "killed",
      createdAt: state?.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
  }

  /**
   * Read session transcript from Claude Code's native storage
   */
  async read(sessionId: string): Promise<SessionState> {
    const state = this.store.get(sessionId);
    if (!state) {
      throw createError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session not found: ${sessionId}`,
        { sessionId }
      );
    }
    return state;
  }

  /**
   * List all sessions from Claude Code's native storage
   */
  async list(): Promise<SessionMetadata[]> {
    const sessions = this.store.list();
    return sessions.map(state => ({
      sessionId: state.sessionId,
      workdir: state.workdir,
      mode: state.mode,
      status: state.status,
      createdAt: state.createdAt,
      lastActive: state.lastActive,
    }));
  }

  /**
   * Get session state
   */
  async getSession(sessionId: string): Promise<SessionState | null> {
    return this.store.get(sessionId);
  }
}
