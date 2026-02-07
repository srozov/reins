/**
 * Session Store - Reads from Claude Code's native session format
 * 
 * Claude Code stores sessions in:
 * - Index: ~/.claude/projects/<path>/sessions-index.json
 * - Session files: ~/.claude/projects/<path>/<sessionId>.jsonl
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { SessionState } from "../types.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("session-store");

export class SessionStore {
  private sessionsDir: string;

  constructor(sessionsDir: string = "~/.claude/sessions") {
    this.sessionsDir = sessionsDir.replace("~", process.env.HOME || "~");
  }

  /**
   * List all native Claude Code sessions
   */
  list(): SessionState[] {
    const sessions: SessionState[] = [];

    // Try to find sessions index
    const projectsDir = join(this.sessionsDir, "..", "projects");
    
    if (existsSync(projectsDir)) {
      const projectDirs = readdirSync(projectsDir);
      
      for (const projectDir of projectDirs) {
        const indexFile = join(projectsDir, projectDir, "sessions-index.json");
        
        if (existsSync(indexFile)) {
          try {
            const index = JSON.parse(readFileSync(indexFile, "utf-8"));
            
            if (index.entries && Array.isArray(index.entries)) {
              for (const entry of index.entries) {
                const sessionFile = entry.fullPath;
                
                if (existsSync(sessionFile)) {
                  try {
                    const lines = readFileSync(sessionFile, "utf-8").split("\n").filter(l => l.trim());
                    
                    // Get first user message from session
                    let firstUserMessage = "";
                    let assistantResponse = "";
                    
                    for (const line of lines) {
                      try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === "user" && parsed.message?.content) {
                          if (!firstUserMessage) {
                            firstUserMessage = parsed.message.content;
                          }
                        }
                        if (parsed.type === "assistant" && parsed.message?.content) {
                          // Get the actual text content
                          const content = parsed.message.content;
                          if (Array.isArray(content)) {
                            assistantResponse = content.find((c: any) => c.type === "text")?.text || "";
                          } else if (typeof content === "string") {
                            assistantResponse = content;
                          }
                        }
                      } catch {
                        // Skip invalid JSON lines
                      }
                    }

                    sessions.push({
                      sessionId: entry.sessionId,
                      workdir: entry.projectPath || "/tmp",
                      mode: "plan",
                      status: "active",
                      createdAt: entry.created,
                      lastActive: entry.modified,
                      transcript: firstUserMessage ? [
                        { role: "user" as const, content: firstUserMessage },
                        ...(assistantResponse ? [{ role: "assistant" as const, content: assistantResponse }] : [])
                      ] : [],
                      fileChanges: [],
                    });
                  } catch (err) {
                    logger.warn(`Failed to read session file: ${sessionFile}`);
                  }
                }
              }
            }
          } catch (err) {
            logger.warn(`Failed to parse sessions index: ${indexFile}`);
          }
        }
      }
    }

    // Also check for sessions in ~/.claude/sessions directly
    if (existsSync(this.sessionsDir)) {
      const files = readdirSync(this.sessionsDir);
      
      for (const file of files) {
        // Skip .sessions.jsonl (old format)
        if (file.startsWith(".") || file.endsWith(".jsonl")) continue;
        
        if (file.endsWith(".json")) {
          const sessionFile = join(this.sessionsDir, file);
          try {
            const content = readFileSync(sessionFile, "utf-8");
            const parsed = JSON.parse(content);
            const sessionId = parsed.id || basename(sessionFile, ".json");
            
            // Check if we already have this session
            if (!sessions.find(s => s.sessionId === sessionId)) {
              sessions.push({
                sessionId,
                workdir: parsed.workdir || "/tmp",
                mode: parsed.mode || "plan",
                status: "active",
                createdAt: parsed.createdAt || new Date().toISOString(),
                lastActive: parsed.lastActive || new Date().toISOString(),
                transcript: parsed.transcript || [],
                fileChanges: [],
              });
            }
          } catch (err) {
            logger.warn(`Failed to read session: ${sessionFile}`);
          }
        }
      }
    }

    // Sort by lastActive descending
    sessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
    
    logger.debug(`Found ${sessions.length} sessions`);
    return sessions;
  }

  /**
   * Get a specific session
   */
  get(sessionId: string): SessionState | null {
    const sessions = this.list();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  /**
   * Add a message to a session (noop for native sessions)
   */
  addMessage(_sessionId: string, _message: { role: "user" | "assistant"; content: string }): void {
    // Cannot modify native Claude Code sessions
  }

  /**
   * Create a new session (noop - harness manages this separately)
   */
  create(_state: Omit<SessionState, "sessionId">): SessionState {
    throw new Error("Use SessionManager.create() instead");
  }

  /**
   * Update a session (noop for native sessions)
   */
  update(_sessionId: string, _updates: Partial<SessionState>): SessionState | null {
    return null;
  }
}
