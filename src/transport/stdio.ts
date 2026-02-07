/**
 * stdio Transport - Standard input/output transport for MCP
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Create a stdio server transport for MCP
 * This is the standard way to connect to MCP clients
 */
export function createStdioTransport() {
  return new StdioServerTransport();
}

export { StdioServerTransport };
