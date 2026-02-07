/**
 * reins_session_start tool
 */

import { ISessionManager } from "../types.js";

export interface StartInput {
  workdir: string;
  mode?: "plan" | "auto" | "full";
  prompt: string;
  model?: string;
  timeoutSeconds?: number;
  /** Custom CLI arguments for Claude CLI */
  claudeArgs?: string[];
}

export interface StartOutput {
  sessionId: string;
  mode: string;
  status: string;
}

export async function handleSessionStart(manager: ISessionManager, input: StartInput): Promise<StartOutput> {
  const result = await manager.create({
    workdir: input.workdir,
    mode: input.mode || "plan",
    prompt: input.prompt,
    model: input.model,
    timeoutSeconds: input.timeoutSeconds,
    claudeArgs: input.claudeArgs,
  });

  return {
    sessionId: result.sessionId,
    mode: result.mode,
    status: result.status,
  };
}
