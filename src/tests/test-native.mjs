#!/usr/bin/env node

/**
 * Test harness with native Claude Code sessions
 */

const { spawn } = await import("child_process");

// First, create a new session
console.log("=== Step 1: Create a new session ===\n");

const createProcess = spawn("node", ["/home/agi01/.openclaw/workspace-claude-code/reins/dist/cli.js"], {
  stdio: ["pipe", "pipe", "pipe"]
});

createProcess.stdout?.on("data", (data) => {
  process.stdout.write(data.toString());
});

createProcess.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

// Wait for server to start
await new Promise(r => setTimeout(r, 2000));

// Create a new session
createProcess.stdin?.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "harness_session_start",
    arguments: {
      workdir: "/tmp",
      mode: "plan",
      prompt: "What is 2+2? Answer with just the number.",
      model: "haiku",
      timeoutSeconds: 30
    }
  }
}) + "\n");

await new Promise(r => setTimeout(r, 5000));

createProcess.stdin?.end();
createProcess.kill();

console.log("\n=== Session created ===\n");

// Now test listing and reading sessions
console.log("=== Step 2: List sessions ===\n");

const listProcess = spawn("node", ["/home/agi01/.openclaw/workspace-claude-code/reins/dist/cli.js"], {
  stdio: ["pipe", "pipe", "pipe"]
});

listProcess.stdout?.on("data", (data) => {
  process.stdout.write(data.toString());
});

listProcess.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

await new Promise(r => setTimeout(r, 2000));

listProcess.stdin?.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "harness_session_list",
    arguments: {}
  }
}) + "\n");

await new Promise(r => setTimeout(r, 2000));

console.log("\n=== Done ===\n");
listProcess.stdin?.end();
listProcess.kill();
