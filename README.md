# Antigravity 2.0 Codex Plugin

Created by [comprono](https://github.com/comprono).

This is a local Codex plugin that helps Codex connect to the Antigravity 2.0 desktop app on Windows. It can open Antigravity, inspect whether it is running, discover the Chromium DevTools endpoint exposed by the Electron app, inspect visible projects and chats, verify the visible model, and hand off continuation prompts into an existing Antigravity conversation.

## What It Does

- Launches the local Antigravity desktop app.
- Reports install path, user data path, running process IDs, and DevTools port.
- Connects to Antigravity's bundled `chrome-devtools-mcp` server when available.
- Helps Codex inspect visible project/chat context from the live UI.
- Supports safe chat handoff after verifying the target project, conversation, and model.

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

## Safety

This plugin operates only on the local machine and local Antigravity profile. It does not patch Antigravity internals. Treat Antigravity user data, settings, chats, and workspace files as user-owned state.

## License

MIT
