/**
 * reins_session_read tool
 * 
 * Returns session transcript with optional limit on number of messages.
 */

import { ISessionManager } from "../types.js";

export interface ReadInput {
  sessionId: string;
  /** Return only the last N messages */
  limit?: number;
}

export interface ReadOutput {
  sessionId: string;
  transcript: Array<{ role: string; content: string; timestamp?: string }>;
  fileChanges: string[];
  totalMessages?: number;
}

export async function handleSessionRead(manager: ISessionManager, input: ReadInput): Promise<ReadOutput> {
  const state = await manager.read(input.sessionId);
  
  let transcript = state.transcript;
  let totalMessages: number | undefined;

  if (input.limit && input.limit > 0 && transcript.length > input.limit) {
    totalMessages = transcript.length;
    transcript = transcript.slice(-input.limit);
  }

  return {
    sessionId: state.sessionId,
    transcript,
    fileChanges: state.fileChanges,
    totalMessages,
  };
}
