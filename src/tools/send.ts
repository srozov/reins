/**
 * reins_session_send tool
 * 
 * Custom CLI arguments can override default behavior.
 */

import { ISessionManager } from "../types.js";

export interface SendInput {
  sessionId: string;
  message: string;
  /** Custom CLI arguments for Claude CLI */
  claudeArgs?: string[];
}

export interface SendOutput {
  response: string;
  sessionId: string;
}

export async function handleSessionSend(manager: ISessionManager, input: SendInput): Promise<SendOutput> {
  const { sessionId, message } = input;
  return manager.send(sessionId, message);
}
