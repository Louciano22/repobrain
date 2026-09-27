import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverPath = path.join(repoRoot, "apps", "mcp-server", "dist", "index.js");
const trustedRepo = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-stdio-"));
const outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-outside-"));
const child = spawn(process.execPath, [serverPath, "--stdio"], {
  cwd: trustedRepo,
  stdio: ["pipe", "pipe", "pipe"]
});
let pending = "";
let stderr = "";
let nextId = 1;
const protocolErrors: string[] = [];
const seenIds = new Set<number>();
const waiters = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();

child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
  pending += chunk;
  while (pending.includes("\n")) {
    const newline = pending.indexOf("\n");
    const line = pending.slice(0, newline).trim();
    pending = pending.slice(newline + 1);
    if (!line) { protocolErrors.push("Empty stdout line"); continue; }
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      protocolErrors.push(`Non-JSON stdout: ${line}`);
      for (const waiter of waiters.values()) waiter.reject(new Error(`Non-protocol stdout: ${line}`));
      waiters.clear();
      return;
    }
    const id = message.id;
    if (message.jsonrpc !== "2.0" || typeof id !== "number" || (!("result" in message) && !("error" in message)) || seenIds.has(id) || !waiters.has(id)) {
      protocolErrors.push(`Unexpected JSON-RPC stdout: ${line}`);
      continue;
    }
    seenIds.add(id);
    waiters.get(id)?.resolve(message);
    waiters.delete(id);
  }
});

function send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`MCP ${method} timed out: ${stderr}`));
    }, 5000);
    waiters.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

try {
  const initialized = await send("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "cream-soda-test", version: "1" }
  });
  assert.ok(initialized.result, `MCP initialize failed: ${JSON.stringify(initialized)}`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const listed = await send("tools/list", {});
  const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
  assert.ok(tools.some((tool) => tool.name === "search_code"));
  assert.ok(!tools.some((tool) => tool.name === "clear_index"));
  assert.ok(tools.every((tool: { name: string; inputSchema?: { properties?: Record<string, unknown> } }) => !tool.inputSchema?.properties?.repo));

  fs.writeFileSync(path.join(trustedRepo, "example.ts"), "export const example = 'trusted';\n");
  const indexed = await send("tools/call", { name: "index_codebase", arguments: {} });
  const indexedResult = indexed.result as { isError?: boolean; content: Array<{ text: string }> };
  assert.notEqual(indexedResult.isError, true, indexedResult.content?.[0]?.text);
  assert.equal(fs.existsSync(path.join(trustedRepo, ".repobrain")), true);
  assert.equal(fs.existsSync(path.join(outsideRepo, ".repobrain")), false);
  const status = await send("tools/call", { name: "get_index_status", arguments: {} });
  assert.notEqual((status.result as { isError?: boolean }).isError, true);

  const escaped = await send("tools/call", { name: "get_index_status", arguments: { repo: outsideRepo } });
  const escapedResult = escaped.result as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(escapedResult.isError, true);
  assert.match(escapedResult.content[0]?.text ?? "", /outside the trusted MCP root/);

  const reset = await send("tools/call", { name: "clear_index", arguments: {} });
  const resetResult = reset.result as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(resetResult.isError, true);
  assert.equal(fs.existsSync(path.join(trustedRepo, ".repobrain")), true);
} finally {
  child.kill();
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("close", () => resolve());
  });
  fs.rmSync(trustedRepo, { recursive: true, force: true });
  fs.rmSync(outsideRepo, { recursive: true, force: true });
  assert.equal(pending, "", `Incomplete stdout: ${pending}`);
  assert.deepEqual(protocolErrors, [], `Unexpected stdout: ${protocolErrors.join("; ")}`);
}
console.log("Cream Soda stdio MCP boundary tests passed");
