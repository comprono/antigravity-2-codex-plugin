# Changelog

## Unreleased

- Hardened selected-chat verification so `expectedChat` must match the active Antigravity document title before model switching or submission.
- Hardened prompt submission verification so jobs are marked `submit_failed` unless Antigravity actually accepts the prompt.
- Captured DevTools/no-page submission exceptions into `status.json` instead of leaving bridge jobs stuck in `queued`.
- Added `flash-high` model preference for Gemini 3.5 Flash High routing.
- Made `antigravity-devtools` startup passive so opening Codex no longer opens, closes, restarts, or repairs Antigravity unless the user explicitly asks to use it.
- Added durable bridge job tools: `create-job`, `submit-job`, `list-jobs`, `read-job`, `cancel-job`, and `retry-job`.
- Added the `.antigravity-bridge/jobs/<jobId>/` artifact contract for `request.md`, `status.json`, `result.md`, `changed-files.txt`, `diff.patch`, and `test-output-summary.md`.
- Added `switch-model` MCP/PowerShell helper to move the active Antigravity chat to an available cost-saving model such as Gemini 3.5 Flash Medium.
- Updated `submit-offload` to run a model gate by default and refuse submission if the requested/available model cannot be verified.

## 0.1.0 - 2026-06-03

- Initial public release of the Google Antigravity Codex Plugin.
- Added a local Antigravity 2.0 Codex bridge for Windows.
- Added MCP server entries for local setup/status/model-limit tools and DevTools-driven Antigravity UI work.
- Added PowerShell helper commands for setup checks, app launch, live readiness, model quota summaries, and privacy scanning.
- Added documentation for safe local handoff from OpenAI Codex to a visible Antigravity desktop session.
