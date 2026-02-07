/**
 * Structured error types and codes for Reins
 * 
 * Only includes error codes that are actually thrown.
 * Reserved codes are documented but not exported.
 */

// Error codes that are actually used
export enum ErrorCode {
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_LIMIT_EXCEEDED = "SESSION_LIMIT_EXCEEDED",
  SESSION_CREATE_FAILED = "SESSION_CREATE_FAILED",
  SESSION_RESUME_FAILED = "SESSION_RESUME_FAILED",
  HARNESS_SEND_FAILED = "HARNESS_SEND_FAILED",
}

export interface HarnessError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
  sessionId?: string;
  workdir?: string;
  cause?: Error;
}

export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    sessionId?: string;
    workdir?: string;
    cause?: Error;
  }
): HarnessError {
  const error = new Error(message) as HarnessError;
  error.code = code;
  error.name = "HarnessError";
  if (options?.details) error.details = options.details;
  if (options?.sessionId) error.sessionId = options.sessionId;
  if (options?.cause) error.cause = options.cause;
  return error;
}

export function isHarnessError(error: unknown): error is HarnessError {
  return (
    error instanceof Error &&
    "code" in error &&
    Object.values(ErrorCode).includes((error as HarnessError).code)
  );
}

export function toMcpError(error: HarnessError): object {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      ...(error.sessionId && { sessionId: error.sessionId }),
      ...(error.workdir && { workdir: error.workdir }),
    },
  };
}

// Error messages for the active error codes
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.SESSION_NOT_FOUND]: "Session not found",
  [ErrorCode.SESSION_LIMIT_EXCEEDED]: "Maximum concurrent sessions exceeded",
  [ErrorCode.SESSION_CREATE_FAILED]: "Failed to create session",
  [ErrorCode.SESSION_RESUME_FAILED]: "Failed to resume session",
  [ErrorCode.HARNESS_SEND_FAILED]: "Failed to send message to harness",
};

/**
 * Reserved error codes (not currently used)
 * 
 * Add back when implementing these features:
 * 
 * // CLI errors (3xxx) - handled by Node.js spawn
 * CLI_NOT_FOUND = "CLI_NOT_FOUND",
 * CLI_PERMISSION_DENIED = "CLI_PERMISSION_DENIED", 
 * CLI_MODEL_UNAVAILABLE = "CLI_MODEL_UNAVAILABLE",
 * CLI_INVALID_ARGS = "CLI_INVALID_ARGS",
 * 
 * // Harness errors (2xxx) - specific process errors
 * HARNESS_TIMEOUT = "HARNESS_TIMEOUT",
 * HARNESS_PROCESS_ERROR = "HARNESS_PROCESS_ERROR",
 * HARNESS_START_FAILED = "HARNESS_START_FAILED",
 * 
 * // Session errors (1xxx) - not needed for current architecture
 * SESSION_ALREADY_EXISTS = "SESSION_ALREADY_EXISTS",
 * SESSION_KILL_FAILED = "SESSION_KILL_FAILED",
 * SESSION_INVALID_STATE = "SESSION_INVALID_STATE",
 * 
 * // MCP errors (4xxx) - handled by MCP SDK
 * MCP_TOOL_NOT_FOUND = "MCP_TOOL_NOT_FOUND",
 * MCP_INVALID_REQUEST = "MCP_INVALID_REQUEST",
 * MCP_INTERNAL_ERROR = "MCP_INTERNAL_ERROR",
 * 
 * // Config errors (5xxx) - not implemented
 * CONFIG_INVALID = "CONFIG_INVALID",
 * CONFIG_MISSING_REQUIRED = "CONFIG_MISSING_REQUIRED",
 */
