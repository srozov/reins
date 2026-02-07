/**
 * reins_session_approve tool
 */

import { ISessionManager } from "../types.js";

export interface ApproveInput {
  sessionId: string;
  corrections?: string;
  /** Custom CLI arguments for Claude CLI */
  claudeArgs?: string[];
}

export interface ApproveOutput {
  sessionId: string;
  mode: string;
  status: string;
}

export async function handleSessionApprove(manager: ISessionManager, input: ApproveInput): Promise<ApproveOutput> {
  const result = await manager.approve(input.sessionId, input.corrections);

  return {
    sessionId: result.sessionId,
    mode: result.mode,
    status: result.status,
  };
}
