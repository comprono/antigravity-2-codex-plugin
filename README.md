# Antigravity 2.0 Codex Plugin

Created by [comprono](https://github.com/comprono).

This is a local Codex plugin that helps Codex connect to the Antigravity 2.0 desktop app on Windows. It can open Antigravity, inspect whether it is running, discover the Chromium DevTools endpoint exposed by the Electron app, read model quota state from the local language server, inspect visible projects and chats, verify the visible model, and hand off prompts into Antigravity conversations.

## What It Does

- Launches the local Antigravity desktop app.
- Reports install path, user data path, running process IDs, setup readiness, and DevTools port.
- Reports Antigravity model quota state from the local language server.
- Connects to Antigravity's bundled `chrome-devtools-mcp` server when available.
- Exposes local setup/model/status commands as MCP tools, so Codex can use them even when skill files are unavailable.
- Helps Codex inspect live project/chat context from the UI.
- Supports safe handoff to continue an existing chat, start a new chat in an existing project, or start a new project.
- Provides a local privacy scan for sensitive data before publishing changes.

## Requirements

- Windows.
- Antigravity installed at `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe`.
- Codex plugins loaded from `%USERPROFILE%\plugins`.
- Node.js available on `PATH` for the DevTools MCP bridge.

## Install

Clone this repository into your Codex plugins directory:

```powershell
git clone https://github.com/comprono/antigravity-2-codex-plugin.git "$env:USERPROFILE\plugins\antigravity-2"
```

Then install or refresh the plugin from your Codex personal marketplace.

For a setup check after cloning:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" setup
```

The setup report tells Codex whether Antigravity is installed, whether Node.js is available, whether the bundled DevTools MCP package exists, whether the DevTools endpoint is reachable, and whether the local language-server model-limit API is ready.

## MCP Tools

The plugin registers two MCP servers:

- `antigravity-local`: direct local tools for `setup`, `doctor`, `status`, `open`, `inspect`, `live`, `limits`, `models`, and `privacy`.
- `antigravity-devtools`: Chromium DevTools controls for inspecting and driving the Antigravity UI.

Codex should use `antigravity-local` for setup and model limits, then use `antigravity-devtools` for live project/chat UI work. This keeps the plugin useful even if a session cannot read the skill documentation.

## Usage

Check status:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" status
```

Open Antigravity:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" open
```

Inspect integration details:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" inspect
```

Inspect live UI connection:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" live
```

Report model quota state:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" models
```

The `models` command calls Antigravity's local language server over its gRPC-web API (`LanguageServerService/GetAvailableModels` and `GetLoadCodeAssist`). This is the same source the Antigravity Models tab uses. It returns per-model quota metadata such as remaining fraction and reset time when available. It does not expose a raw all-model token ledger if Antigravity itself does not publish one.

Run a local repository privacy scan:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\antigravity-2\scripts\antigravity.ps1" privacy
```

## Codex Operating Model

This plugin intentionally combines two local surfaces:

- Stable status and model-limit checks use local helper commands and Antigravity's local language server.
- Project/chat actions use the live Antigravity UI through the `antigravity-devtools` MCP bridge, because the UI is the source of truth for selected projects, selected conversations, composer state, and model selection.

For chat actions, Codex should verify the target project, conversation, and selected model before sending anything. For new projects or new chats, Codex should use the visible Antigravity controls through DevTools automation and report whether Antigravity accepted the action or showed an error/quota state.

## Safety

This plugin operates only on the local machine and local Antigravity profile. It does not patch Antigravity internals, commit runtime tokens, or call Antigravity cloud APIs directly. Treat Antigravity user data, settings, chats, and workspace files as user-owned state.

Before publishing changes, run:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\antigravity.ps1" privacy
```

## License

MIT
