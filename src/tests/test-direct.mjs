#!/usr/bin/env node

/**
 * Direct test of harness Claude Code integration
 */

const { spawn } = await import("child_process");

// Start Claude Code directly
const child = spawn("claude", ["-p", "--output-format", "json", "--permission-mode", "plan"], {
  cwd: "/tmp",
  stdio: ["pipe", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";

child.stdout?.on("data", (data) => {
  const text = data.toString();
  stdout += text;
  console.log("stdout:", text.substring(0, 200));
});

child.stderr?.on("data", (data) => {
  const text = data.toString();
  stderr += text;
  console.log("stderr:", text.substring(0, 200));
});

// Send prompt
setTimeout(() => {
  console.log("\n=== Sending prompt ===\n");
  child.stdin?.write("who are you?\n");
  child.stdin?.end();
}, 1000);

// Wait for response and parse
setTimeout(() => {
  console.log("\n=== Analysis ===");
  console.log("stdout length:", stdout.length);
  console.log("stderr length:", stderr.length);
  
  // Try to parse stdout
  try {
    const lines = stdout.split('\n').filter(l => l.trim());
    console.log("stdout lines:", lines.length);
    for (const line of lines) {
      if (line.startsWith('{')) {
        console.log("Found JSON in stdout");
        const parsed = JSON.parse(line);
        console.log("Has result?", parsed.result !== undefined);
        break;
      }
    }
  } catch (e) {
    console.log("Parse error:", e.message);
  }
  
  // Try stderr
  try {
    const lines = stderr.split('\n').filter(l => l.trim());
    console.log("stderr lines:", lines.length);
  } catch (e) {
    console.log("Stderr parse error:", e.message);
  }
  
  child.kill();
  process.exit(0);
}, 8000);
