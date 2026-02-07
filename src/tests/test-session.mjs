#!/usr/bin/env node

/**
 * Test reins by starting a session and asking Claude who it is
 */

const { spawn } = await import("child_process");

const ARGS = ["/home/agi01/.openclaw/workspace-claude-code/reins/dist/cli.js"];
let sessionId = null;

// Start the MCP server as a child process
const child = spawn("node", ARGS, {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdout?.on("data", (data) => {
  const text = data.toString();
  process.stdout.write(text);
  
  // Try to extract sessionId from responses
  try {
    const parsed = JSON.parse(text);
    if (parsed.result?.content) {
      const content = JSON.parse(parsed.result.content[0].text);
      if (content.sessionId) {
        sessionId = content.sessionId;
        console.log(`\n🎯 Captured sessionId: ${sessionId}\n`);
      }
    }
  } catch (e) {}
});

child.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

setTimeout(async () => {
  console.log("\n=== Step 1: Starting session ===\n");
  
  child.stdin?.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "harness_session_start",
      arguments: {
        workdir: "/tmp",
        mode: "plan",
        prompt: "who are you and what are you good at?",
        model: "sonnet",
        timeoutSeconds: 60
      }
    }
  }) + "\n");

  // Wait for Claude to respond
  setTimeout(async () => {
    if (sessionId) {
      console.log(`\n=== Step 2: Reading session ${sessionId} ===\n`);
      
      child.stdin?.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "harness_session_read",
          arguments: { sessionId }
        }
      }) + "\n");
    } else {
      console.log("\n❌ No sessionId captured\n");
    }

    setTimeout(() => {
      console.log("\n=== Test complete ===\n");
      child.stdin?.end();
      child.kill();
      process.exit(0);
    }, 5000);
  }, 10000);
}, 2000);
