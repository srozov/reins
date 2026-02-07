/**
 * Unit tests for Reins errors module
 */

import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createError,
  isHarnessError,
  toMcpError,
  ERROR_MESSAGES,
  HarnessError,
} from "../src/errors.js";

describe("Errors Module", () => {
  describe("createError", () => {
    it("should create a harness error with code and message", () => {
      const error = createError(ErrorCode.SESSION_NOT_FOUND, "Session not found");

      expect(error.code).toBe(ErrorCode.SESSION_NOT_FOUND);
      expect(error.message).toBe("Session not found");
      expect(error.name).toBe("HarnessError");
    });

    it("should include details when provided", () => {
      const error = createError(ErrorCode.SESSION_LIMIT_EXCEEDED, "Too many sessions", {
        details: { limit: 5, current: 6 },
      });

      expect(error.details).toEqual({ limit: 5, current: 6 });
    });

    it("should include sessionId when provided", () => {
      const error = createError(ErrorCode.SESSION_NOT_FOUND, "Not found", {
        sessionId: "test-session-123",
      });

      expect(error.sessionId).toBe("test-session-123");
    });

    it("should include cause when provided", () => {
      const cause = new Error("Original error");
      const error = createError(ErrorCode.SESSION_CREATE_FAILED, "Failed", {
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });

  describe("isHarnessError", () => {
    it("should return true for harness errors", () => {
      const error = createError(ErrorCode.SESSION_NOT_FOUND, "Not found");
      expect(isHarnessError(error)).toBe(true);
    });

    it("should return false for regular errors", () => {
      const error = new Error("Regular error");
      expect(isHarnessError(error)).toBe(false);
    });

    it("should return false for non-error values", () => {
      expect(isHarnessError(null)).toBe(false);
      expect(isHarnessError("string")).toBe(false);
      expect(isHarnessError(123)).toBe(false);
      expect(isHarnessError({})).toBe(false);
    });
  });

  describe("toMcpError", () => {
    it("should convert harness error to MCP format", () => {
      const error = createError(ErrorCode.SESSION_NOT_FOUND, "Not found", {
        sessionId: "test-session-123",
        details: { hint: "Check session list" },
      });

      const mcpError = toMcpError(error);

      expect(mcpError).toEqual({
        error: {
          code: ErrorCode.SESSION_NOT_FOUND,
          message: "Not found",
          sessionId: "test-session-123",
          details: { hint: "Check session list" },
        },
      });
    });

    it("should handle errors without optional fields", () => {
      const error = createError(ErrorCode.SESSION_NOT_FOUND, "Session not found");
      const mcpError = toMcpError(error);

      expect(mcpError).toEqual({
        error: {
          code: ErrorCode.SESSION_NOT_FOUND,
          message: "Session not found",
        },
      });
    });
  });

  describe("ERROR_MESSAGES", () => {
    it("should have a message for every error code", () => {
      const allCodes = Object.values(ErrorCode);

      for (const code of allCodes) {
        expect(ERROR_MESSAGES[code]).toBeDefined();
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      }
    });

    it("should have descriptive messages", () => {
      expect(ERROR_MESSAGES[ErrorCode.SESSION_NOT_FOUND]).toContain("not found");
      expect(ERROR_MESSAGES[ErrorCode.HARNESS_SEND_FAILED]).toContain("send");
      expect(ERROR_MESSAGES[ErrorCode.SESSION_CREATE_FAILED]).toContain("create");
    });
  });
});

describe("Error Codes Enum", () => {
  describe("Active error codes", () => {
    it("should have SESSION_NOT_FOUND", () => {
      expect(ErrorCode.SESSION_NOT_FOUND).toBe("SESSION_NOT_FOUND");
    });

    it("should have SESSION_LIMIT_EXCEEDED", () => {
      expect(ErrorCode.SESSION_LIMIT_EXCEEDED).toBe("SESSION_LIMIT_EXCEEDED");
    });

    it("should have SESSION_CREATE_FAILED", () => {
      expect(ErrorCode.SESSION_CREATE_FAILED).toBe("SESSION_CREATE_FAILED");
    });

    it("should have SESSION_RESUME_FAILED", () => {
      expect(ErrorCode.SESSION_RESUME_FAILED).toBe("SESSION_RESUME_FAILED");
    });

    it("should have HARNESS_SEND_FAILED", () => {
      expect(ErrorCode.HARNESS_SEND_FAILED).toBe("HARNESS_SEND_FAILED");
    });
  });
});

describe("Error Integration", () => {
  it("should chain errors with causes", () => {
    const originalError = new Error("Original");
    const harnessError = createError(
      ErrorCode.SESSION_CREATE_FAILED,
      "Failed to create",
      { cause: originalError }
    );

    expect(harnessError.cause).toBe(originalError);
    expect(harnessError.message).toBe("Failed to create");
  });

  it("should preserve error code through chains", () => {
    const error1 = createError(ErrorCode.SESSION_NOT_FOUND, "Not found");
    const error2 = createError(ErrorCode.SESSION_RESUME_FAILED, "Resume failed", {
      cause: error1,
    });

    expect(error2.code).toBe(ErrorCode.SESSION_RESUME_FAILED);
    expect(error2.cause).toBe(error1);
    expect((error2.cause as HarnessError)?.code).toBe(ErrorCode.SESSION_NOT_FOUND);
  });
});
