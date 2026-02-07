/**
 * reins_session_kill tool
 */

import { ISessionManager } from "../types.js";

export interface KillInput {
  sessionId: string;
}

export interface KillOutput {
  sessionId: string;
  status: string;
}

export async function handleSessionKill(manager: ISessionManager, input: KillInput): Promise<KillOutput> {
  const result = await manager.kill(input.sessionId);

  return {
    sessionId: result.sessionId,
    status: result.status,
  };
}
