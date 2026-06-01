---
name: antigravity-2
description: Connect Codex to a local Antigravity 2.0 desktop app for setup checks, model limits, live project/chat inspection, project creation, chat creation, and safe conversation handoff.
---

# Antigravity 2.0

Use this skill when the user asks Codex to connect to, set up, inspect, compare, or automate the local Antigravity 2.0 desktop app.

Core jobs:

- Set up or verify the plugin on another Windows machine.
- Open Antigravity and report install/runtime status.
- Read model quota and AI credit state from Antigravity's local language server.
- Inspect what is happening live in Antigravity.
- See projects and chats through the live UI.
- Continue an existing chat after verifying the selected project, conversation, and model.
- Start a new chat in an existing project.
- Start a new project and then start a chat there.
- Report quota, model, UI, or submission errors without repeatedly retrying.

## MCP Tool Surfaces

This plugin exposes two MCP servers:

- `antigravity-local`: direct tools for `setup`, `doctor`, `status`, `open`, `inspect`, `live`, `limits`, `models`, and `privacy`.
- `antigravity-devtools`: Chromium DevTools controls for inspecting and driving the Antigravity UI.

Prefer `antigravity-local` for setup, readiness, status, and model limits. Prefer `antigravity-devtools` for seeing projects/chats, continuing chats, starting new chats, and starting new projects. If this skill file cannot be read in a Codex session, the MCP tools are still enough: call `setup`, then `limits`, then use DevTools for live UI work.

## Requirements

- Windows desktop environment.
- Antigravity installed at the standard per-user location: `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe`.
- Antigravity user data at: `%APPDATA%\Antigravity`.
- Plugin installed at: `%USERPROFILE%\plugins\antigravity-2`.
- Node.js available on `PATH` when using the bundled `chrome-devtools-mcp` bridge.

The helper scripts compute `%LOCALAPPDATA%`, `%APPDATA%`, and `%USERPROFILE%` at runtime. Do not hardcode another user's home directory, ports, project names, chats, email addresses, or runtime tokens.

## First-Run Setup

After a user clones the GitHub repo into `%USERPROFILE%\plugins\antigravity-2`, run:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" setup
```

Use the setup report to decide the next step:

- If `Installed` is false, ask the user to install Antigravity or provide its install path.
- If `Node.Found` is false, install or expose Node.js on `PATH` before using the DevTools bridge.
- If `AntigravityRunning` is false, run the `open` command.
- If `ReadyForModelLimits` is false after opening Antigravity, wait a few seconds and rerun `setup`.
- If `ReadyForLiveUiInspection` is false, verify `DevToolsActivePort` and use the Browser/Computer Use fallback only if DevTools cannot connect.

## Helper Commands

Check status:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" status
```

Open Antigravity:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" open
```

Inspect integration details:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" inspect
```

Inspect the live DevTools connection:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" live
```

Report model limits:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" models
```

`limits` is an alias for `models`.

Run the public-repo privacy scanner:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" privacy
```

## Model Limits

Use `models` or `limits` for model quota checks. The helper discovers the running Antigravity `language_server.exe`, reads its CSRF token from the local process command line, finds its local HTTPS gRPC-web port, and calls:

- `exa.language_server_pb.LanguageServerService/GetAvailableModels`
- `exa.language_server_pb.LanguageServerService/GetLoadCodeAssist`

This is the same local language-server surface the Antigravity Models tab uses. It returns per-model quota fraction/reset metadata and AI credit tier data when Antigravity exposes it. It is not a raw all-model token ledger unless Antigravity exposes one through these responses.

Do not parse old chats, task transcripts, or logs for model limits except as supporting evidence after the language-server path fails.

## Live UI Inspection

For project and chat work, the live UI is the source of truth.

Preferred path:

1. Run `setup` or `live` to confirm DevTools readiness.
2. Use the plugin MCP server `antigravity-devtools` when available. It starts Antigravity's bundled `chrome-devtools-mcp` and connects through `DevToolsActivePort`.
3. Inspect the visible UI text and interactive elements through DevTools.
4. Confirm the project, conversation, composer state, and selected model before sending a message.

Manual DevTools endpoint check:

```powershell
$port = (Get-Content "$env:APPDATA\Antigravity\DevToolsActivePort")[0]
Invoke-RestMethod "http://127.0.0.1:$port/json/list"
```

If DevTools cannot interact with a native dialog or OS-level control, use the Computer Use plugin as a fallback.

## Project And Chat Workflows

### See Chats In Projects

Use DevTools to inspect the live Antigravity project list, selected project, conversation list, and conversation titles. If the UI has a project or conversation search control, use it rather than reading private storage first.

Storage under `%APPDATA%\Antigravity\User` can support investigation, but live UI remains authoritative.

### Continue An Existing Chat

Before submitting:

- Verify the intended project is selected.
- Verify the intended conversation title or visible context.
- Verify the intended model in the composer.
- Verify the composer is idle and not already streaming.
- Check `models` if the user asks about limits or if a quota warning is visible.

Then paste the user's instruction into the composer and submit it. Report whether Antigravity accepted the message, started working, requested confirmation, or showed a quota/error state.

### Start A New Chat In An Existing Project

Before submitting:

- Select or search for the existing project.
- Use the UI control for a new chat/conversation.
- Verify the new composer belongs to that project.
- Verify the selected model.

Then submit the user's initial prompt. Report the new conversation title or visible identifier if Antigravity shows one.

### Start A New Project

Before creating:

- Ask for a project name only if the user's intended name cannot be inferred.
- Use the visible Antigravity project creation flow.
- Select local folders/workspaces only when the user explicitly requests those paths or they are already visible and clearly intended.
- Avoid broad filesystem access without explicit user instruction.

After creation, verify the project is selected, then start a chat if requested.

### Tell What Is Happening Live

Inspect the active page text and state through DevTools. Summarize:

- selected project,
- selected conversation,
- selected model,
- whether the agent is idle, working, waiting for approval, or blocked,
- visible quota/errors,
- last visible meaningful action.

Do not expose unrelated private chat content unless the user asked for that specific context.

## Public Plugin Hygiene

Before committing or publishing:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" privacy
git diff --check
```

Also run a local targeted scan for any private terms the current user mentions. Do not commit names, emails, project names, runtime ports, CSRF tokens, OAuth tokens, cookies, logs, screenshots, or Antigravity user data.

## Boundaries

- This plugin is a local bridge, not a cloud service.
- It does not patch Antigravity internals.
- It does not commit runtime language-server tokens.
- It does not bypass Antigravity quota, billing, authentication, or safety controls.
- It should not read sensitive files, credentials, browser cookies, or private chat contents unless the user asks for that specific context.
- If Antigravity reports quota limits, do not keep resubmitting. Report the reset time and prepare the next action plan.
