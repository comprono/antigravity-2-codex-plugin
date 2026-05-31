---
name: antigravity-2
description: Connect Codex to a local Antigravity 2.0 desktop app for launch, status checks, project/chat inspection, and safe conversation handoff.
---

# Antigravity 2.0

Use this skill when the user asks Codex to connect to, open, inspect, compare, or automate the Antigravity 2.0 desktop app installed locally. The most useful jobs are:

- Open Antigravity from Codex.
- Check whether Antigravity is installed and running.
- Inspect visible Antigravity projects and conversations.
- Verify the visible chat model before handing off work.
- Post a continuation instruction into an existing Antigravity chat.
- Use the Chromium DevTools endpoint for app-level inspection when Antigravity exposes one.

## Requirements

- Windows desktop environment.
- Antigravity installed at the standard per-user location: `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe`.
- Antigravity user data at: `%APPDATA%\Antigravity`.
- Node.js available on `PATH` when using the bundled `chrome-devtools-mcp` bridge.
- Helper script: `%USERPROFILE%\plugins\antigravity-2\scripts\antigravity.ps1`.

The helper scripts compute `%LOCALAPPDATA%`, `%APPDATA%`, and `%USERPROFILE%` at runtime. Do not hardcode another user's home directory when adapting the workflow.

## Workflow

1. Check status before assuming the app is running.

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" status
```

The status output reports:

- `Installed`
- `ExePath`
- `UserDataPath`
- `Running`
- `ProcessIds`
- `DevToolsPort`

2. Open the installed desktop app when requested.

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" open
```

3. Inspect local integration hints.

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\plugins\antigravity-2\scripts\antigravity.ps1" inspect
```

The inspect output reports the Antigravity install root, user data path, current DevTools port, bundled `chrome-devtools-mcp` package, and known Antigravity binaries.

4. For Codex-to-Antigravity UI inspection, use the plugin MCP server `antigravity-devtools` when available. It starts `chrome-devtools-mcp` from Antigravity's bundled dependencies and connects to the running Electron window through `DevToolsActivePort`.

5. If the user asks for the open project or chat context, inspect the live Antigravity page through DevTools or Playwright-over-CDP:

```powershell
$port = (Get-Content "$env:APPDATA\Antigravity\DevToolsActivePort")[0]
Invoke-RestMethod "http://127.0.0.1:$port/json/list"
```

Then connect to the page WebSocket or use Playwright CDP to read the visible body text. Confirm the project name, conversation title, and model from the live UI instead of guessing from storage alone.

6. If the user asks to continue a visible Antigravity chat, first verify:

- The intended project is visible.
- The intended conversation is visible or selected.
- The requested model is visible in the composer area.
- The instruction will be pasted into the correct chat.

After verification, post the user's instruction into the composer and submit it. Report whether Antigravity accepted the message, started working, or showed a quota/error state.

7. If OS-level clicks or native window management are needed, use the Computer Use plugin. DevTools automation can inspect and interact with Chromium-rendered UI, but it does not replace Windows desktop control.

## Storage Inspection

Antigravity stores useful state under `%APPDATA%\Antigravity\User`.

Useful locations:

- `%APPDATA%\Antigravity\User\globalStorage\storage.json`
- `%APPDATA%\Antigravity\User\workspaceStorage`
- `%APPDATA%\Antigravity\User\globalStorage\kilocode.kilo-code\tasks`

Use storage only as supporting evidence. The live UI is the source of truth for the currently selected project, conversation, and model.

## Public Plugin Notes

This plugin is intentionally a local bridge, not a cloud service. People who install it should expect it to operate only on their own machine and their own Antigravity app profile.

When adapting it for another user:

- Keep the plugin folder name as `antigravity-2` unless creating a fork.
- Replace personal marketplace metadata only if publishing under a different author.
- Keep scripts based on environment variables, not fixed user paths.
- Validate the plugin after changes with the plugin-creator validator.

## Boundaries

- This plugin does not replace Antigravity internals or patch the app.
- Treat Antigravity settings, local storage, and user data as user-owned state. Do not delete or rewrite them unless the user explicitly asks.
- Do not read sensitive files, credentials, browser cookies, or private chat contents unless the user asks for that specific context.
- If adding deeper automation later, prefer a small local MCP server that wraps stable public surfaces: a CLI if one exists, a documented local API, or verified DevTools endpoints.

## Troubleshooting

- If `Installed` is false, ask the user to confirm where Antigravity is installed.
- If `Running` is false, run the `open` command.
- If `DevToolsPort` is empty, Antigravity may not have exposed a debug endpoint yet. Reopen the app and check `%APPDATA%\Antigravity\DevToolsActivePort`.
- If DevTools connection fails, verify `http://127.0.0.1:<port>/json/version`.
- If the chat does not submit, inspect whether the composer is a textarea, contenteditable element, or custom role textbox.
- If Antigravity reports quota limits, do not keep resubmitting. Report the reset time and prepare the next action plan.
