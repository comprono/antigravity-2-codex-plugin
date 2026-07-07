#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const pluginRoot = path.resolve(__dirname, "..");
const helperScript = path.join(pluginRoot, "scripts", "antigravity.ps1");
const devToolsPortFile = path.join(process.env.APPDATA || "", "Antigravity", "DevToolsActivePort");

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
    name: "devtools-health",
    description: "Low-token fallback for antigravity-devtools transport errors. Reports live pages and the recommended recovery step.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submission-guide",
    description: "Compact guidance for reliably submitting Antigravity chat prompts through DevTools without invalid key names.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "prepare-offload",
    description: "Default first call for nontrivial work. Decide offload, check live/model readiness, generate the compact handoff, and give submit instructions.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Antigravity." },
        workspace: { type: "string", description: "Local workspace path or Antigravity project name." },
        statusFile: { type: "string", description: "Small artifact Antigravity should write.", default: "notes/antigravity-status.md" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write a compact status checkpoint." },
        hasWorkspaceWork: { type: "boolean", description: "Whether the task needs files, diffs, logs, browser state, or project context.", default: true },
        estimatedCodexInputTokens: { type: "number", description: "Rough Codex tokens needed if handled directly.", default: 2000 },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
  {
    name: "create-job",
    description: "Create a durable Antigravity bridge job folder with request/status/result/diff artifact files. Does not touch the UI.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Antigravity." },
        workspace: { type: "string", description: "Local workspace path where .antigravity-bridge/jobs will be created." },
        mode: { type: "string", description: "fast, deep, review, or patch.", default: "fast" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write compact artifacts." },
      },
      required: ["goal", "workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "submit-job",
    description: "Create a durable job folder, then submit the standardized artifact handoff into the selected Antigravity chat.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Antigravity." },
        workspace: { type: "string", description: "Local workspace path where .antigravity-bridge/jobs will be created." },
        mode: { type: "string", description: "fast, deep, review, or patch.", default: "fast" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write compact artifacts." },
        expectedProject: { type: "string", description: "Optional visible project text that must be present before submit." },
        expectedChat: { type: "string", description: "Optional visible chat/conversation text that must be present before submit." },
        modelPreference: { type: "string", description: "auto, flash-high, flash-medium, flash, best-available, or exact visible model name.", default: "auto" },
        submit: { type: "boolean", description: "Set true to fill and submit the job handoff.", default: true },
      },
      required: ["goal", "workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "claude-status",
    description: "Report whether local Claude Code CLI is installed and usable for headless bridge jobs. Does not start a job.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit-claude-job",
    description: "Create a durable bridge job and run local Claude Code headlessly against the workspace, writing the same compact artifacts Codex can read later.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Claude Code." },
        workspace: { type: "string", description: "Local workspace path where .antigravity-bridge/jobs will be created." },
        mode: { type: "string", description: "fast, deep, review, or patch.", default: "fast" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write compact artifacts." },
        model: { type: "string", description: "Claude Code model alias or id, such as sonnet or opus.", default: "sonnet" },
        fallbackModel: { type: "string", description: "Optional Claude Code fallback model alias or id." },
        permissionMode: { type: "string", description: "Claude Code permission mode. Defaults to plan for review and acceptEdits otherwise." },
        maxBudgetUsd: { type: "number", description: "Optional Claude Code maximum spend for this job." },
        start: { type: "boolean", description: "Set false to create the job and payload without starting Claude Code.", default: true },
        maxMinutes: { type: "number", description: "Maximum minutes the background Claude worker may run.", default: 30 },
      },
      required: ["goal", "workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "list-jobs",
    description: "List durable Antigravity bridge jobs from a workspace without reading chats or logs.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Local workspace path containing .antigravity-bridge/jobs." },
        limit: { type: "number", description: "Maximum jobs to return.", default: 10 },
      },
      required: ["workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "read-job",
    description: "Read only compact result artifacts for one Antigravity bridge job.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Local workspace path containing .antigravity-bridge/jobs." },
        jobId: { type: "string", description: "Job id. Use latest to read the newest job.", default: "latest" },
      },
      required: ["workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel-job",
    description: "Mark a durable Antigravity bridge job cancelled. This does not stop a running Antigravity UI task.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Local workspace path containing .antigravity-bridge/jobs." },
        jobId: { type: "string", description: "Job id. Use latest to cancel the newest job.", default: "latest" },
        reason: { type: "string", description: "Short cancellation reason.", default: "Cancelled by Codex." },
      },
      required: ["workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "retry-job",
    description: "Resubmit an existing durable job request to the selected Antigravity chat.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Local workspace path containing .antigravity-bridge/jobs." },
        jobId: { type: "string", description: "Job id. Use latest to retry the newest job.", default: "latest" },
        expectedProject: { type: "string", description: "Optional visible project text that must be present before submit." },
        expectedChat: { type: "string", description: "Optional visible chat/conversation text that must be present before submit." },
        modelPreference: { type: "string", description: "auto, flash-high, flash-medium, flash, best-available, or exact visible model name.", default: "auto" },
        submit: { type: "boolean", description: "Set true to fill and submit the job handoff.", default: true },
      },
      required: ["workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "submit-offload",
    description: "Fast path: prepare and submit a compact handoff into the currently selected Antigravity chat via direct CDP, avoiding repeated snapshots.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal for Antigravity." },
        workspace: { type: "string", description: "Local workspace path or Antigravity project name." },
        statusFile: { type: "string", description: "Small artifact Antigravity should write.", default: "notes/antigravity-status.md" },
        nextStep: { type: "string", description: "Specific next action.", default: "Inspect the relevant files and write a compact status checkpoint." },
        expectedProject: { type: "string", description: "Optional visible project text that must be present before submit." },
        expectedChat: { type: "string", description: "Optional visible chat/conversation text that must be present before submit." },
        modelPreference: { type: "string", description: "Model preference before submit. Use auto, flash-high, flash-medium, flash, best-available, or an exact visible model name.", default: "auto" },
        skipModelSwitch: { type: "boolean", description: "Set true only when the current model was just verified manually.", default: false },
        submit: { type: "boolean", description: "Set true to fill and click Send.", default: false },
        fillOnly: { type: "boolean", description: "Set true to fill the composer without clicking Send. Use only when the user wants a manual review before submit.", default: false },
      },
      required: ["goal", "submit"],
      additionalProperties: false,
    },
  },
  {
    name: "switch-model",
    description: "Switch the active Antigravity chat to an available model through the local CDP bridge. Use before offloads when Sonnet/Opus is exhausted or when the user asks for Flash.",
    inputSchema: {
      type: "object",
      properties: {
        modelPreference: { type: "string", description: "auto, flash-high, flash-medium, flash, best-available, or an exact visible model name.", default: "flash-medium" },
        expectedProject: { type: "string", description: "Optional visible project text that must be present before switching." },
        expectedChat: { type: "string", description: "Optional visible chat/conversation text that must be present before switching." },
      },
      additionalProperties: false,
    },
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

function getOffloadDecision(args = {}) {
  const goal = String(args.goal || "").trim();
  const hasWorkspaceWork = Boolean(args.hasWorkspaceWork);
  const estimatedCodexInputTokens = Number(args.estimatedCodexInputTokens || 0);
  const lowerGoal = goal.toLowerCase();
  const trivialPattern = /\b(2\s*\+\s*2|add\s+2\s*\+\s*2|what\s+is|time|date|summari[sz]e\s+this\s+short|one\s+line|yes\s+or\s+no)\b/;
  const workspacePattern = /\b(repo|workspace|project|files?|diff|logs?|tests?|build|lint|implement|refactor|debug|apply|continue\s+chat|job\s+search|browser|ui|analy[sz]e|review|plan|research|inspect|investigate|fix|patch|error|failure|trace|search|compare)\b/;

  const trivial = trivialPattern.test(lowerGoal) || (!hasWorkspaceWork && estimatedCodexInputTokens > 0 && estimatedCodexInputTokens < 400);
  const workspaceLikely = hasWorkspaceWork || workspacePattern.test(lowerGoal) || estimatedCodexInputTokens >= 800;
  const shouldOffload = workspaceLikely && !trivial;

  const decision = shouldOffload ? "offload-to-antigravity" : "codex-direct";
  const reason = shouldOffload
    ? "The task appears to benefit from Antigravity inspecting the local workspace or running longer reasoning while Codex reads back a compact artifact."
    : "The task is small enough that DevTools navigation, project context scanning, and Antigravity startup/agent overhead will likely cost more time and tokens than Codex answering directly.";

  return { decision, reason, shouldOffload };
}

function buildOffloadAdvice(args = {}) {
  const { decision, reason } = getOffloadDecision(args);
  return [
    `Decision: ${decision}`,
    `Reason: ${reason}`,
    "",
    "Rules:",
    "- Use Codex direct only for arithmetic, short factual answers, tiny commands, and small summaries.",
    "- Use Antigravity by default for nontrivial workspace tasks, UI/project continuation, job-search/application work, debugging, implementation, reviews, research, planning, and analysis that would make Codex read files or long output.",
    "- In existing project chats, assume Antigravity may scan attached folders. For small tests, use a blank/no-workspace chat when available or do not offload.",
    "- If Antigravity unexpectedly starts broad folder exploration for a small task, cancel and report that offload is not token-efficient.",
    "- When offloading, send a compact handoff and ask Antigravity to write a small status artifact; Codex should read only that artifact or a targeted diff.",
  ].join("\n");
}

function buildPrepareOffload(args = {}, quick = null) {
  const decision = getOffloadDecision(args);
  const handoff = buildHandoffTemplate(args).replace(/^Use this as a compact Antigravity offload handoff:\n\n/, "");
  const setup = quick?.Setup || {};
  const live = quick?.Live || {};
  const recommended = quick?.Limits?.RecommendedAvailable?.[0] || null;
  const readiness = [
    `Installed: ${setup.Installed === true}`,
    `Running: ${setup.Running === true}`,
    `LiveReady: ${setup.ReadyForLiveUiInspection === true}`,
    `PageCount: ${live.PageCount ?? "<unknown>"}`,
    `BestModel: ${recommended ? `${recommended.DisplayName || recommended.Id} (${recommended.RemainingPercent ?? "?"}% remaining)` : "<unknown>"}`,
  ].join("\n");

  const nextAction = decision.shouldOffload
    ? "First call antigravity-local.switch-model with modelPreference=auto or flash-medium. Then call submit-offload with submit=true. Avoid raw DevTools choreography unless the direct tools fail."
    : "Do not open or drive Antigravity for this task. Answer or act directly in Codex.";

  return [
    "FastAntigravityOffloadPlan:",
    `Decision: ${decision.decision}`,
    `Reason: ${decision.reason}`,
    "",
    "Readiness:",
    readiness,
    "",
    "NextAction:",
    nextAction,
    "",
    "SubmitRule:",
    "Fill/type the prompt without submitKey. Prefer clicking the visible Send/arrow button. If keyboard submit is required, use a separate simple Enter key call. Never use Control+Enter unless the active tool schema explicitly accepts it.",
    "",
    "CompactHandoff:",
    handoff,
  ].join("\n");
}

function getDevToolsPort() {
  if (!devToolsPortFile || !fs.existsSync(devToolsPortFile)) {
    throw new Error(`DevToolsActivePort not found at ${devToolsPortFile}`);
  }
  const firstLine = fs.readFileSync(devToolsPortFile, "utf8").split(/\r?\n/)[0]?.trim();
  if (!firstLine) {
    throw new Error("DevToolsActivePort exists but does not contain a port.");
  }
  return firstLine;
}

async function getAntigravityPage() {
  const port = getDevToolsPort();
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl)
    || pages.find((entry) => entry.webSocketDebuggerUrl);
  if (!page) {
    throw new Error(`No inspectable Antigravity page found on DevTools port ${port}.`);
  }
  return { port, page };
}

function createCdpClient(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Antigravity DevTools WebSocket.")), 5000);

    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((sendResolve, sendReject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              sendReject(new Error(`CDP command timed out: ${method}`));
            }, 10000);
            pending.set(id, { resolve: sendResolve, reject: sendReject, timer });
          });
        },
        close() {
          try {
            ws.close();
          } catch {
            // Ignore close races.
          }
        },
      });
    });

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message.id || !pending.has(message.id)) {
        return;
      }
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) {
        entry.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        entry.resolve(message.result);
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Failed to connect to Antigravity DevTools WebSocket."));
    });
  });
}

function jsString(value) {
  return JSON.stringify(String(value ?? ""));
}

function safeWorkspacePath(workspace) {
  const resolved = path.resolve(String(workspace || "").trim());
  if (!resolved || resolved === path.parse(resolved).root) {
    throw new Error("A concrete workspace path is required for Antigravity bridge jobs.");
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Workspace does not exist or is not a directory: ${resolved}`);
  }
  return resolved;
}

function jobsRootFor(workspace) {
  return path.join(safeWorkspacePath(workspace), ".antigravity-bridge", "jobs");
}

function utcStamp() {
  return new Date().toISOString();
}

function datePrefix(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nextJobId(workspace) {
  const root = jobsRootFor(workspace);
  fs.mkdirSync(root, { recursive: true });
  const prefix = datePrefix();
  const existing = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${prefix}-`))
    .map((entry) => Number.parseInt(entry.name.slice(prefix.length + 1), 10))
    .filter(Number.isFinite);
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function jobDirFor(workspace, jobId) {
  return path.join(jobsRootFor(workspace), jobId);
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function modeGuidance(mode) {
  const normalized = String(mode || "fast").trim().toLowerCase();
  if (normalized === "deep") {
    return "Deep mode: inspect related modules and prior patterns, run the strongest practical tests, and include risk notes.";
  }
  if (normalized === "review") {
    return "Review mode: inspect and report only; do not edit files.";
  }
  if (normalized === "patch") {
    return "Patch mode: make a narrow safe edit, run relevant verification, and produce a diff.";
  }
  return "Fast mode: inspect only directly relevant files, make the smallest safe change, and run targeted verification only.";
}

function artifactContract(jobId, jobDir) {
  return [
    `JobId: ${jobId}`,
    `JobFolder: ${jobDir}`,
    "Required artifacts:",
    "- status.json: state, currentStep, startedAt, updatedAt, blocker if any.",
    "- result.md: max 10 bullets with outcome, risk, and next step.",
    "- changed-files.txt: one changed path per line, or NONE.",
    "- diff.patch: compact patch/diff if files changed, or empty.",
    "- test-output-summary.md: commands run and pass/fail summary only.",
    "",
    "Do not paste full files, full logs, screenshots, or full chat transcripts.",
  ].join("\n");
}

function buildJobRequest(args, jobId, jobDir) {
  const goal = String(args.goal || "").trim();
  const workspace = safeWorkspacePath(args.workspace);
  const mode = String(args.mode || "fast").trim().toLowerCase();
  const nextStep = String(args.nextStep || "Inspect the relevant files and write compact artifacts.").trim();
  return [
    `# Antigravity Bridge Job ${jobId}`,
    "",
    `Goal: ${goal}`,
    `Workspace: ${workspace}`,
    `Mode: ${mode}`,
    "",
    modeGuidance(mode),
    "",
    `Next step: ${nextStep}`,
    "",
    artifactContract(jobId, jobDir),
    "",
    "Codex will read only result.md, changed-files.txt, diff.patch, test-output-summary.md, and status.json.",
  ].join("\n");
}

function createJob(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const jobId = nextJobId(workspace);
  const jobDir = jobDirFor(workspace, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const createdAt = utcStamp();
  const request = buildJobRequest({ ...args, workspace }, jobId, jobDir);
  const status = {
    jobId,
    state: "queued",
    worker: String(args.worker || "antigravity").trim(),
    mode: String(args.mode || "fast").trim().toLowerCase(),
    createdAt,
    updatedAt: createdAt,
    currentStep: "created",
    requestFile: "request.md",
    resultFile: "result.md",
    changedFilesFile: "changed-files.txt",
    diffFile: "diff.patch",
    testOutputSummaryFile: "test-output-summary.md",
  };
  fs.writeFileSync(path.join(jobDir, "request.md"), `${request}\n`, "utf8");
  writeJsonFile(path.join(jobDir, "status.json"), status);
  for (const file of ["result.md", "changed-files.txt", "diff.patch", "test-output-summary.md"]) {
    const target = path.join(jobDir, file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, "", "utf8");
  }
  return { workspace, jobId, jobDir, status, request };
}

function resolveJobId(workspace, jobId = "latest") {
  const root = jobsRootFor(workspace);
  if (!fs.existsSync(root)) {
    throw new Error(`No Antigravity bridge jobs found in ${root}`);
  }
  if (jobId && jobId !== "latest") {
    const dir = jobDirFor(workspace, jobId);
    if (!fs.existsSync(dir)) throw new Error(`Job not found: ${jobId}`);
    return jobId;
  }
  const jobs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!jobs.length) throw new Error(`No Antigravity bridge jobs found in ${root}`);
  return jobs[jobs.length - 1];
}

function summarizeFile(filePath, maxChars = 12000) {
  if (!fs.existsSync(filePath)) return "";
  const text = fs.readFileSync(filePath, "utf8");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function listJobs(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const root = jobsRootFor(workspace);
  const limit = Math.max(1, Math.min(100, Number(args.limit || 10)));
  if (!fs.existsSync(root)) {
    return `JobsRoot: ${root}\nCount: 0`;
  }
  const rows = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const status = readJsonFile(path.join(root, entry.name, "status.json"), {});
      return {
        jobId: entry.name,
        state: status.state || "unknown",
        mode: status.mode || "",
        updatedAt: status.updatedAt || "",
        currentStep: status.currentStep || "",
      };
    })
    .sort((a, b) => String(b.jobId).localeCompare(String(a.jobId)))
    .slice(0, limit);
  return [
    `JobsRoot: ${root}`,
    `Count: ${rows.length}`,
    ...rows.map((row) => `${row.jobId} | ${row.state} | ${row.mode} | ${row.updatedAt} | ${row.currentStep}`),
  ].join("\n");
}

function readJob(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const jobId = resolveJobId(workspace, args.jobId || "latest");
  const jobDir = jobDirFor(workspace, jobId);
  const status = summarizeFile(path.join(jobDir, "status.json"), 4000);
  const result = summarizeFile(path.join(jobDir, "result.md"), 8000);
  const changed = summarizeFile(path.join(jobDir, "changed-files.txt"), 4000);
  const tests = summarizeFile(path.join(jobDir, "test-output-summary.md"), 6000);
  const diff = summarizeFile(path.join(jobDir, "diff.patch"), 12000);
  return [
    `JobId: ${jobId}`,
    `JobFolder: ${jobDir}`,
    "",
    "status.json:",
    status || "{}",
    "",
    "result.md:",
    result || "<empty>",
    "",
    "changed-files.txt:",
    changed || "<empty>",
    "",
    "test-output-summary.md:",
    tests || "<empty>",
    "",
    "diff.patch:",
    diff || "<empty>",
  ].join("\n");
}

function cancelJob(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const jobId = resolveJobId(workspace, args.jobId || "latest");
  const jobDir = jobDirFor(workspace, jobId);
  const statusPath = path.join(jobDir, "status.json");
  const status = readJsonFile(statusPath, { jobId });
  status.state = "cancelled";
  status.updatedAt = utcStamp();
  status.currentStep = "cancelled";
  status.blocker = String(args.reason || "Cancelled by Codex.").trim();
  writeJsonFile(statusPath, status);
  return `CancelJobResult:\nJobId: ${jobId}\nState: cancelled\nNote: This marks the bridge job only; stop a live Antigravity UI run separately if needed.`;
}

function markJobSubmitted(workspace, jobId) {
  const statusPath = path.join(jobDirFor(workspace, jobId), "status.json");
  const status = readJsonFile(statusPath, { jobId });
  status.state = "submitted";
  status.updatedAt = utcStamp();
  status.currentStep = "submitted-to-antigravity";
  writeJsonFile(statusPath, status);
}

function markJobSubmitFailed(workspace, jobId, reason) {
  const statusPath = path.join(jobDirFor(workspace, jobId), "status.json");
  const status = readJsonFile(statusPath, { jobId });
  status.state = "submit_failed";
  status.updatedAt = utcStamp();
  status.currentStep = "submit-failed";
  status.blocker = String(reason || "Antigravity did not confirm prompt submission.").slice(0, 1000);
  writeJsonFile(statusPath, status);
}

function updateJobStatus(workspace, jobId, patch = {}) {
  const statusPath = path.join(jobDirFor(workspace, jobId), "status.json");
  const status = readJsonFile(statusPath, { jobId });
  writeJsonFile(statusPath, { ...status, ...patch, updatedAt: utcStamp() });
}

function truncateText(value, maxChars = 24000) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function safeClaudeFlag(value, name) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[A-Za-z0-9._:/@+-]+$/.test(text)) {
    throw new Error(`Unsafe Claude Code ${name} value. Use a simple model or mode id.`);
  }
  return text;
}

function runClaudeCli(command, args, options = {}) {
  const safeArgs = args.map((arg) => String(arg));
  if (process.platform === "win32") {
    const commandLine = [String(command), ...safeArgs].join(" ");
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", commandLine], {
      ...options,
      input: options.input || undefined,
      encoding: "utf8",
      timeout: options.timeout || 10000,
      windowsHide: true,
    });
  }
  return spawnSync(command, safeArgs, {
    ...options,
    encoding: "utf8",
    timeout: options.timeout || 10000,
    windowsHide: true,
  });
}

function commandExists(command) {
  const result = runClaudeCli(command, ["--version"], { timeout: 10000 });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error?.message || "",
  };
}

function findClaudeCode() {
  const candidates = [];
  if (process.platform === "win32") {
    const where = spawnSync("where.exe", ["claude"], { encoding: "utf8", timeout: 10000, windowsHide: true });
    for (const line of String(where.stdout || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) candidates.push(trimmed);
    }
    candidates.sort((a, b) => Number(!a.toLowerCase().endsWith(".cmd")) - Number(!b.toLowerCase().endsWith(".cmd")));
    candidates.push("claude.cmd", "claude");
  } else {
    candidates.push("claude");
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const check = commandExists(candidate);
    if (check.ok) {
      return { found: true, command: candidate, version: check.stdout || check.stderr };
    }
  }
  return { found: false, command: "", version: "", message: "Claude Code CLI was not found on PATH." };
}

function getClaudeStatusText() {
  const status = findClaudeCode();
  return [
    "ClaudeCodeStatus:",
    `Found: ${status.found}`,
    `Command: ${status.command || "<not found>"}`,
    `Version: ${status.version || "<unknown>"}`,
    "SupportedBridge: headless Claude Code CLI via claude -p",
    "Startup: passive; no Claude job is started by this status check.",
  ].join("\n");
}

function buildClaudeJobPrompt(workspace, jobId, args = {}) {
  const jobDir = jobDirFor(workspace, jobId);
  const request = summarizeFile(path.join(jobDir, "request.md"), 18000);
  return [
    "You are Claude Code running as a local worker for Codex.",
    "Work in the workspace path below. Inspect files locally; do not paste full files, full logs, screenshots, credentials, cookies, or private chat transcripts.",
    "",
    request,
    "",
    "Artifact rules:",
    `- Write the final compact result to: ${path.join(jobDir, "result.md")}`,
    `- Write changed file paths to: ${path.join(jobDir, "changed-files.txt")}`,
    `- Write command/test summary only to: ${path.join(jobDir, "test-output-summary.md")}`,
    "- If blocked, write one concise blocker and the next smallest action.",
    "- Keep result.md to max 10 bullets.",
    "",
    `Current next step: ${String(args.nextStep || "Inspect the relevant files and write compact artifacts.").trim()}`,
  ].join("\n");
}

function writeGitArtifacts(workspace, jobDir) {
  const status = spawnSync("git", ["-C", workspace, "status", "--short"], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  if (status.status === 0) {
    const changed = String(status.stdout || "").trim();
    fs.writeFileSync(path.join(jobDir, "changed-files.txt"), changed ? `${changed}\n` : "NONE\n", "utf8");
  }

  const diff = spawnSync("git", ["-C", workspace, "diff", "--", "."], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 3 * 1024 * 1024,
    windowsHide: true,
  });
  if (diff.status === 0) {
    fs.writeFileSync(path.join(jobDir, "diff.patch"), truncateText(diff.stdout || "", 50000), "utf8");
  }
}

function runClaudeJobWorker(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const jobId = resolveJobId(workspace, args.jobId);
  const jobDir = jobDirFor(workspace, jobId);
  const status = findClaudeCode();
  if (!status.found) {
    updateJobStatus(workspace, jobId, {
      state: "failed",
      currentStep: "claude-code-not-found",
      blocker: status.message,
    });
    return `ClaudeJobWorkerResult:\nJobId: ${jobId}\nState: failed\nBlocker: ${status.message}`;
  }

  const mode = String(args.mode || "fast").trim().toLowerCase();
  const permissionMode = safeClaudeFlag(args.permissionMode || (mode === "review" ? "plan" : "acceptEdits"), "permissionMode");
  const maxMinutes = Math.max(1, Math.min(180, Number(args.maxMinutes || 30)));
  const prompt = buildClaudeJobPrompt(workspace, jobId, args);
  const cliArgs = [
    "-p",
    "--output-format",
    "text",
    "--permission-mode",
    permissionMode,
  ];
  if (args.model) cliArgs.push("--model", safeClaudeFlag(args.model, "model"));
  if (args.fallbackModel) cliArgs.push("--fallback-model", safeClaudeFlag(args.fallbackModel, "fallbackModel"));
  if (args.maxBudgetUsd !== undefined && args.maxBudgetUsd !== null && String(args.maxBudgetUsd).trim() !== "") {
    const budget = Number(args.maxBudgetUsd);
    if (!Number.isFinite(budget) || budget <= 0) throw new Error("maxBudgetUsd must be a positive number.");
    cliArgs.push("--max-budget-usd", String(budget));
  }

  updateJobStatus(workspace, jobId, {
    state: "running",
    worker: "claude-code",
    currentStep: "claude-code-running",
    startedAt: utcStamp(),
    claudeCommand: status.command,
    claudeVersion: status.version,
    claudeModel: args.model || "",
    claudePermissionMode: permissionMode,
  });

  const result = runClaudeCli(status.command, cliArgs, {
    cwd: workspace,
    input: prompt,
    timeout: maxMinutes * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  fs.writeFileSync(path.join(jobDir, "claude-output.txt"), truncateText(stdout, 80000), "utf8");
  fs.writeFileSync(path.join(jobDir, "claude-error.txt"), truncateText(stderr, 30000), "utf8");

  const resultPath = path.join(jobDir, "result.md");
  if (!fs.existsSync(resultPath) || fs.readFileSync(resultPath, "utf8").trim() === "") {
    fs.writeFileSync(resultPath, truncateText(stdout || stderr || "<Claude Code produced no output>", 24000), "utf8");
  }

  const testsPath = path.join(jobDir, "test-output-summary.md");
  if (!fs.existsSync(testsPath) || fs.readFileSync(testsPath, "utf8").trim() === "") {
    fs.writeFileSync(
      testsPath,
      [
        `ClaudeCodeExitCode: ${result.status ?? "<unknown>"}`,
        `TimedOut: ${Boolean(result.error && result.error.code === "ETIMEDOUT")}`,
        stderr.trim() ? `Stderr: ${truncateText(stderr.trim(), 4000)}` : "Stderr: <empty>",
      ].join("\n") + "\n",
      "utf8",
    );
  }

  writeGitArtifacts(workspace, jobDir);

  const failed = result.status !== 0 || Boolean(result.error);
  updateJobStatus(workspace, jobId, {
    state: failed ? "failed" : "completed",
    currentStep: failed ? "claude-code-failed" : "claude-code-completed",
    completedAt: utcStamp(),
    exitCode: result.status,
    blocker: failed ? truncateText(result.error?.message || stderr || stdout || "Claude Code exited non-zero.", 1000) : "",
  });

  return [
    "ClaudeJobWorkerResult:",
    `JobId: ${jobId}`,
    `State: ${failed ? "failed" : "completed"}`,
    `JobFolder: ${jobDir}`,
  ].join("\n");
}

function submitClaudeJob(args = {}) {
  const created = createJob({ ...args, worker: "claude-code" });
  const start = args.start !== false;
  updateJobStatus(created.workspace, created.jobId, {
    worker: "claude-code",
    currentStep: start ? "claude-code-queued" : "claude-code-created-not-started",
  });

  if (!start) {
    return [
      "SubmitClaudeJobResult:",
      `JobId: ${created.jobId}`,
      `JobFolder: ${created.jobDir}`,
      "State: queued",
      "Started: false",
      "Next: call submit-claude-job again with start=true or run the worker from this job folder.",
    ].join("\n");
  }

  const status = findClaudeCode();
  if (!status.found) {
    updateJobStatus(created.workspace, created.jobId, {
      state: "failed",
      currentStep: "claude-code-not-found",
      blocker: status.message,
    });
    return [
      "SubmitClaudeJobResult:",
      `JobId: ${created.jobId}`,
      `JobFolder: ${created.jobDir}`,
      "State: failed",
      `Blocker: ${status.message}`,
    ].join("\n");
  }

  const payloadPath = path.join(created.jobDir, "claude-worker-payload.json");
  writeJsonFile(payloadPath, {
    ...args,
    workspace: created.workspace,
    jobId: created.jobId,
    model: args.model || args.claudeModel || "sonnet",
  });
  const child = spawn(process.execPath, [__filename, "claude-job-worker-cli", "--json-file", payloadPath], {
    cwd: pluginRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  updateJobStatus(created.workspace, created.jobId, {
    state: "running",
    currentStep: "claude-code-background-started",
    workerPid: child.pid,
    claudeCommand: status.command,
    claudeVersion: status.version,
  });

  return [
    "SubmitClaudeJobResult:",
    `JobId: ${created.jobId}`,
    `JobFolder: ${created.jobDir}`,
    "State: running",
    "Started: true",
    `WorkerPid: ${child.pid}`,
    "Next: call read-job with this jobId; Codex should read only compact artifacts.",
  ].join("\n");
}

function buildJobHandoff(workspace, jobId) {
  const jobDir = jobDirFor(workspace, jobId);
  const request = summarizeFile(path.join(jobDir, "request.md"), 16000);
  return [
    "Execute this Antigravity bridge job. Work locally and write artifacts; do not paste full logs/source.",
    "",
    request,
  ].join("\n");
}

function availableModelNames(limitsSummary) {
  return (limitsSummary?.RecommendedAvailable || [])
    .map((entry) => String(entry.DisplayName || entry.Id || "").trim())
    .filter(Boolean);
}

function choosePreferredModel(limitsSummary, preference = "auto") {
  return choosePreferredModelCandidates(limitsSummary, preference)[0] || "";
}

function choosePreferredModelCandidates(limitsSummary, preference = "auto") {
  const names = availableModelNames(limitsSummary);
  const requested = String(preference || "auto").trim();
  const lower = requested.toLowerCase();
  const exact = names.find((name) => name.toLowerCase() === lower);
  if (exact) return [exact];

  const matches = (patterns) => names.filter((name) => patterns.every((pattern) => pattern.test(name)));
  if (lower === "flash-high" || lower === "high-flash" || lower === "gemini-flash-high") {
    return [
      "Gemini 3.5 Flash (High)",
      ...matches([/gemini/i, /3\.5/i, /flash/i, /high/i]),
      ...matches([/gemini/i, /flash/i, /high/i]),
      ...matches([/gemini/i, /flash/i]),
      ...names,
    ].filter((name, index, all) => name && all.indexOf(name) === index);
  }
  if (lower === "auto" || lower === "flash-medium" || lower === "cheap" || lower === "cost-saving") {
    return [
      "Gemini 3.5 Flash (Medium)",
      ...matches([/gemini/i, /3\.5/i, /flash/i, /medium/i]),
      ...matches([/gemini/i, /flash/i, /medium/i]),
      ...matches([/gemini/i, /flash/i]),
      ...names,
    ].filter((name, index, all) => name && all.indexOf(name) === index);
  }
  if (lower === "flash") {
    return [
      "Gemini 3.5 Flash (Medium)",
      ...matches([/gemini/i, /flash/i]),
      ...names,
    ].filter((name, index, all) => name && all.indexOf(name) === index);
  }
  if (lower === "best-available") {
    return names;
  }
  return [requested];
}

async function switchModelInCurrentChat(args = {}) {
  const expectedProject = String(args.expectedProject || "").trim();
  const expectedChat = String(args.expectedChat || "").trim();
  let limitsSummary = null;
  try {
    limitsSummary = await runHelper("limits-summary");
  } catch {
    // The visible model picker remains the fallback source of truth.
  }
  const targetCandidates = choosePreferredModelCandidates(limitsSummary, args.modelPreference || "flash-medium");
  if (!targetCandidates.length) {
    return "SwitchModelResult:\nOk: false\nStage: choose-model\nMessage: No available model could be chosen from limits-summary.";
  }
  const targetModel = targetCandidates[0];

  const { port, page } = await getAntigravityPage();
  const client = await createCdpClient(page.webSocketDebuggerUrl);

  const expression = `
(async () => {
  const expectedProject = ${jsString(expectedProject)};
  const expectedChat = ${jsString(expectedChat)};
  const targetCandidates = ${JSON.stringify(targetCandidates)};
  const candidateNeedles = targetCandidates.map((name) => String(name).toLowerCase());
  const visibleText = document.body ? document.body.innerText || "" : "";
  const activeTitle = document.title || "";
  const activeContextText = Array.from(document.querySelectorAll('body *'))
    .filter((el) => {
      if (el.closest('nav,aside,[role="navigation"]')) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 240 && style.visibility !== "hidden" && style.display !== "none";
    })
    .map((el) => el.innerText || el.textContent || "")
    .join(" ")
    .replace(/\\s+/g, " ");
  const missing = [];
  if (expectedProject && !visibleText.includes(expectedProject)) missing.push("expectedProject");
  if (expectedChat && !(activeTitle + " " + activeContextText).toLowerCase().includes(expectedChat.toLowerCase())) missing.push("expectedChatActiveContext");
  if (missing.length) return { ok: false, stage: "verify", missing };

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const labelFor = (el) => [el.ariaLabel, el.title, el.innerText, el.textContent].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
  const buttons = () => Array.from(document.querySelectorAll('button,[role="button"]')).filter(isVisible);
  const currentButton = buttons().find((el) => /select model, current:/i.test(labelFor(el)));
  const currentLabel = currentButton ? labelFor(currentButton) : "";
  const currentNeedle = candidateNeedles.find((needle) => currentLabel.toLowerCase().includes(needle));
  if (currentNeedle) {
    return { ok: true, stage: "already-selected", selectedModel: targetCandidates[candidateNeedles.indexOf(currentNeedle)], currentLabel };
  }
  if (!currentButton) return { ok: false, stage: "find-selector", message: "No visible model selector found." };

  currentButton.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  let optionButtons = buttons();
  let selectedModel = "";
  let option = null;
  for (let i = 0; i < candidateNeedles.length; i += 1) {
    const needle = candidateNeedles[i];
    option = optionButtons.find((el) => labelFor(el).toLowerCase() === needle)
      || optionButtons.find((el) => labelFor(el).toLowerCase().includes(needle));
    if (option) {
      selectedModel = targetCandidates[i];
      break;
    }
  }
  if (!option) {
    const visibleOptions = optionButtons.map(labelFor).filter((text) => /gemini|claude|gpt|flash|sonnet|opus/i.test(text));
    return { ok: false, stage: "find-option", selectedModel: targetCandidates[0], visibleOptions };
  }
  option.click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  const afterButton = buttons().find((el) => /select model, current:/i.test(labelFor(el)));
  const afterLabel = afterButton ? labelFor(afterButton) : "";
  const selectedNeedle = selectedModel.toLowerCase();
  return {
    ok: afterLabel.toLowerCase().includes(selectedNeedle),
    stage: afterLabel.toLowerCase().includes(selectedNeedle) ? "selected" : "selected-unverified",
    selectedModel,
    currentLabel: afterLabel
  };
})()
`;

  try {
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const value = result?.result?.value || {};
    return [
      "SwitchModelResult:",
      `DevToolsPort: ${port}`,
      `PageTitle: ${page.title || "<unknown>"}`,
      `Requested: ${String(args.modelPreference || "flash-medium")}`,
      `Chosen: ${value.selectedModel || targetModel}`,
      `Ok: ${value.ok === true}`,
      `Stage: ${value.stage || "<unknown>"}`,
      value.currentLabel ? `CurrentLabel: ${value.currentLabel}` : null,
      value.missing?.length ? `Missing: ${value.missing.join(", ")}` : null,
      value.visibleOptions?.length ? `VisibleOptions: ${value.visibleOptions.slice(0, 8).join(" | ")}` : null,
      value.message ? `Message: ${value.message}` : null,
    ].filter(Boolean).join("\n");
  } finally {
    client.close();
  }
}

async function submitOffloadToCurrentChat(args = {}) {
  const { decision } = getOffloadDecision({ ...args, hasWorkspaceWork: true, estimatedCodexInputTokens: 2000 });
  if (decision !== "offload-to-antigravity") {
    return `SubmitOffload: skipped\nDecision: ${decision}\nReason: task does not need Antigravity.`;
  }

  const handoff = args.handoffText
    ? String(args.handoffText)
    : buildHandoffTemplate(args).replace(/^Use this as a compact Antigravity offload handoff:\n\n/, "");
  const expectedProject = String(args.expectedProject || "").trim();
  const expectedChat = String(args.expectedChat || "").trim();
  const submit = Boolean(args.submit);
  const fillOnly = Boolean(args.fillOnly);
  const skipModelSwitch = Boolean(args.skipModelSwitch);
  let switchResult = "";
  if (!skipModelSwitch) {
    switchResult = await switchModelInCurrentChat({
      expectedProject,
      expectedChat,
      modelPreference: args.modelPreference || "auto",
    });
    if (!/Ok: true/.test(switchResult)) {
      return `${switchResult}\n\nSubmitOffloadResult:\nOk: false\nStage: model-switch\nSubmitted: false\nMessage: Refusing to submit while the requested/available model is not verified.`;
    }
  }
  const { port, page } = await getAntigravityPage();
  const client = await createCdpClient(page.webSocketDebuggerUrl);

  const expression = `
(() => {
  const prompt = ${jsString(handoff)};
  const expectedProject = ${jsString(expectedProject)};
  const expectedChat = ${jsString(expectedChat)};
  const shouldSubmit = ${submit ? "true" : "false"};
  const shouldFillOnly = ${fillOnly ? "true" : "false"};
  const visibleText = document.body ? document.body.innerText || "" : "";
  const activeTitle = document.title || "";
  const activeContextText = Array.from(document.querySelectorAll('body *'))
    .filter((el) => {
      if (el.closest('nav,aside,[role="navigation"]')) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 240 && style.visibility !== "hidden" && style.display !== "none";
    })
    .map((el) => el.innerText || el.textContent || "")
    .join(" ")
    .replace(/\\s+/g, " ");
  const missing = [];
  if (expectedProject && !visibleText.includes(expectedProject)) missing.push("expectedProject");
  if (expectedChat && !(activeTitle + " " + activeContextText).toLowerCase().includes(expectedChat.toLowerCase())) missing.push("expectedChatActiveContext");
  if (/new conversation|new chat/i.test(activeTitle)) missing.push("activeExistingChat");
  if (missing.length) {
    return { ok: false, stage: "verify", missing, submitted: false, activeTitle };
  }

  if (!shouldSubmit && !shouldFillOnly) {
    return { ok: true, stage: "verified", submitted: false, promptLength: prompt.length };
  }

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const candidates = Array.from(document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"],[role="combobox"]'))
    .filter((el) => isVisible(el) && !el.disabled && !el.readOnly)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
  const composer = candidates[0];
  if (!composer) {
    return { ok: false, stage: "composer", submitted: false, message: "No visible composer found." };
  }

  composer.focus();
  if (composer.matches('textarea,input')) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), "value")?.set;
    if (setter) setter.call(composer, prompt);
    else composer.value = prompt;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand("selectAll", false, null);
    const inserted = document.execCommand("insertText", false, prompt);
    if (!inserted) composer.textContent = prompt;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
  }

  if (!shouldSubmit) {
    return { ok: true, stage: "filled", submitted: false, promptLength: prompt.length };
  }

  const composerRect = composer.getBoundingClientRect();
  const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
    .filter((el) => isVisible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true");
  const labeled = buttons.find((el) => /send|submit/i.test([el.ariaLabel, el.title, el.textContent].filter(Boolean).join(" ")));
  const nearby = buttons
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= composerRect.top - 80 && rect.bottom <= composerRect.bottom + 120 && rect.left > composerRect.left;
    })
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  const sendButton = labeled || nearby;
  if (sendButton) {
    sendButton.click();
    return {
      ok: true,
      stage: "send-clicked",
      submitted: false,
      promptLength: prompt.length,
      submitMethod: "click"
    };
  }
  return {
    ok: true,
    stage: "filled-ready-for-enter",
    submitted: false,
    promptLength: prompt.length,
    hasSendButton: false
  };
})()
`;

  try {
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    let value = result?.result?.value || {};
    if (submit && value.ok === true && value.stage === "filled-ready-for-enter") {
      await client.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        unmodifiedText: "\r",
        text: "\r",
      });
      await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      value = { ...value, submitMethod: "enter" };
    }
    if (submit && value.ok === true && (value.stage === "filled-ready-for-enter" || value.stage === "send-clicked")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const afterEnter = await client.send("Runtime.evaluate", {
        expression: `
(() => {
  const visibleText = document.body ? document.body.innerText || "" : "";
  const runningNow = /\\b(stop|cancel|running|thinking|generating|working)\\b/i.test(visibleText);
  const composer = Array.from(document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"],[role="combobox"]'))
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    })
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  const composerText = composer ? (composer.value || composer.innerText || composer.textContent || "") : "";
  const promptHead = ${jsString(handoff.slice(0, 80))};
  const composerStillHasPrompt = composerText.includes(promptHead);
  const visibleHasPrompt = visibleText.includes(promptHead);
  return { runningNow, composerStillHasPrompt, visibleHasPrompt, composerLength: composerText.length };
})()
`,
        awaitPromise: true,
        returnByValue: true,
      });
      const afterValue = afterEnter?.result?.value || {};
      const submitted = afterValue.composerStillHasPrompt !== true && (afterValue.visibleHasPrompt === true || afterValue.runningNow === true);
      value = {
        ...value,
        stage: submitted ? `${value.submitMethod || "submit"}-submitted` : `${value.submitMethod || "submit"}-unconfirmed`,
        submitted,
        enterDispatched: value.submitMethod === "enter",
        runningNow: afterValue.runningNow === true,
        composerStillHasPrompt: afterValue.composerStillHasPrompt === true,
        visibleHasPrompt: afterValue.visibleHasPrompt === true,
      };
      if (value.submitMethod === "click" && value.submitted !== true && value.composerStillHasPrompt === true) {
        await client.send("Runtime.evaluate", {
          expression: `
(() => {
  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const composer = Array.from(document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"],[role="combobox"]'))
    .filter((el) => isVisible(el) && !el.disabled && !el.readOnly)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  if (composer) composer.focus();
  return Boolean(composer);
})()
`,
          awaitPromise: true,
          returnByValue: true,
        });
        await client.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          unmodifiedText: "\r",
          text: "\r",
        });
        await client.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        });
        await new Promise((resolve) => setTimeout(resolve, 700));
        const afterFallbackEnter = await client.send("Runtime.evaluate", {
          expression: `
(() => {
  const visibleText = document.body ? document.body.innerText || "" : "";
  const runningNow = /\\b(stop|cancel|running|thinking|generating|working)\\b/i.test(visibleText);
  const composer = Array.from(document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"],[role="combobox"]'))
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    })
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  const composerText = composer ? (composer.value || composer.innerText || composer.textContent || "") : "";
  const promptHead = ${jsString(handoff.slice(0, 80))};
  const composerStillHasPrompt = composerText.includes(promptHead);
  const visibleHasPrompt = visibleText.includes(promptHead);
  return { runningNow, composerStillHasPrompt, visibleHasPrompt, composerLength: composerText.length };
})()
`,
          awaitPromise: true,
          returnByValue: true,
        });
        const fallbackValue = afterFallbackEnter?.result?.value || {};
        const fallbackSubmitted = fallbackValue.composerStillHasPrompt !== true && (fallbackValue.visibleHasPrompt === true || fallbackValue.runningNow === true);
        value = {
          ...value,
          stage: fallbackSubmitted ? "click-then-enter-submitted" : "click-then-enter-unconfirmed",
          submitted: fallbackSubmitted,
          submitMethod: "click-then-enter",
          enterDispatched: true,
          runningNow: fallbackValue.runningNow === true,
          composerStillHasPrompt: fallbackValue.composerStillHasPrompt === true,
          visibleHasPrompt: fallbackValue.visibleHasPrompt === true,
        };
      }
    }
    return [
      switchResult || null,
      switchResult ? "" : null,
      "SubmitOffloadResult:",
      `DevToolsPort: ${port}`,
      `PageTitle: ${page.title || "<unknown>"}`,
      `Ok: ${value.ok === true}`,
      `Stage: ${value.stage || "<unknown>"}`,
      `Submitted: ${value.submitted === true}`,
      value.activeTitle ? `ActiveTitle: ${value.activeTitle}` : null,
      value.submitMethod ? `SubmitMethod: ${value.submitMethod}` : null,
      value.composerStillHasPrompt === true ? "ComposerStillHasPrompt: true" : null,
      value.missing?.length ? `Missing: ${value.missing.join(", ")}` : null,
      value.message ? `Message: ${value.message}` : null,
      "Next: If Submitted is true, stop monitoring every UI step and read only the requested status artifact or targeted diff.",
    ].filter(Boolean).join("\n");
  } finally {
    client.close();
  }
}

async function submitJob(args = {}) {
  const created = createJob(args);
  const handoffText = buildJobHandoff(created.workspace, created.jobId);
  const submit = args.submit !== false;
  let text = "";
  try {
    text = await submitOffloadToCurrentChat({
      goal: `Execute Antigravity bridge job ${created.jobId}`,
      workspace: created.workspace,
      statusFile: path.join(created.jobDir, "status.json"),
      nextStep: `Read request.md in ${created.jobDir} and write the required bridge artifacts.`,
      expectedProject: args.expectedProject || "",
      expectedChat: args.expectedChat || "",
      modelPreference: args.modelPreference || "auto",
      submit,
      handoffText,
    });
  } catch (error) {
    text = `SubmitOffloadResult:\nOk: false\nStage: exception\nSubmitted: false\nMessage: ${error?.message || String(error)}`;
  }
  if (/Submitted: true/.test(text)) {
    markJobSubmitted(created.workspace, created.jobId);
  } else if (submit) {
    markJobSubmitFailed(created.workspace, created.jobId, text);
  }
  return [
    "SubmitJobResult:",
    `JobId: ${created.jobId}`,
    `JobFolder: ${created.jobDir}`,
    `SubmittedRequested: ${submit}`,
    "",
    text,
    "",
    "Codex follow-up: do not read the Antigravity chat. Later call read-job for result.md, changed-files.txt, diff.patch, test-output-summary.md, and status.json.",
  ].join("\n");
}

async function retryJob(args = {}) {
  const workspace = safeWorkspacePath(args.workspace);
  const jobId = resolveJobId(workspace, args.jobId || "latest");
  const jobDir = jobDirFor(workspace, jobId);
  const handoffText = buildJobHandoff(workspace, jobId);
  const submit = args.submit !== false;
  let text = "";
  try {
    text = await submitOffloadToCurrentChat({
      goal: `Retry Antigravity bridge job ${jobId}`,
      workspace,
      statusFile: path.join(jobDir, "status.json"),
      nextStep: `Retry request.md in ${jobDir} and overwrite the required bridge artifacts.`,
      expectedProject: args.expectedProject || "",
      expectedChat: args.expectedChat || "",
      modelPreference: args.modelPreference || "auto",
      submit,
      handoffText,
    });
  } catch (error) {
    text = `SubmitOffloadResult:\nOk: false\nStage: exception\nSubmitted: false\nMessage: ${error?.message || String(error)}`;
  }
  if (/Submitted: true/.test(text)) {
    markJobSubmitted(workspace, jobId);
  } else if (submit) {
    markJobSubmitFailed(workspace, jobId, text);
  }
  return [
    "RetryJobResult:",
    `JobId: ${jobId}`,
    `JobFolder: ${jobDir}`,
    `SubmittedRequested: ${submit}`,
    "",
    text,
  ].join("\n");
}

function buildDevToolsHealthAdvice(result) {
  const pageCount = Number(result?.PageCount || 0);
  const running = Boolean(result?.Running);
  const port = result?.DevToolsPort || "<unknown>";
  const status = running && pageCount > 0 ? "ready" : "not-ready";
  const next = status === "ready"
    ? "If antigravity-devtools still says Transport closed, do not retry the same MCP transport. Restart Codex so the DevTools MCP server is re-created, or use handoff-template/manual paste for this turn."
    : "Run antigravity-local.repair-live once. If it restarts Antigravity, restart Codex before calling antigravity-devtools again.";

  return [
    `DevToolsHealth: ${status}`,
    `Running: ${running}`,
    `DevToolsPort: ${port}`,
    `PageCount: ${pageCount}`,
    `Next: ${next}`,
    "",
    "Rule: antigravity-local can report health even when antigravity-devtools/list_pages fails with Transport closed. A closed transport means the DevTools MCP child process died; it is not fixed by repeatedly calling list_pages in the same session.",
  ].join("\n");
}

function buildSubmissionGuide() {
  return [
    "AntigravitySubmissionGuide:",
    "1. Verify the target project, conversation, model, and idle composer first.",
    "2. Fill or type the prompt into the composer only. Do not include submitKey in the fill/type call.",
    "3. Prefer clicking the visible Send/arrow button after the composer contains the prompt.",
    "4. If a keyboard submit is required, use a separate key tool call with a simple accepted key such as Enter. Do not use Control+Enter, Ctrl+Enter, or chord strings unless the active tool schema explicitly lists that exact value.",
    "5. After submitting, verify Antigravity accepted the message by checking for a working/streaming state or a new visible user message.",
    "6. If the key or click fails once, stop retrying the same submit method. Report the blocker or use handoff-template for manual paste.",
    "",
    "Reason: some Codex DevTools tools reject chord strings like Control+Enter with Unknown key, even after the prompt was typed correctly.",
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

      if (name === "devtools-health") {
        const result = await runHelper("live");
        const text = `${buildDevToolsHealthAdvice(result)}\n\nRaw live report:\n${JSON.stringify(result, null, 2)}`;
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "submission-guide") {
        sendResult(id, { content: [{ type: "text", text: buildSubmissionGuide() }] });
        return;
      }

      if (name === "prepare-offload") {
        const quick = await runHelper("quick");
        const text = buildPrepareOffload(params?.arguments || {}, quick);
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "create-job") {
        const created = createJob(params?.arguments || {});
        const text = [
          "CreateJobResult:",
          `JobId: ${created.jobId}`,
          `JobFolder: ${created.jobDir}`,
          "State: queued",
          "Next: call submit-job to send it to Antigravity, or read request.md for manual review.",
        ].join("\n");
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "submit-job") {
        const text = await submitJob(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "claude-status") {
        sendResult(id, { content: [{ type: "text", text: getClaudeStatusText() }] });
        return;
      }

      if (name === "submit-claude-job") {
        const text = submitClaudeJob(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "list-jobs") {
        const text = listJobs(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "read-job") {
        const text = readJob(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "cancel-job") {
        const text = cancelJob(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "retry-job") {
        const text = await retryJob(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "submit-offload") {
        const text = await submitOffloadToCurrentChat(params?.arguments || {});
        sendResult(id, { content: [{ type: "text", text }] });
        return;
      }

      if (name === "switch-model") {
        const text = await switchModelInCurrentChat(params?.arguments || {});
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

if (["submit-offload-cli", "switch-model-cli", "create-job-cli", "submit-job-cli", "claude-status-cli", "submit-claude-job-cli", "claude-job-worker-cli", "list-jobs-cli", "read-job-cli", "cancel-job-cli", "retry-job-cli"].includes(process.argv[2])) {
  let args = {};
  try {
    if (process.argv[3] === "--json-file") {
      args = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
    } else {
      args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
    }
  } catch (error) {
    console.error(`Invalid submit-offload JSON: ${error?.message || String(error)}`);
    process.exit(2);
  }

  const actions = {
    "submit-offload-cli": submitOffloadToCurrentChat,
    "switch-model-cli": switchModelInCurrentChat,
    "create-job-cli": async (value) => {
      const created = createJob(value);
      return `CreateJobResult:\nJobId: ${created.jobId}\nJobFolder: ${created.jobDir}\nState: queued`;
    },
    "submit-job-cli": submitJob,
    "claude-status-cli": async () => getClaudeStatusText(),
    "submit-claude-job-cli": async (value) => submitClaudeJob(value),
    "claude-job-worker-cli": async (value) => runClaudeJobWorker(value),
    "list-jobs-cli": async (value) => listJobs(value),
    "read-job-cli": async (value) => readJob(value),
    "cancel-job-cli": async (value) => cancelJob(value),
    "retry-job-cli": retryJob,
  };
  const action = actions[process.argv[2]];
  action(args)
    .then((text) => {
      console.log(text);
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    });
  return;
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
