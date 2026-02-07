#!/usr/bin/env node

/**
 * Test session reconnection
 */

const { spawn } = await import("child_process");

const ARGS = ["/home/agi01/.openclaw/workspace-claude-code/harness_bridge/dist/cli.js"];
const SESSION_ID = "09eab4d8-2228-4bc1-a2f1-c665ce8ec223";

const child = spawn("node", ARGS, {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdout?.on("data", (data) => {
  process.stdout.write(data.toString());
});

child.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

setTimeout(async () => {
  console.log(`\n=== Step 1: List sessions ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "harness_session_list", arguments: {} }
  }) + "\n");

  await new Promise(r => setTimeout(r, 2000));

  console.log(`\n=== Step 2: Read session ${SESSION_ID.substring(0, 8)}... ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "harness_session_read", arguments: { sessionId: SESSION_ID } }
  }) + "\n");

  await new Promise(r => setTimeout(r, 2000));

  console.log(`\n=== Step 3: Send follow-up message ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { 
      name: "harness_session_send", 
      arguments: { 
        sessionId: SESSION_ID,
        message: "That's great! Can you help me write a Python function to calculate fibonacci?"
      }
    }
  }) + "\n");

  await new Promise(r => setTimeout(r, 8000));

  console.log(`\n=== Step 4: Read updated session ===\n`);
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "harness_session_read", arguments: { sessionId: SESSION_ID } }
  }) + "\n");

  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n=== Test complete ===\n`);
  child.stdin?.end();
  child.kill();
  process.exit(0);
}, 2000);
