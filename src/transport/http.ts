/**
 * HTTP Transport - HTTP server transport for MCP
 * Provides HTTP/JSON endpoints for Harness Bridge operations
 */

import http from "http";
import { ISessionManager } from "../types.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("http-transport");

interface HTTPTransportConfig {
  port: number;
  host?: string;
}

interface HTTPResponse {
  statusCode: number;
  body: unknown;
}

export class HTTPServerTransport {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private sessionManager: ISessionManager;

  constructor(sessionManager: ISessionManager, config: HTTPTransportConfig) {
    this.sessionManager = sessionManager;
    this.port = config.port;
    this.host = config.host || "localhost";
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer(async (req, res) => {
          await this.handleRequest(req, res);
        });

        this.server.listen(this.port, this.host, () => {
          logger.info(`HTTP server listening on http://${this.host}:${this.port}`);
          resolve();
        });

        this.server.on("error", (err) => {
          logger.error(`HTTP server error: ${(err as Error).message}`);
          reject(err);
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to start HTTP server: ${message}`);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          logger.error(`Failed to close HTTP server: ${(err as Error).message}`);
          reject(err);
        } else {
          logger.info("HTTP server stopped");
          resolve();
        }
      });
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const method = req.method || "GET";
    const path = req.url || "/";

    try {
      // Parse request body if present
      let body: unknown = null;
      if (method !== "GET" && method !== "HEAD") {
        body = await this.parseBody(req);
      }

      logger.debug(`${method} ${path}`, { contentType: req.headers["content-type"] });

      // Route requests
      const response = await this.route(method, path, body);

      // Set response headers
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      // Handle OPTIONS requests
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Write response
      res.writeHead(response.statusCode);
      res.end(JSON.stringify(response.body));
    } catch (error: unknown) {
      logger.error(`Request handler error: ${(error as Error).message}`);

      const errorResponse = {
        error: (error as Error).message || "Internal server error",
        code: "INTERNAL_ERROR",
      };

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(errorResponse));
    }
  }

  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          if (body) {
            resolve(JSON.parse(body));
          } else {
            resolve(null);
          }
        } catch (error: unknown) {
          reject(
            new Error(`Invalid JSON in request body: ${(error as Error).message}`)
          );
        }
      });

      req.on("error", (err: Error) => {
        reject(new Error(`Failed to read request body: ${err.message}`));
      });
    });
  }

  private async route(method: string, path: string, body: unknown): Promise<HTTPResponse> {
    // Health check
    if (path === "/" || path === "/health") {
      return {
        statusCode: 200,
        body: { status: "ok", version: "0.2.0" },
      };
    }

    // Session operations
    if (method === "POST") {
      if (path === "/api/sessions") {
        return await this.handleStartSession(body);
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/send$/)) {
        const sessionId = path.split("/")[3];
        return await this.handleSendMessage(sessionId, body);
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/approve$/)) {
        const sessionId = path.split("/")[3];
        return await this.handleApproveSession(sessionId, body);
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/kill$/)) {
        const sessionId = path.split("/")[3];
        return await this.handleKillSession(sessionId);
      }
    }

    // Session queries
    if (method === "GET") {
      if (path === "/api/sessions") {
        return await this.handleListSessions();
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/?$/)) {
        const sessionId = path.split("/")[3];
        return await this.handleReadSession(sessionId);
      }
    }

    // Not found
    return {
      statusCode: 404,
      body: { error: "Not found", code: "NOT_FOUND" },
    };
  }

  private async handleStartSession(body: unknown): Promise<HTTPResponse> {
    try {
      const config = body as Record<string, unknown>;

      if (!config.workdir || !config.prompt) {
        return {
          statusCode: 400,
          body: { error: "workdir and prompt are required", code: "MISSING_PARAMS" },
        };
      }

      const metadata = await this.sessionManager.create({
        workdir: config.workdir as string,
        prompt: config.prompt as string,
        mode: ((config.mode as string | undefined) || "plan") as any,
        model: config.model as string | undefined,
        timeoutSeconds: config.timeoutSeconds as number | undefined,
      });

      return {
        statusCode: 201,
        body: { session: metadata },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to start session";
      logger.error(`Start session error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "SESSION_START_FAILED" },
      };
    }
  }

  private async handleSendMessage(sessionId: string, body: unknown): Promise<HTTPResponse> {
    try {
      const config = body as Record<string, unknown>;

      if (!config.message) {
        return {
          statusCode: 400,
          body: { error: "message is required", code: "MISSING_PARAMS" },
        };
      }

      const result = await this.sessionManager.send(sessionId, config.message as string);

      return {
        statusCode: 200,
        body: { result },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to send message";
      logger.error(`Send message error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "SEND_FAILED" },
      };
    }
  }

  private async handleApproveSession(
    sessionId: string,
    body: unknown
  ): Promise<HTTPResponse> {
    try {
      const config = body as Record<string, unknown>;

      const metadata = await this.sessionManager.approve(
        sessionId,
        config.corrections as string | undefined
      );

      return {
        statusCode: 200,
        body: { session: metadata },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to approve session";
      logger.error(`Approve session error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "APPROVE_FAILED" },
      };
    }
  }

  private async handleKillSession(sessionId: string): Promise<HTTPResponse> {
    try {
      const metadata = await this.sessionManager.kill(sessionId);

      return {
        statusCode: 200,
        body: { session: metadata },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to kill session";
      logger.error(`Kill session error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "KILL_FAILED" },
      };
    }
  }

  private async handleListSessions(): Promise<HTTPResponse> {
    try {
      const sessions = await this.sessionManager.list();

      return {
        statusCode: 200,
        body: { sessions },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to list sessions";
      logger.error(`List sessions error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "LIST_FAILED" },
      };
    }
  }

  private async handleReadSession(sessionId: string): Promise<HTTPResponse> {
    try {
      const session = await this.sessionManager.read(sessionId);

      return {
        statusCode: 200,
        body: { session },
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "Failed to read session";
      logger.error(`Read session error: ${message}`);
      return {
        statusCode: 500,
        body: { error: message, code: "READ_FAILED" },
      };
    }
  }
}

export function createHTTPTransport(
  sessionManager: ISessionManager,
  config: HTTPTransportConfig
): HTTPServerTransport {
  return new HTTPServerTransport(sessionManager, config);
}
