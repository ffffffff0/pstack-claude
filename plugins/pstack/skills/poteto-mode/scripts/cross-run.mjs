#!/usr/bin/env node
// cross-run: run one prompt on the other model family, from either harness.
// claude-* ids go through `claude -p`, gpt-* ids through `codex exec`.
// Exit 0 with the final message on success; non-zero when the run failed, so
// the caller can fall back to its own family and say so.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HELP = `Usage: cross-run.mjs --model <id>[@effort] (--prompt-file <f> | -) [options]

Runs one prompt headless on the model's own harness and waits for it.
  claude-*  ->  claude -p        gpt-*  ->  codex exec

Options:
  --model <id>[@eff]  required, e.g. gpt-5.6-sol, claude-opus-5-5@max
  --prompt-file <f>   prompt file ("-" or a bare "-" reads stdin)
  --out <f>           write the final message here, stderr to <f>.log
  --cd <dir>          working directory (default: current)
  --write             allow edits (default: read-only)
  --json-schema <f>   JSON Schema file for structured output
  --timeout <sec>     stop the run after this many seconds (default 1800)
  --dry-run           print the command instead of running it

Read-only: Claude gets Read, Grep and Glob only (put the diff in the prompt);
Codex runs in its read-only sandbox, which has no network. Forge tokens
(GITLAB_*, GITHUB_*, GH_*) are removed from the child's environment.`;

export function splitModel(value) {
  const [model, effort] = value.split("@");
  return { model, effort: effort || undefined };
}

export function family(model) {
  if (model.startsWith("claude-")) return "claude";
  if (model.startsWith("gpt-")) return "codex";
  throw new Error(`unknown model family for '${model}' (expected claude-* or gpt-*)`);
}

// Codex tops out at xhigh; Claude accepts max.
export function effortFor(fam, effort) {
  return fam === "codex" && effort === "max" ? "xhigh" : effort;
}

// No Bash for a read-only Claude run: allowlisted git and search commands
// still take flags that write files or run programs (git --output, rg --pre).
const READ_TOOLS = ["Read", "Grep", "Glob"];
const WRITE_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "NotebookEdit", "Bash"];

export function buildCommand(o) {
  if (family(o.model) === "claude") {
    const args = ["-p", "--model", o.model, "--output-format", "json", "--no-session-persistence",
      "--permission-mode", "dontAsk", "--allowedTools", (o.write ? WRITE_TOOLS : READ_TOOLS).join(",")];
    if (o.schema) args.push("--json-schema", o.schema);
    if (o.effort) args.push("--effort", o.effort);
    // --allowedTools is variadic, so the prompt goes through stdin, never argv.
    return { bin: "claude", args, stdin: o.prompt };
  }
  const args = ["exec", "-m", o.model, "--skip-git-repo-check", "--ephemeral", "-C", o.cd,
    "-s", o.write ? "workspace-write" : "read-only", "-o", o.lastMessageFile];
  if (o.schemaFile) args.push("--output-schema", o.schemaFile);
  if (o.effort) args.push("-c", `model_reasoning_effort=${o.effort}`);
  args.push("-");
  // codex exec keeps reading an open stdin pipe, so the prompt goes in and stdin closes.
  return { bin: "codex", args, stdin: o.prompt };
}

export function childEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^(GITLAB|GITHUB|GH)_/.test(k)));
}

// Run in its own process group so a timeout stops the model's children too.
// Resolve on the child's exit, not on its pipes closing: a background process
// the model left running would otherwise hold them open.
function run(cmd, cwd, timeoutMs) {
  return new Promise((done) => {
    const child = spawn(cmd.bin, cmd.args, { cwd, env: childEnv(process.env), stdio: ["pipe", "pipe", "pipe"], detached: true });
    let stdout = "", stderr = "", settled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const killGroup = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hard);
      killGroup("SIGKILL");
      done({ code, stdout, stderr });
    };
    let hard;
    const timer = setTimeout(() => {
      stderr += `\ncross-run: timed out after ${timeoutMs / 1000}s\n`;
      killGroup("SIGTERM");
      hard = setTimeout(() => finish(124), 5000);
    }, timeoutMs);
    child.on("error", (e) => { stderr += String(e); finish(127); });
    // Give the pipes a moment to drain after exit, then stop waiting for them.
    child.on("exit", (code) => setTimeout(() => finish(code ?? 1), 200));
    child.stdin.on("error", () => {});
    child.stdin.end(cmd.stdin ?? "");
  });
}

export async function main(argv) {
  const { values: v, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      model: { type: "string" }, "prompt-file": { type: "string" }, out: { type: "string" },
      cd: { type: "string" }, write: { type: "boolean" }, "json-schema": { type: "string" },
      timeout: { type: "string" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" },
    },
  });
  if (v.help) { console.log(HELP); return 0; }
  if (!v.model) { console.error("cross-run: --model is required\n\n" + HELP); return 2; }
  const split = splitModel(v.model);
  let fam;
  try { fam = family(split.model); } catch (e) { console.error(`cross-run: ${e.message}`); return 2; }
  const file = v["prompt-file"] ?? (positionals.includes("-") ? "-" : undefined);
  if (!file) { console.error("cross-run: pass --prompt-file <f> or -"); return 2; }
  const prompt = readFileSync(file === "-" ? 0 : file, "utf8");
  const cd = resolve(v.cd ?? process.cwd());
  const tmp = mkdtempSync(join(tmpdir(), "pstack-cross-run-"));
  const o = {
    model: split.model, prompt, cd, write: !!v.write, effort: effortFor(fam, split.effort),
    schema: v["json-schema"] ? readFileSync(v["json-schema"], "utf8") : undefined,
    schemaFile: v["json-schema"] ? resolve(v["json-schema"]) : undefined,
    lastMessageFile: join(tmp, "last.txt"),
  };
  const cmd = buildCommand(o);
  if (v["dry-run"]) {
    console.log(JSON.stringify({ bin: cmd.bin, args: cmd.args, cwd: cd }, null, 2));
    rmSync(tmp, { recursive: true, force: true });
    return 0;
  }

  const result = await run(cmd, cd, Number(v.timeout ?? 1800) * 1000);
  let message = "", ok = result.code === 0;
  if (fam === "claude") {
    try {
      const j = JSON.parse(result.stdout);
      ok = ok && !j.is_error;
      message = o.schema && j.structured_output !== undefined ? JSON.stringify(j.structured_output, null, 2) : String(j.result ?? "");
    } catch {
      ok = false;
      message = result.stdout;
    }
  } else {
    try { message = readFileSync(o.lastMessageFile, "utf8"); } catch { ok = false; }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (o.schema && ok) {
    try { JSON.parse(message); } catch { ok = false; result.stderr += "\ncross-run: output is not valid JSON for --json-schema\n"; }
  }
  if (v.out) {
    writeFileSync(v.out, message);
    writeFileSync(`${v.out}.log`, result.stderr);
  } else {
    process.stdout.write(message.endsWith("\n") ? message : message + "\n");
  }
  if (!ok) process.stderr.write(`cross-run: ${split.model} failed (exit ${result.code})\n` + result.stderr.split("\n").slice(-20).join("\n") + "\n");
  return ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
