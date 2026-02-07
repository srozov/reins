/**
 * Core types for Harness Bridge
 */

export type Mode = "plan" | "auto" | "full";
export type HarnessType = "claude-code" | "codex" | "opencode";
export type SessionStatus = "active" | "paused" | "completed" | "killed";
export type TransportType = "stdio" | "http" | "websocket";
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Tool permission configuration
 */
export interface ToolPermission {
  mode: "allowlist" | "denylist";
  tools: string[];
}

/**
 * Transport configuration
 */
export interface TransportConfig {
  type: TransportType;
  port?: number; // For HTTP/WebSocket
  host?: string; // For HTTP/WebSocket
}

/**
 * Configuration for creating a Harness Bridge instance
 */
export interface BridgeConfig {
  sessionsDir?: string;
  defaultMode?: Mode;
  timeoutSeconds?: number;
  harness?: HarnessType;
  logLevel?: LogLevel;
  transport?: TransportConfig;
  toolPermission?: ToolPermission;
  maxConcurrentSessions?: number;
  readNativeFormat?: boolean; // Read from Claude Code's native session format
}

/**
 * Configuration for starting a session
 */
export interface SessionStartConfig {
  workdir: string;
  mode?: Mode;
  prompt: string;
  model?: string;
  timeoutSeconds?: number;
  /** Additional CLI arguments to pass to the harness command */
  claudeArgs?: string[];
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  workdir: string;
  mode: Mode;
  status: SessionStatus;
  createdAt: string;
  lastActive: string;
  processId?: number;
}

/**
 * Session state (stored in JSONL)
 */
export interface SessionState {
  sessionId: string;
  workdir: string;
  mode: Mode;
  status: SessionStatus;
  createdAt: string;
  lastActive: string;
  transcript: Message[];
  fileChanges: string[];
  metadata?: Record<string, unknown>;
}

/**
 * A single message in the session transcript
 */
export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/**
 * Harness interface - implemented by adapters
 */
export interface IHarness {
  type: HarnessType;
  start(config: SessionStartConfig): Promise<HarnessProcess>;
  resume(sessionId: string, config: Partial<SessionStartConfig>): Promise<HarnessProcess>;
  kill(processId: number): Promise<void>;
}

/**
 * Harness process instance
 */
export interface HarnessProcess {
  processId: number;
  sessionId: string;
  mode: Mode;
  send(message: string): Promise<string>;
  approve(corrections?: string): Promise<void>;
  read(): Promise<Message[]>;
  kill(): Promise<void>;
}

/**
 * MCP Tool input/output types
 */
export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  [key: string]: unknown;
}

/**
 * Error response from tools
 */
export interface ErrorOutput extends ToolOutput {
  error: string;
  code?: string;
}

/**
 * Session manager interface
 */
export interface ISessionManager {
  create(config: SessionStartConfig): Promise<SessionMetadata>;
  resume(sessionId: string, message?: string): Promise<SessionMetadata>;
  send(sessionId: string, message: string): Promise<{ response: string; sessionId: string }>;
  approve(sessionId: string, corrections?: string): Promise<SessionMetadata>;
  kill(sessionId: string): Promise<SessionMetadata>;
  read(sessionId: string): Promise<SessionState>;
  list(): Promise<SessionMetadata[]>;
  getSession(sessionId: string): Promise<SessionState | null>;
}

/**
 * Logger interface for consistent logging across modules
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
