/**
 * Configuration Management - Parse and manage application configuration
 */

import { BridgeConfig, TransportConfig, LogLevel, ToolPermission } from "./types.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger("config");

export interface CLIArgs {
  transport?: string;
  port?: number;
  host?: string;
  sessionsDir?: string;
  logLevel?: LogLevel;
  mode?: string;
  timeoutSeconds?: number;
  allowTools?: string;
  denyTools?: string;
  configFile?: string;
  [key: string]: unknown;
}

/**
 * Parse command-line arguments
 */
export function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--transport" && argv[i + 1]) {
      args.transport = argv[++i];
    } else if (arg === "--port" && argv[i + 1]) {
      args.port = parseInt(argv[++i], 10);
    } else if (arg === "--host" && argv[i + 1]) {
      args.host = argv[++i];
    } else if (arg === "--sessions-dir" && argv[i + 1]) {
      args.sessionsDir = argv[++i];
    } else if (arg === "--log-level" && argv[i + 1]) {
      args.logLevel = argv[++i] as LogLevel;
    } else if (arg === "--mode" && argv[i + 1]) {
      args.mode = argv[++i];
    } else if (arg === "--timeout" && argv[i + 1]) {
      args.timeoutSeconds = parseInt(argv[++i], 10);
    } else if (arg === "--allow-tools" && argv[i + 1]) {
      args.allowTools = argv[++i];
    } else if (arg === "--deny-tools" && argv[i + 1]) {
      args.denyTools = argv[++i];
    } else if (arg === "--config" && argv[i + 1]) {
      args.configFile = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      printVersion();
      process.exit(0);
    }
  }

  return args;
}

/**
 * Create BridgeConfig from CLI arguments
 */
export function createConfigFromArgs(args: CLIArgs): BridgeConfig {
  const logLevel = args.logLevel || "info";

  // Initialize logger with configured level
  if (logger.getLevel && logger.getLevel() !== logLevel) {
    logger.setLevel(logLevel);
  }

  const config: BridgeConfig = {
    sessionsDir: args.sessionsDir || "~/.claude/sessions",
    logLevel,
    defaultMode: (args.mode as any) || "plan",
    timeoutSeconds: args.timeoutSeconds || 30,
    maxConcurrentSessions: 10,
    readNativeFormat: true,
  };

  // Configure transport
  const transport: TransportConfig = {
    type: (args.transport as any) || "stdio",
  };

  if (args.port) {
    transport.port = args.port;
  }

  if (args.host) {
    transport.host = args.host;
  }

  config.transport = transport;

  // Configure tool permissions
  if (args.allowTools || args.denyTools) {
    const permission: ToolPermission = {
      mode: args.allowTools ? "allowlist" : "denylist",
      tools: args.allowTools
        ? args.allowTools.split(",").map((t) => t.trim())
        : args.denyTools
        ? args.denyTools.split(",").map((t) => t.trim())
        : [],
    };

    config.toolPermission = permission;
  }

  logger.debug("Configuration created from CLI args", config as Record<string, unknown>);

  return config;
}

/**
 * Merge configurations with CLI args taking precedence
 */
export function mergeConfigs(fileConfig: BridgeConfig, cliArgs: CLIArgs): BridgeConfig {
  const merged = { ...fileConfig };

  if (cliArgs.sessionsDir) {
    merged.sessionsDir = cliArgs.sessionsDir;
  }
  if (cliArgs.logLevel) {
    merged.logLevel = cliArgs.logLevel;
  }
  if (cliArgs.mode) {
    merged.defaultMode = cliArgs.mode as any;
  }
  if (cliArgs.timeoutSeconds) {
    merged.timeoutSeconds = cliArgs.timeoutSeconds;
  }

  // Merge transport config
  if (cliArgs.transport || cliArgs.port || cliArgs.host) {
    merged.transport = {
      type: (cliArgs.transport || merged.transport?.type || "stdio") as any,
      port: cliArgs.port || merged.transport?.port,
      host: cliArgs.host || merged.transport?.host,
    };
  }

  // Merge tool permissions
  if (cliArgs.allowTools || cliArgs.denyTools) {
    merged.toolPermission = {
      mode: cliArgs.allowTools ? "allowlist" : "denylist",
      tools: cliArgs.allowTools
        ? cliArgs.allowTools.split(",").map((t) => t.trim())
        : cliArgs.denyTools
        ? cliArgs.denyTools.split(",").map((t) => t.trim())
        : [],
    };
  }

  return merged;
}

/**
 * Validate configuration
 */
export function validateConfig(config: BridgeConfig): string[] {
  const errors: string[] = [];

  if (config.transport) {
    if (config.transport.type === "http" || config.transport.type === "websocket") {
      if (!config.transport.port) {
        errors.push(`${config.transport.type} transport requires port configuration`);
      }
      if (config.transport.port && (config.transport.port < 1024 || config.transport.port > 65535)) {
        errors.push(`Invalid port number: ${config.transport.port} (must be 1024-65535)`);
      }
    }
  }

  if (config.timeoutSeconds && config.timeoutSeconds < 1) {
    errors.push("Timeout must be greater than 0 seconds");
  }

  if (config.maxConcurrentSessions && config.maxConcurrentSessions < 1) {
    errors.push("Max concurrent sessions must be greater than 0");
  }

  return errors;
}

function printHelp(): void {
  console.log(`
Reins v0.2.0 - Universal MCP Adapter for CLI Coding Agents

USAGE:
  reins [OPTIONS]

OPTIONS:
  --transport <type>        Transport type (stdio, http, websocket) [default: stdio]
  --port <number>          Port for HTTP/WebSocket transports [default: 3000]
  --host <hostname>        Host for HTTP/WebSocket transports [default: localhost]
  --sessions-dir <path>    Sessions directory [default: ~/.claude/sessions]
  --log-level <level>      Log level (debug, info, warn, error) [default: info]
  --mode <mode>            Default session mode (plan, auto, full) [default: plan]
  --timeout <seconds>      Default session timeout in seconds [default: 30]
  --allow-tools <list>     Comma-separated list of allowed tools
  --deny-tools <list>      Comma-separated list of denied tools
  --config <path>          Path to configuration file
  --help, -h               Show this help message
  --version, -v            Show version

EXAMPLES:
  # Start with default stdio transport
  reins

  # Start HTTP server on port 3000
  reins --transport http --port 3000

  # Start WebSocket server with custom sessions directory
  reins --transport websocket --port 3001 --sessions-dir /custom/path

  # Enable debug logging
  reins --log-level debug

  # Restrict to specific tools
  reins --allow-tools reins_session_start,reins_session_send
`);
}

function printVersion(): void {
  console.log("Reins v0.2.0");
}
