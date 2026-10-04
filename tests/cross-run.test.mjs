// cross-run.mjs reaches the other model family: claude -p for claude-*, codex
// exec for gpt-*. A read-only Claude seat gets no shell, and forge tokens never
// reach the child.
import { describe, expect, test } from "bun:test";

import { buildCommand, childEnv, effortFor, family, splitModel } from "../plugins/pstack/skills/poteto-mode/scripts/cross-run.mjs";

const base = { prompt: "p", cd: "/tmp", lastMessageFile: "/tmp/last.txt" };

describe("cross-run", () => {
  test("routes by family and splits an @effort suffix", () => {
    expect(family("claude-opus-5-5")).toBe("claude");
    expect(family("gpt-5.6-sol")).toBe("codex");
    expect(() => family("opus")).toThrow("unknown model family");
    expect(splitModel("gpt-5.6-sol@max")).toEqual({ model: "gpt-5.6-sol", effort: "max" });
    expect(effortFor("codex", "max")).toBe("xhigh");
    expect(effortFor("claude", "max")).toBe("max");
  });

  test("a read-only Claude seat gets Read, Grep and Glob only, prompt on stdin", () => {
    const cmd = buildCommand({ ...base, model: "claude-opus-5-5" });
    expect(cmd.bin).toBe("claude");
    expect(cmd.args[cmd.args.indexOf("--allowedTools") + 1]).toBe("Read,Grep,Glob");
    expect(cmd.args).not.toContain("p");
    expect(cmd.stdin).toBe("p");
  });

  test("a Codex seat runs in the read-only sandbox unless --write", () => {
    const ro = buildCommand({ ...base, model: "gpt-5.6-sol", effort: "xhigh" });
    expect(ro.args.slice(ro.args.indexOf("-s"), ro.args.indexOf("-s") + 2)).toEqual(["-s", "read-only"]);
    expect(ro.args).toContain("model_reasoning_effort=xhigh");
    expect(ro.args.at(-1)).toBe("-");
    const rw = buildCommand({ ...base, model: "gpt-5.6-sol", write: true });
    expect(rw.args).toContain("workspace-write");
  });

  test("forge tokens are dropped from the child environment", () => {
    const env = childEnv({ GITLAB_TOKEN: "a", GITHUB_TOKEN: "b", GH_TOKEN: "c", ANTHROPIC_AUTH_TOKEN: "d", PATH: "/bin" });
    expect(Object.keys(env).sort()).toEqual(["ANTHROPIC_AUTH_TOKEN", "PATH"]);
  });
});
