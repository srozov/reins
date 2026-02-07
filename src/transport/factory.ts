/**
 * Transport Factory - Creates appropriate transport based on configuration
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TransportConfig, ISessionManager } from "../types.js";
import { createHTTPTransport } from "./http.js";
import { createWebSocketTransport } from "./websocket.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("transport-factory");

export type Transport = StdioServerTransport | ReturnType<typeof createHTTPTransport> | ReturnType<typeof createWebSocketTransport>;

export function createTransport(
  config: TransportConfig,
  sessionManager: ISessionManager
): Transport {
  logger.info(`Creating ${config.type} transport`, { port: config.port });

  switch (config.type) {
    case "stdio":
      return new StdioServerTransport();

    case "http":
      if (!config.port) {
        throw new Error("HTTP transport requires port configuration");
      }
      return createHTTPTransport(sessionManager, {
        port: config.port,
        host: config.host,
      });

    case "websocket":
      if (!config.port) {
        throw new Error("WebSocket transport requires port configuration");
      }
      return createWebSocketTransport(sessionManager, {
        port: config.port,
        host: config.host,
      });

    default:
      throw new Error(`Unknown transport type: ${config.type}`);
  }
}

/**
 * Determine if transport requires explicit start/stop
 */
export function transportRequiresExplicitStart(transport: Transport): boolean {
  return transport !== null && typeof transport === "object" && "start" in transport;
}
