# Reins

Universal MCP adapter for CLI-based coding agents (Claude Code, Codex, OpenCode). Control and orchestrate AI coding harnesses via MCP.

> "You hold the reins" - Control Claude Code through MCP

## Overview

Reins exposes Claude Code CLI as MCP tools, making it accessible from any MCP-compatible host. It provides:

- **Plan/Execute Workflow** - Start in plan mode, review, then approve execution
- **Session Management** - Create, resume, and kill sessions with persistent state
- **MCP Protocol** - Standard JSON-RPC 2.0 interface
- **stdio Transport** - Works in any environment (local, container, CI/CD)

## The Concept: A Harness for Harnesses

Reins is a **meta-harness** - a tool that controls other harnesses:

```
MCP Host → Reins → Claude Code CLI → Code Execution
           (harness)   (another harness)
```

**Reins IS a harness.** It's not just a bridge - it actively orchestrates and controls Claude Code, exposing its capabilities through MCP.

### Why "Reins"?

Just as a driver holds the **reins** to control a horse, an mcp-capable agent can hold the reins to control another agent.

The name reflects:
1. **Control** - You hold the reins, you control the output
2. **Orchestration** - Multiple harnesses, one controller
3. **Meta-layer** - A harness that harnesses harnesses

### What Reins Does

| MCP Host | Reins | Claude Code |
|----------|-------|-------------|
| Connects to | Orchestrates | Runs code |
| Sends prompts | Manages sessions | Executes tools |
| Receives results | Controls permissions | Modifies files |

## Installation

```bash
npm install -g @srozov/reins
```

## Usage

### As MCP Server (stdio)

```bash
reins
```

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "reins": {
      "command": "reins"
    }
  }
}
```

Or without global install:

```json
{
  "mcpServers": {
    "reins": {
      "command": "npx",
      "args": ["-y", "@srozov/reins"]
    }
  }
}
```

### Programmatic API

```typescript
import { createReins } from "@srozov/reins";

const reins = await createReins({
  sessionsDir: "~/.claude/sessions",
  defaultMode: "plan",
});

// Start a session
const session = await reins.start({
  workdir: "/projects/my-app",
  mode: "plan",
  prompt: "Implement a login feature",
});

// Send messages
const response = await reins.send(session.sessionId, "Also add JWT support");

// Approve execution
await reins.approve(session.sessionId, "Looks good!");

// Read transcript
const state = await reins.read(session.sessionId);
console.log(state.transcript);

// List all sessions
const sessions = await reins.list();

// Kill when done
await reins.kill(session.sessionId);
```

## MCP Tools

### `reins_session_start`

Start a new Claude Code session.

**Input:**
```json
{
  "workdir": "/projects/my-app",
  "mode": "plan",
  "prompt": "Implement a login feature with JWT authentication",
  "model": "sonnet",
  "timeoutSeconds": 300,
  "claudeArgs": ["--dangerously-skip-permissions"]
}
```

**Parameter Details:**
- `workdir` (required): Working directory for the session
- `mode` (optional): Permission mode - `plan` (default), `auto`, `full`
- `prompt` (required): Initial message to send to Claude
- `model` (optional): Model to use - `sonnet`, `haiku`, `opus`
- `timeoutSeconds` (optional): Timeout in seconds (default: 60)
- `claudeArgs` (optional): Custom CLI arguments for Claude Code

**Output:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "mode": "plan",
  "status": "active"
}
```

### `reins_session_send`

Send a message to an existing session.

**Input:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Change the token expiration to 24 hours",
  "claudeArgs": ["--model", "opus"]
}
```

**Parameter Details:**
- `sessionId` (required): Session ID to resume
- `message` (required): Message to send
- `claudeArgs` (optional): Override CLI defaults (rarely needed for resume)

**Output:**
```json
{
  "response": "I've updated the token expiration...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `reins_session_approve`

Approve a plan-mode session to execute code.

**Input:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "corrections": "Use bcrypt instead of SHA256",
  "claudeArgs": ["--model", "opus"]
}
```

**Output:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "mode": "auto",
  "status": "approved"
}
```

### `reins_session_read`

Read session transcript with optional limit.

**Input:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "limit": 10
}
```

**Parameter Details:**
- `sessionId` (required): Session ID to read
- `limit` (optional): Return only the last N messages. Useful for long sessions.

**Output:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "transcript": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2026-02-05T10:30:00Z"
    }
  ],
  "fileChanges": ["/path/to/file1.ts"],
  "totalMessages": 45
}
```

### `reins_session_kill`

Terminate a session.

**Input:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "killed"
}
```

### `reins_session_list`

List all sessions.

**Input:**
```json
{}
```

**Output:**
```json
{
  "sessions": [
    {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "workdir": "/projects/my-app",
      "mode": "auto",
      "lastActive": "2026-02-05T10:30:00Z"
    }
  ]
}
```

## Claude Code CLI Limitations

Certain features are not available via the Claude Code CLI:

| Feature | Claude Code Support | Reins Support |
|---------|-------------------|---------------|
| Rewind session | Interactive only (`/rewind`) | ❌ No CLI flag |
| Switch to plan mode | ❌ Not supported | ❌ Not supported |
| Switch to auto mode | Only via approval | ✅ `reins_session_approve` |
| Fork session | `--fork-session` flag | ✅ Via `claudeArgs` |

### Workarounds

**Rewind:** Resume an older session ID instead of rewinding:
```json
{
  "sessionId": "older-session-id"
}
```

**Fork:** Use `--fork-session` to create a copy:
```json
{
  "sessionId": "550e8400-...",
  "claudeArgs": ["--fork-session"]
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Host                                  │
│              (OpenClaw, Cursor, Claude Desktop)                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP Protocol
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Reins                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MCP Server                                             │   │
│  │  - Tool registration                                    │   │
│  │  - Request/response handling                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Session Manager                                        │   │
│  │  - Create/resume/kill sessions                         │   │
│  │  - Permission control                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Claude Code Adapter                                    │   │
│  │  - CLI argument construction                           │   │
│  │  - Output parsing                                       │   │
│  │  - Session resumption                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ stdio (subprocess)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code CLI                                 │
│              (The harness being controlled)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight

Reins doesn't manage sessions itself - it **leverages Claude Code's native session management** via `--resume`. Sessions persist in `~/.claude/projects/<path>/<sessionId>.jsonl` and can be resumed directly by Claude Code outside of Reins.

## Transports

### Currently Supported

**stdio** (default)
```bash
npx @srozov/reins
```
- Standard input/output transport
- Works in all environments (local, container, CI/CD)
- Recommended for MCP integrations

### Planned (Future)

**HTTP**
```bash
npx @srozov/reins --transport http --port 3000
```
- REST API endpoints for session management
- Useful for remote process spawning
- Requires additional security (authentication, TLS)

**WebSocket**
```bash
npx @srozov/reins --transport websocket --port 3001
```
- Bidirectional real-time communication
- Enables multi-client connections
- Requires `ws` package

---
## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Install globally (run after build)
npm install -g . --force

# Watch mode
npm run watch

# Type check
npm run type-check
```

## License

MIT
