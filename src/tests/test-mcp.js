#!/usr/bin/env node

/**
 * Simple MCP Client Test
 * Tests reins server by sending JSON-RPC messages over stdio
 */

const { spawn } = require("child_process");

const CLAUDE_COMMAND = "node";
const ARGS = ["/home/agi01/.openclaw/workspace-claude-code/reins/dist/cli.js"];

// Start the MCP server as a child process
const child = spawn(CLAUDE_COMMAND, ARGS, {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdout?.on("data", (data) => {
  process.stdout.write(data.toString());
});

child.stderr?.on("data", (data) => {
  process.stderr.write(data.toString());
});

// Wait for server to start, then send a tools/list request
setTimeout(() => {
  console.log("\n=== Sending tools/list request ===\n");
  
  // Send JSON-RPC message
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  }) + "\n";
  
  child.stdin?.write(request);
  
  // Give it time to respond
  setTimeout(() => {
    console.log("\n=== Sending tools/call request ===\n");
    
    const callRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "harness_session_list",
        arguments: {},
      },
    }) + "\n";
    
    child.stdin?.write(callRequest);
    
    // Give it time to respond, then clean up
    setTimeout(() => {
      console.log("\n=== Test complete ===\n");
      child.stdin?.end();
      child.kill();
      process.exit(0);
    }, 2000);
  }, 2000);
}, 2000);
