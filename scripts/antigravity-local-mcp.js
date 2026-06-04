#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const pluginRoot = path.resolve(__dirname, "..");
const helperScript = path.join(pluginRoot, "scripts", "antigravity.ps1");

const tools = [
  {
    name: "quick",
    description: "Preferred first call. Compact setup, live UI, and model-limit summary in one low-token report.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "setup",
    description: "Verify Antigravity 2.0 local setup readiness: install path, runtime, Node.js, DevTools, and model-limit API.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "doctor",
    description: "Alias for setup. Diagnose whether the local Antigravity bridge is ready.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "status",
    description: "Report whether Antigravity is installed/running and the current DevTools port.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "open",
    description: "Open Antigravity 2.0 if it is installed and not already running.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "repair-live",
    description: "Restart Antigravity and wait for an inspectable DevTools page when live UI control is not ready.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "inspect",
    description: "Inspect local Antigravity integration details, bundled helpers, and known binaries.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "live",
    description: "Report the live Chromium DevTools connection and page list for UI inspection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "limits-summary",
    description: "Preferred quota check. Compact model availability summary without dumping full per-model JSON.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "limits",
    description: "Read full Antigravity model quota/limit state from the local language server. Use limits-summary first to save tokens.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "models",
    description: "Alias for limits. Read Antigravity model quota/limit state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "privacy",
    description: "Scan this plugin repository for obvious sensitive data before publishing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "handoff-template",
    description: "Generate a compact Antigravity offload prompt without reading files or using DevTools UI tokens.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Antigravity." },
        workspace: { type: "string", description: "Local workspace path or project name." },
        statusFile: { type: "string", description: "Small artifact Antigravity should write.", default: "notes/antigravity-status.md" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write a compact status checkpoint." },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
  {
    name: "offload-advice",
    description: "Cheap decision gate for whether Codex should offload a task to Antigravity or answer/act directly.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "User task or intended Antigravity handoff." },
        hasWorkspaceWork: { type: "boolean", description: "Whether the task needs local project files, diffs, logs, or long workspace inspection.", default: false },
        estimatedCodexInputTokens: { type: "number", description: "Rough Codex tokens needed if handled directly.", default: 0 },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
];

function sendMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function runHelper(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helperScript, command],
      { windowsHide: true }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `antigravity.ps1 ${command} exited with code ${code}`));
        return;
      }

      const text = stdout.trim();
      if (!text) {
        resolve("");
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(text);
      }
    });
  });
}

function buildHandoffTemplate(args = {}) {
  const goal = String(args.goal || "<goal>").trim();
  const workspace = String(args.workspace || "<workspace/path>").trim();
  const statusFile = String(args.statusFile || "notes/antigravity-status.md").trim();
  const nextStep = String(args.nextStep || "Inspect the relevant files and write a compact status checkpoint.").trim();

  return [
    "Use this as a compact Antigravity offload handoff:",
    "",
    "```text",
    `Goal: ${goal}`,
    `Workspace: ${workspace}`,
    "Constraints: inspect files locally; do not paste full files, full logs, or full source; use search before reading whole files.",
    `Token rule: work token-efficiently; write progress to ${statusFile}; output max 10 bullets plus changed file list.`,
    `Next step: ${nextStep}`,
    "If blocked: ask one concise question; otherwise continue autonomously.",
    "```",
    "",
    "Codex follow-up rule: do not read the full Antigravity chat. Read only the status artifact, targeted diffs, or a compact visible UI status.",
  ].join("\n");
}

function buildOffloadAdvice(args = {}) {
  const goal = String(args.goal || "").trim();
  const hasWorkspaceWork = Boolean(args.hasWorkspaceWork);
  const estimatedCodexInputTokens = Number(args.estimatedCodexInputTokens || 0);
  const lowerGoal = goal.toLowerCase();
  const trivialPattern = /\b(2\s*\+\s*2|add\s+2\s*\+\s*2|what\s+is|time|date|summari[sz]e\s+this\s+short|one\s+line|yes\s+or\s+no)\b/;
  const workspacePattern = /\b(repo|workspace|project|files?|diff|logs?|tests?|build|lint|implement|refactor|debug|apply|continue\s+chat|job\s+search|browser|ui)\b/;

  const trivial = trivialPattern.test(lowerGoal) || (!hasWorkspaceWork && estimatedCodexInputTokens > 0 && estimatedCodexInputTokens < 400);
  const workspaceLikely = hasWorkspaceWork || workspacePattern.test(lowerGoal) || estimatedCodexInputTokens >= 2000;
  const shouldOffload = workspaceLikely && !trivial;

  const decision = shouldOffload ? "offload-to-antigravity" : "codex-direct";
  const reason = shouldOffload
    ? "The task appears to benefit from Antigravity inspecting the local workspace or running longer reasoning while Codex reads back a compact artifact."
    : "The task is small enough that DevTools navigation, project context scanning, and Antigravity startup/agent overhead will likely cost more time and tokens than Codex answering directly.";

  return [
    `Decision: ${decision}`,
    `Reason: ${reason}`,
    "",
    "Rules:",
    "- Use Codex direct for arithmetic, short factual answers, tiny commands, and small summaries.",
    "- Use Antigravity for long workspace tasks, UI/project continuation, job-search/application work, debugging, implementation, and analysis that would require Codex to read large files or logs.",
    "- In existing project chats, assume Antigravity may scan attached folders. For small tests, use a blank/no-workspace chat when available or do not offload.",
    "- If Antigravity unexpectedly starts broad folder exploration for a small task, cancel and report that offload is not token-efficient.",
    "- When offloading, send a compact handoff and ask Antigravity to write a small status artifact; Codex should read only that artifact or a targeted diff.",
  ].join("\n");
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "antigravity-local", version: "0.1.0" },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    sendResult(id, { tools });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const tool = tools.find((entry) => entry.name === name);
    if (!tool) {
      sendError(id, -32602, `Unknown tool: ${name}`);
      return;
    }

    try {
      if (name === "handoff-template") {
        const text = buildHandoffTemplate(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "offload-advice") {
        const text = buildOffloadAdvice(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      const command = name === "models" ? "limits" : name;
      const result = await runHelper(command);
      sendResult(id, {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error) {
      sendError(id, -32000, error?.message || String(error));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const headers = buffer.slice(0, headerEnd).toString("utf8");
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(match[1], 10);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) {
      return;
    }

    const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
    buffer = buffer.slice(messageEnd);

    try {
      const message = JSON.parse(payload);
      handleRequest(message).catch((error) => {
        if (message.id !== undefined) {
          sendError(message.id, -32000, error?.message || String(error));
        }
      });
    } catch (error) {
      sendError(null, -32700, error?.message || "Parse error");
    }
  }
});
