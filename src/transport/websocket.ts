/**
 * WebSocket Transport - WebSocket transport for Harness Bridge
 * Provides bidirectional communication via WebSocket connections
 * 
 * Note: This requires 'ws' package. Add to dependencies:
 * npm install ws
 * npm install --save-dev @types/ws
 */

import http from "http";
import { getLogger } from "../utils/logger.js";
import { ISessionManager } from "../types.js";

const logger = getLogger("websocket-transport");

interface WebSocketConfig {
  port: number;
  host?: string;
}

interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export class WebSocketServerTransport {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private sessionManager: ISessionManager;
  private clients: Map<string, unknown> = new Map();
  private sessionToClient: Map<string, string> = new Map();

  constructor(sessionManager: ISessionManager, config: WebSocketConfig) {
    this.sessionManager = sessionManager;
    this.port = config.port;
    this.host = config.host || "localhost";
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer();

        // Note: Actual WebSocket upgrade handling requires 'ws' library
        // This is a stub that demonstrates the transport interface
        logger.warn(
          "WebSocket transport requires 'ws' package. Install with: npm install ws"
        );

        this.server.listen(this.port, this.host, () => {
          logger.info(`WebSocket server listening on ws://${this.host}:${this.port}`);
          logger.warn("WebSocket implementation requires ws package - using HTTP fallback");
          resolve();
        });

        this.server.on("error", (err) => {
          logger.error(`WebSocket server error: ${(err as Error).message}`);
          reject(err);
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to start WebSocket server: ${message}`);
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

      // Close all client connections
      for (const client of this.clients.values()) {
        try {
          if (typeof client === "object" && client !== null && "close" in client) {
            (client as unknown as { close: () => void }).close();
          }
        } catch (error: unknown) {
          logger.warn(`Error closing client: ${(error as Error).message}`);
        }
      }

      this.clients.clear();
      this.sessionToClient.clear();

      this.server.close((err) => {
        if (err) {
          logger.error(`Failed to close WebSocket server: ${(err as Error).message}`);
          reject(err);
        } else {
          logger.info("WebSocket server stopped");
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   * Requires ws library integration
   * Public method to allow external handling
   */
  async handleMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    try {
      logger.debug(`Received message from client ${clientId}:`, {
        type: message.type,
        sessionId: message.sessionId,
      });

      switch (message.type) {
        case "session:start": {
          const data = message.data as Record<string, unknown>;
          const metadata = await this.sessionManager.create({
            workdir: data.workdir as string,
            prompt: data.prompt as string,
            mode: ((data.mode as string | undefined) || "plan") as any,
            timeoutSeconds: data.timeoutSeconds as number | undefined,
          });

          this.sendToClient(clientId, {
            type: "session:started",
            sessionId: metadata.sessionId,
            data: metadata,
          });
          break;
        }

        case "session:send": {
          if (!message.sessionId) {
            this.sendToClient(clientId, {
              type: "error",
              error: "sessionId is required",
            });
            return;
          }

          const data = message.data as Record<string, unknown>;
          const result = await this.sessionManager.send(
            message.sessionId,
            data.message as string
          );

          this.sendToClient(clientId, {
            type: "session:response",
            sessionId: message.sessionId,
            data: result,
          });
          break;
        }

        case "session:approve": {
          if (!message.sessionId) {
            this.sendToClient(clientId, {
              type: "error",
              error: "sessionId is required",
            });
            return;
          }

          const data = message.data as Record<string, unknown>;
          const metadata = await this.sessionManager.approve(
            message.sessionId,
            data.corrections as string | undefined
          );

          this.sendToClient(clientId, {
            type: "session:approved",
            sessionId: message.sessionId,
            data: metadata,
          });
          break;
        }

        case "session:kill": {
          if (!message.sessionId) {
            this.sendToClient(clientId, {
              type: "error",
              error: "sessionId is required",
            });
            return;
          }

          const metadata = await this.sessionManager.kill(message.sessionId);

          this.sendToClient(clientId, {
            type: "session:killed",
            sessionId: message.sessionId,
            data: metadata,
          });
          break;
        }

        case "session:read": {
          if (!message.sessionId) {
            this.sendToClient(clientId, {
              type: "error",
              error: "sessionId is required",
            });
            return;
          }

          const session = await this.sessionManager.read(message.sessionId);

          this.sendToClient(clientId, {
            type: "session:transcript",
            sessionId: message.sessionId,
            data: session,
          });
          break;
        }

        case "session:list": {
          const sessions = await this.sessionManager.list();

          this.sendToClient(clientId, {
            type: "sessions:list",
            data: sessions,
          });
          break;
        }

        default:
          this.sendToClient(clientId, {
            type: "error",
            error: `Unknown message type: ${message.type}`,
          });
      }
    } catch (error: unknown) {
      const message = (error as Error).message || "Unknown error";
      logger.error(`Message handler error: ${message}`);

      this.sendToClient(clientId, {
        type: "error",
        error: message,
      });
    }
  }

  /**
   * Send message to client
   * Requires ws library integration
   */
  private sendToClient(clientId: string, message: Record<string, unknown>): void {
    const client = this.clients.get(clientId);

    if (!client) {
      logger.warn(`Client not found: ${clientId}`);
      return;
    }

    try {
      logger.debug(`Sending message to client ${clientId}:`, { type: message.type });

      // This would use websocket.send() when ws library is available
      // For now, just log the operation
      if (typeof client === "object" && client !== null && "send" in client) {
        (client as unknown as { send: (data: string) => void }).send(
          JSON.stringify(message)
        );
      }
    } catch (error: unknown) {
      logger.error(
        `Failed to send message to client ${clientId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Register a client connection
   * Called when client connects
   */
  registerClient(clientId: string, connection: unknown): void {
    this.clients.set(clientId, connection);
    logger.debug(`Client registered: ${clientId}`, { totalClients: this.clients.size });
  }

  /**
   * Unregister a client connection
   * Called when client disconnects
   */
  unregisterClient(clientId: string): void {
    const sessionId = this.sessionToClient.get(clientId);
    if (sessionId) {
      this.sessionToClient.delete(clientId);
    }

    this.clients.delete(clientId);
    logger.debug(`Client unregistered: ${clientId}`, { totalClients: this.clients.size });
  }
}

export function createWebSocketTransport(
  sessionManager: ISessionManager,
  config: WebSocketConfig
): WebSocketServerTransport {
  return new WebSocketServerTransport(sessionManager, config);
}

/**
 * Note on full WebSocket implementation:
 * 
 * To use this transport in production, install the ws library:
 * npm install ws @types/ws
 * 
 * Then, add WebSocket upgrade handling in your server:
 * 
 * import WebSocket from 'ws';
 * 
 * const wsServer = new WebSocket.Server({ server });
 * 
 * wsServer.on('connection', (ws) => {
 *   const clientId = generateId();
 *   transport.registerClient(clientId, ws);
 *   
 *   ws.on('message', async (data: Buffer) => {
 *     const message = JSON.parse(data.toString());
 *     await transport.handleMessage(clientId, message);
 *   });
 *   
 *   ws.on('close', () => {
 *     transport.unregisterClient(clientId);
 *   });
 * });
 */
