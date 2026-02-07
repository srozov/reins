/**
 * reins_session_list tool
 */

import { ISessionManager } from "../types.js";

export interface ListInput {}

export interface ListOutput {
  sessions: Array<{
    sessionId: string;
    workdir: string;
    mode: string;
    status: string;
    createdAt: string;
    lastActive: string;
  }>;
}

export async function handleSessionList(manager: ISessionManager, _input: ListInput): Promise<ListOutput> {
  const sessions = await manager.list();

  return {
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      workdir: s.workdir,
      mode: s.mode,
      status: s.status,
      createdAt: s.createdAt,
      lastActive: s.lastActive,
    })),
  };
}
