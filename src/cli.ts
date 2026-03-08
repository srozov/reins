#!/usr/bin/env node

/**
 * Reins CLI - Main entry point
 * 
 * "You hold the reins" - Control Claude Code via MCP
 */

import { SessionManager } from "./session/manager.js";
import { ClaudeCodeHarness, CodexHarness } from "./harness/index.js";
import { createServer } from "./server.js";
import { parseArgs, createConfigFromArgs, validateConfig } from "./config.js";
import { initLogger, getLogger } from "./utils/logger.js";

const logger = getLogger("cli");

async function main(): Promise<void> {
  try {
    // Parse CLI arguments
    const cliArgs = parseArgs(process.argv.slice(2));

    // Create configuration from CLI arguments
    const config = createConfigFromArgs(cliArgs);

    // Initialize logger with configured level
    initLogger(config.logLevel || "info", "reins");

    logger.info("Starting Reins v0.2.0", {
      port: config.transport?.port,
      sessionsDir: config.sessionsDir,
    });

    // Validate configuration
    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      logger.error("Configuration validation failed:");
      for (const error of validationErrors) {
        logger.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // Create harness adapter based on configuration
    const harnessType = config.harness || "claude-code";
    const harness = harnessType === "codex"
      ? new CodexHarness()
      : new ClaudeCodeHarness();

    logger.info(`Using harness: ${harnessType}`);

    // Create session manager with configuration
    const manager = new SessionManager(harness, config.sessionsDir || "~/.claude/sessions", {
      maxConcurrentSessions: config.maxConcurrentSessions || 10,
    });

    // Create MCP server
    const server = createServer(manager);

    // Start server with stdio transport (only supported transport for now)
    await server.connect();

    logger.info("Reins started");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("Shutting down...");
      process.exit(0);
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to start Reins: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
