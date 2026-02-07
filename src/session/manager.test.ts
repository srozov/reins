/**
 * Unit tests for SessionManager
 */

import { describe, it, expect, Mock, vi, beforeEach } from "vitest";
import { SessionManager } from "./manager.js";
import { SessionStartConfig, Mode, HarnessProcess, HarnessType } from "../types.js";
import { ErrorCode, isHarnessError } from "../errors.js";

// Mock logger - simple implementation
vi.mock("../utils/logger.js", () => ({
  getLogger: () => ({
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  }),
}));

describe("SessionManager", () => {
  let manager: SessionManager;
  let mockHarness: {
    type: HarnessType;
    start: Mock;
    resume: Mock;
    kill: Mock;
  };
  let mockProcess: HarnessProcess;

  beforeEach(() => {
    mockHarness = {
      type: "claude-code",
      start: vi.fn(),
      resume: vi.fn(),
      kill: vi.fn(),
    };

    mockProcess = {
      processId: 12345,
      sessionId: "test-session-123",
      mode: "plan" as Mode,
      send: vi.fn().mockResolvedValue("Response from Claude"),
      approve: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue([]),
      kill: vi.fn().mockResolvedValue(undefined),
    };

    manager = new SessionManager(
      mockHarness as unknown as { type: HarnessType; start: Mock; resume: Mock; kill: Mock },
      undefined,
      { maxConcurrentSessions: 5 }
    );
  });

  describe("create", () => {
    it("should create a new session successfully", async () => {
      mockHarness.start.mockResolvedValue(mockProcess);

      const config: SessionStartConfig = {
        workdir: "/test/project",
        mode: "plan",
        prompt: "Hello",
      };

      const result = await manager.create(config);

      expect(result.sessionId).toBe("test-session-123");
      expect(result.workdir).toBe("/test/project");
      expect(result.mode).toBe("plan");
      expect(result.status).toBe("active");
      expect(mockHarness.start).toHaveBeenCalledWith(config);
    });

    it("should throw SESSION_LIMIT_EXCEEDED when limit reached", async () => {
      for (let i = 0; i < 5; i++) {
        const process = { ...mockProcess, sessionId: `session-${i}` };
        mockHarness.start.mockResolvedValue(process);
        await manager.create({ workdir: "/test", prompt: "test" });
      }

      mockHarness.start.mockResolvedValue({ ...mockProcess, sessionId: "extra" });

      try {
        await manager.create({ workdir: "/test", prompt: "test" });
        expect(false).toBe(true);
      } catch (error) {
        expect(isHarnessError(error)).toBe(true);
        expect((error as { code: ErrorCode }).code).toBe(
          ErrorCode.SESSION_LIMIT_EXCEEDED
        );
      }
    });

    it("should use default mode when not specified", async () => {
      mockHarness.start.mockResolvedValue(mockProcess);

      const result = await manager.create({
        workdir: "/test",
        prompt: "Hello",
      });

      expect(result.mode).toBe("plan");
    });
  });

  describe("resume", () => {
    it("should throw SESSION_NOT_FOUND when session does not exist", async () => {
      try {
        await manager.resume("nonexistent-session");
        expect(false).toBe(true);
      } catch (error) {
        expect(isHarnessError(error)).toBe(true);
        expect((error as { code: ErrorCode }).code).toBe(
          ErrorCode.SESSION_NOT_FOUND
        );
      }
    });
  });

  describe("send", () => {
    it("should throw SESSION_NOT_FOUND if session not found", async () => {
      try {
        await manager.send("nonexistent", "Hello");
        expect(false).toBe(true);
      } catch (error) {
        expect(isHarnessError(error)).toBe(true);
        expect((error as { code: ErrorCode }).code).toBe(
          ErrorCode.SESSION_NOT_FOUND
        );
      }
    });
  });

  describe("kill", () => {
    it("should return killed status for nonexistent session", async () => {
      const result = await manager.kill("nonexistent-session");

      expect(result.status).toBe("killed");
      expect(result.sessionId).toBe("nonexistent-session");
    });
  });

  describe("read", () => {
    it("should throw SESSION_NOT_FOUND if session not found", async () => {
      try {
        await manager.read("nonexistent");
        expect(false).toBe(true);
      } catch (error) {
        expect(isHarnessError(error)).toBe(true);
        expect((error as { code: ErrorCode }).code).toBe(
          ErrorCode.SESSION_NOT_FOUND
        );
      }
    });
  });
});
