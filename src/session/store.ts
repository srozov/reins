/**
 * Session Store - Reads from Claude Code's native session format
 *
 * Claude Code stores sessions in:
 *   ~/.claude/projects/<encoded-path>/<sessionId>.jsonl
 *
 * We scan .jsonl files directly — reliable for all session types including
 * those created via `claude -p` which are not added to sessions-index.json.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { SessionState } from "../types.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("session-store");

/**
 * Parse a Claude Code native JSONL session file into SessionState.
 */
function parseSessionFile(sessionId: string, filePath: string): SessionState | null {
  try {
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .filter(l => l.trim().startsWith("{"));

    let workdir = "/tmp";
    let createdAt = "";
    let lastActive = "";
    const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.cwd) workdir = entry.cwd;
        if (entry.timestamp) {
          if (!createdAt || entry.timestamp < createdAt) createdAt = entry.timestamp;
          if (!lastActive || entry.timestamp > lastActive) lastActive = entry.timestamp;
        }

        // User messages
        if (entry.type === "user" && entry.message?.role === "user") {
          const content = entry.message.content;
          const text = typeof content === "string"
            ? content.trim()
            : Array.isArray(content)
              ? (content.find((c: { type: string }) => c.type === "text") as { text: string } | undefined)?.text?.trim() ?? ""
              : "";
          if (text) transcript.push({ role: "user", content: text });
        }

        // Assistant messages — Claude streams multiple entries per turn (thinking, then text).
        // Replace the last assistant entry with the latest text block to deduplicate.
        if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
          const textBlock = (entry.message.content as Array<{ type: string; text?: string }>)
            .find(c => c.type === "text");
          if (textBlock?.text) {
            const last = transcript[transcript.length - 1];
            if (last?.role === "assistant") {
              last.content = textBlock.text;
            } else {
              transcript.push({ role: "assistant", content: textBlock.text });
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    const now = new Date().toISOString();
    return {
      sessionId,
      workdir,
      mode: "plan",
      status: "active",
      createdAt: createdAt || now,
      lastActive: lastActive || now,
      transcript,
      fileChanges: [],
    };
  } catch {
    return null;
  }
}

export class SessionStore {
  private projectDir: string;
  private projectsDir: string;

  constructor(sessionsDir: string = "~/.claude/sessions") {
    const resolved = sessionsDir.replace("~", process.env.HOME || "~");
    this.projectsDir = join(resolved, "..", "projects");

    // Scope list() to the current working directory's Claude Code project dir.
    // Claude Code encodes the path by replacing '/' and '.' with '-'.
    const encodedCwd = process.cwd().replace(/[/.]/g, "-");
    this.projectDir = join(this.projectsDir, encodedCwd);

    logger.debug(`Session store scoped to: ${this.projectDir}`);
  }

  /**
   * List sessions for the current project by scanning .jsonl files directly.
   */
  list(): SessionState[] {
    const sessions: SessionState[] = [];

    if (!existsSync(this.projectDir)) {
      logger.warn(`Project sessions dir not found: ${this.projectDir}`);
      return sessions;
    }

    for (const file of readdirSync(this.projectDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = basename(file, ".jsonl");
      const state = parseSessionFile(sessionId, join(this.projectDir, file));
      if (state) sessions.push(state);
    }

    sessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
    logger.debug(`Found ${sessions.length} sessions`);
    return sessions;
  }

  /**
   * Get a specific session by ID — searches all project dirs, not just the current one.
   */
  get(sessionId: string): SessionState | null {
    if (!existsSync(this.projectsDir)) return null;

    for (const projectDir of readdirSync(this.projectsDir)) {
      const filePath = join(this.projectsDir, projectDir, `${sessionId}.jsonl`);
      if (existsSync(filePath)) {
        return parseSessionFile(sessionId, filePath);
      }
    }
    return null;
  }

  addMessage(_sessionId: string, _message: { role: "user" | "assistant"; content: string }): void {
    // Cannot modify native Claude Code sessions
  }

  create(_state: Omit<SessionState, "sessionId">): SessionState {
    throw new Error("Use SessionManager.create() instead");
  }

  update(_sessionId: string, _updates: Partial<SessionState>): SessionState | null {
    return null;
  }
}
