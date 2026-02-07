/**
 * Logger Utility - Provides structured logging across the application
 */

import { ILogger, LogLevel } from "../types.js";

export class Logger implements ILogger {
  private level: LogLevel;
  private prefix: string;

  private readonly levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(prefix: string = "reins", level: LogLevel = "info") {
    this.prefix = prefix;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.level];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${this.prefix}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }
}

// Singleton logger instance
let globalLogger: Logger | null = null;

export function getLogger(prefix?: string, level?: LogLevel): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(prefix, level);
  }
  return globalLogger;
}

export function initLogger(level: LogLevel = "info", prefix: string = "reins"): Logger {
  globalLogger = new Logger(prefix, level);
  return globalLogger;
}
