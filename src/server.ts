/**
 * Reins MCP Server
 * Uses the McpServer high-level API with stdio transport
 * 
 * Exposes Claude Code CLI as MCP tools with flexible argument support
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { ISessionManager } from "./types.js";
import { handleSessionStart } from "./tools/start.js";
import { handleSessionSend } from "./tools/send.js";
import { handleSessionApprove } from "./tools/approve.js";
import { handleSessionKill } from "./tools/kill.js";
import { handleSessionRead } from "./tools/read.js";
import { handleSessionList } from "./tools/list.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger("server");

export class ReinsServer {
  private server: McpServer;
  private manager: ISessionManager;

  constructor(manager: ISessionManager) {
    this.manager = manager;

    this.server = new McpServer(
      {
        name: "reins",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      }
    );

    this.registerTools();
  }

  private registerTools(): void {
    // Tool: reins_session_list
    this.server.registerTool(
      "reins_session_list",
      {
        title: "List Sessions",
        description: "List all Claude Code sessions from native storage",
        inputSchema: {},
      },
      async () => {
        logger.info("Listing sessions");
        const result = await handleSessionList(this.manager, {});
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );

    // Tool: reins_session_start
    this.server.registerTool(
      "reins_session_start",
      {
        title: "Start Claude Session",
        description: "Start a new Claude Code CLI session",
        inputSchema: {
          workdir: z.string().describe("Working directory for the session"),
          mode: z
            .enum(["plan", "auto", "full"])
            .default("plan")
            .describe("Permission mode: plan (read-only), auto (read/write), full (no sandbox)"),
          prompt: z.string().describe("Initial prompt to send to Claude"),
          model: z.string().optional().describe("Model to use (e.g., sonnet, haiku, opus)"),
          timeoutSeconds: z.number().optional().describe("Timeout in seconds (default: 60)"),
          claudeArgs: z.array(z.string())
            .optional()
            .describe("Custom CLI arguments for Claude (e.g., ['--model', 'sonnet', '--dangerously-skip-permissions'])"),
        },
      },
      async ({ workdir, mode, prompt, model, timeoutSeconds, claudeArgs }) => {
        logger.info("Starting session", { workdir, mode, claudeArgs });
        const result = await handleSessionStart(this.manager, {
          workdir,
          mode,
          prompt,
          model,
          timeoutSeconds,
          claudeArgs,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );

    // Tool: reins_session_send
    this.server.registerTool(
      "reins_session_send",
      {
        title: "Send to Session",
        description: "Send a message to an existing Claude Code session",
        inputSchema: {
          sessionId: z.string().describe("Session ID to resume"),
          message: z.string().describe("Message to send"),
          claudeArgs: z.array(z.string())
            .optional()
            .describe("Custom CLI arguments to override defaults"),
        },
      },
      async ({ sessionId, message, claudeArgs }) => {
        logger.info("Sending message", { sessionId, claudeArgs });
        const result = await handleSessionSend(this.manager, { sessionId, message, claudeArgs });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );

    // Tool: reins_session_approve
    this.server.registerTool(
      "reins_session_approve",
      {
        title: "Approve Session",
        description: "Approve a plan-mode session to switch to execute mode",
        inputSchema: {
          sessionId: z.string().describe("Session ID"),
          corrections: z.string().optional().describe("Optional corrections to provide before approving"),
          claudeArgs: z.array(z.string())
            .optional()
            .describe("Custom CLI arguments to override defaults"),
        },
      },
      async ({ sessionId, corrections, claudeArgs }) => {
        logger.info("Approving session", { sessionId, claudeArgs });
        const result = await handleSessionApprove(this.manager, { sessionId, corrections, claudeArgs });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );

    // Tool: reins_session_kill
    this.server.registerTool(
      "reins_session_kill",
      {
        title: "Kill Session",
        description: "Terminate an active Claude Code session",
        inputSchema: {
          sessionId: z.string().describe("Session ID to terminate"),
        },
      },
      async ({ sessionId }) => {
        logger.info("Killing session", { sessionId });
        const result = await handleSessionKill(this.manager, { sessionId });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );

    // Tool: reins_session_read
    this.server.registerTool(
      "reins_session_read",
      {
        title: "Read Session",
        description: "Read a session's transcript from native storage",
        inputSchema: {
          sessionId: z.string().describe("Session ID to read"),
          limit: z.number().optional().describe("Return only the last N messages"),
        },
      },
      async ({ sessionId, limit }) => {
        logger.info("Reading session", { sessionId, limit });
        const result = await handleSessionRead(this.manager, { sessionId, limit });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    );
  }

  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Reins MCP server connected via stdio transport");
  }
}

export function createServer(manager: ISessionManager): ReinsServer {
  return new ReinsServer(manager);
}

/**
 * Alias for createHarnessBridgeServer (backward compatibility)
 * @deprecated Use createServer instead
 */
export function createHarnessBridgeServer(manager: ISessionManager): ReinsServer {
  console.warn("createHarnessBridgeServer is deprecated. Use createServer instead.");
  return new ReinsServer(manager);
}
