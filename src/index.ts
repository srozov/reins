/**
 * Reins - Package Entrypoint
 * Universal MCP adapter for CLI-based coding agents
 * 
 * "You hold the reins" - Control Claude Code via MCP
 */

export { SessionManager } from "./session/manager.js";
export { SessionStore } from "./session/store.js";
export { ClaudeCodeHarness, ClaudeCodeProcess } from "./harness/claude-code.js";
export { createServer, ReinsServer } from "./server.js";
export { createTransport } from "./transport/factory.js";
export { createHTTPTransport, HTTPServerTransport } from "./transport/http.js";
export { createWebSocketTransport, WebSocketServerTransport } from "./transport/websocket.js";
export { createConfigFromArgs, parseArgs, mergeConfigs, validateConfig } from "./config.js";
export { Logger, getLogger, initLogger } from "./utils/logger.js";

export type {
  ISessionManager,
  IHarness,
  HarnessProcess,
  SessionMetadata,
  SessionState,
  SessionStartConfig,
  BridgeConfig,
  Mode,
  HarnessType,
  SessionStatus,
  TransportType,
  LogLevel,
  TransportConfig,
  ToolPermission,
  ILogger,
} from "./types.js";

/**
 * Create a Reins instance
 */
export async function createReins(config: any = {}) {
  const {
    sessionsDir = "~/.claude/sessions",
    harness = "claude-code",
    maxConcurrentSessions = 10,
  } = config;

  if (harness !== "claude-code") {
    throw new Error(`Harness type not yet supported: ${harness}`);
  }

  const { ClaudeCodeHarness } = await import("./harness/claude-code.js");
  const { SessionManager } = await import("./session/manager.js");

  const harnessAdapter = new ClaudeCodeHarness();
  const manager = new SessionManager(harnessAdapter, sessionsDir, {
    maxConcurrentSessions,
  });

  return {
    start: (cfg: any) => manager.create(cfg),
    resume: (sessionId: string, msg?: string) => manager.resume(sessionId, msg),
    send: (sessionId: string, msg: string) => manager.send(sessionId, msg),
    approve: (sessionId: string, corrections?: string) => manager.approve(sessionId, corrections),
    kill: (sessionId: string) => manager.kill(sessionId),
    read: (sessionId: string) => manager.read(sessionId),
    list: () => manager.list(),
  };
}

/**
 * Alias for createHarnessBridge (backward compatibility)
 * @deprecated Use createReins instead
 */
export async function createHarnessBridge(config: any = {}) {
  console.warn("createHarnessBridge is deprecated. Use createReins instead.");
  return createReins(config);
}
