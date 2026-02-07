#!/usr/bin/env node

/**
 * Simple session reconnection test
 */

const { spawn } = await import("child_process");

const SESSION_ID = "09eab4d8-2228-4bc1-a2f1-c665ce8ec223";

const child = spawn("node", ["/home/agi01/.openclaw/workspace-claude-code/reins/dist/cli.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdout?.on("data", (data) => {
  process.stdout.write(data.toString());
});

child.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

setTimeout(async () => {
  console.log(`\n=== Sending message to session ${SESSION_ID.substring(0, 8)}... ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "harness_session_send",
      arguments: {
        sessionId: SESSION_ID,
        message: "What languages can you help me with?"
      }
    }
  }) + "\n");

  await new Promise(r => setTimeout(r, 10000));

  console.log(`\n=== Reading updated session ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "harness_session_read",
      arguments: { sessionId: SESSION_ID }
    }
  }) + "\n");

  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n=== Done ===\n`);
  child.stdin?.end();
  child.kill();
  process.exit(0);
}, 2000);
