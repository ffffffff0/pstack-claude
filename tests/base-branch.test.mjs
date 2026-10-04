// base-branch.mjs finds the branch a worktree was cut from: the reflog's
// "Created from", the latest rebase target, then the nearest remote branch.
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findBase } from "../plugins/pstack/skills/poteto-mode/scripts/base-branch.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

// origin has main plus DEV-1 and the newer DEV-2; the clone sees them as origin/*.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "base-branch-"));
  const origin = join(root, "origin");
  execFileSync("git", ["init", "-q", "-b", "main", origin]);
  git(origin, "commit", "-q", "--allow-empty", "-m", "a");
  git(origin, "branch", "DEV-1");
  git(origin, "commit", "-q", "--allow-empty", "-m", "b");
  git(origin, "branch", "DEV-2");
  git(origin, "commit", "-q", "--allow-empty", "-m", "c");
  const clone = join(root, "clone");
  execFileSync("git", ["clone", "-q", origin, clone]);
  return { root, clone };
}

describe("findBase", () => {
  test("a user-named base wins", () => {
    const { root, clone } = fixture();
    expect(findBase(clone, "DEV-9")).toEqual({ base: "DEV-9", source: "user", confident: true });
    rmSync(root, { recursive: true });
  });

  test("a worktree reports the branch it was created from", () => {
    const { root, clone } = fixture();
    const wt = join(root, "wt");
    git(clone, "worktree", "add", "-q", "-b", "feat", wt, "origin/DEV-1");
    git(wt, "commit", "-q", "--allow-empty", "-m", "f");
    expect(findBase(wt)).toEqual({ base: "origin/DEV-1", source: "created-from", confident: true });
    rmSync(root, { recursive: true });
  });

  test("a later rebase onto a newer branch moves the base", () => {
    const { root, clone } = fixture();
    const wt = join(root, "wt");
    git(clone, "worktree", "add", "-q", "-b", "feat", wt, "origin/DEV-1");
    git(wt, "commit", "-q", "--allow-empty", "-m", "f");
    git(wt, "rebase", "-q", "origin/DEV-2");
    expect(findBase(wt)).toEqual({ base: "origin/DEV-2", source: "rebased-onto", confident: true });
    rmSync(root, { recursive: true });
  });

  test("checking out an existing remote branch is not its base", () => {
    const { root, clone } = fixture();
    git(root + "/origin", "branch", "feat", "DEV-1");
    git(root + "/origin", "checkout", "-q", "feat");
    git(root + "/origin", "commit", "-q", "--allow-empty", "-m", "f");
    git(clone, "fetch", "-q");
    git(clone, "checkout", "-q", "feat");
    expect(findBase(clone)).toEqual({ base: "origin/DEV-1", source: "nearest-remote", confident: false });
    rmSync(root, { recursive: true });
  });

  test("pstack.baseBranches limits the guess to long-lived branches", () => {
    const { root, clone } = fixture();
    git(clone, "checkout", "-q", "-b", "feat", "origin/DEV-1");
    git(clone, "commit", "-q", "--allow-empty", "-m", "f");
    git(clone, "push", "-q", "origin", "feat:topic");
    git(clone, "commit", "-q", "--allow-empty", "-m", "g");
    git(clone, "reflog", "expire", "--expire=now", "--all");
    expect(findBase(clone).base).toBe("origin/topic");
    git(clone, "config", "pstack.baseBranches", "origin/DEV-*");
    expect(findBase(clone).base).toBe("origin/DEV-1");
    rmSync(root, { recursive: true });
  });

  test("without a reflog it guesses the nearest remote branch, unconfidently", () => {
    const { root, clone } = fixture();
    git(clone, "checkout", "-q", "-b", "feat", "origin/DEV-1");
    git(clone, "commit", "-q", "--allow-empty", "-m", "f");
    git(clone, "reflog", "expire", "--expire=now", "--all");
    expect(findBase(clone)).toEqual({ base: "origin/DEV-1", source: "nearest-remote", confident: false });
    rmSync(root, { recursive: true });
  });
});
