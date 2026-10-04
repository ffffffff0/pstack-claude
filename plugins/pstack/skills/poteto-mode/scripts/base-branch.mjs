#!/usr/bin/env node
// base-branch: the branch the current branch was cut from, for "diff against
// the base". Order: --base from the user; the branch's own reflog ("Created
// from X", or the latest rebase onto X); the nearest remote branch by commits
// since the merge-base. Prints {"base","source","confident"} as JSON; exits 3
// when nothing fits, so the caller asks the user.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const git = (cwd, args) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const exists = (cwd, ref) => git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;

// The latest rebase of `branch` in this worktree's HEAD reflog: a
// "rebase (finish): returning to refs/heads/<branch>" entry, then (older) the
// "rebase (start): checkout <onto>" that began it.
function rebasedOnto(cwd, branch) {
  const log = git(cwd, ["reflog", "--format=%gs", "HEAD"]);
  if (!log) return null;
  let pending = false;
  for (const line of log.split("\n")) {
    if (line === `rebase (finish): returning to refs/heads/${branch}`) pending = true;
    else if (pending && line.startsWith("rebase (start): checkout ")) return line.slice("rebase (start): checkout ".length);
  }
  return null;
}

export function fromReflog(cwd, branch) {
  const log = git(cwd, ["reflog", "show", "--format=%gs", `refs/heads/${branch}`]);
  if (!log) return null;
  for (const line of log.split("\n")) {
    if (line.startsWith("rebase (finish):") || line.startsWith("rebase -i (finish):")) {
      const onto = rebasedOnto(cwd, branch);
      if (onto && onto !== "HEAD" && exists(cwd, onto)) return { base: onto, source: "rebased-onto" };
      continue;
    }
    // Checking out an existing remote branch records "Created from origin/<branch>":
    // that is the branch's own remote, not its base.
    const created = line.match(/^branch: Created from (.+)$/);
    const own = created && (created[1] === branch || created[1].endsWith(`/${branch}`));
    if (created && !own && created[1] !== "HEAD" && exists(cwd, created[1])) return { base: created[1], source: "created-from" };
  }
  return null;
}

// Fallback: the remote branch HEAD has the fewest commits beyond. A ref that
// already contains HEAD (its own remote, or a branch that merged it) is skipped.
// `git config pstack.baseBranches "origin/DEV-* origin/main"` limits the
// candidates to the repo's long-lived branches.
export function nearestRemote(cwd, branch) {
  const patterns = (git(cwd, ["config", "--get", "pstack.baseBranches"]) ?? "").split(/\s+/).filter(Boolean);
  const scope = patterns.length ? patterns.map((p) => `refs/remotes/${p}`) : ["refs/remotes"];
  const refs = git(cwd, ["for-each-ref", "--format=%(refname:short)", ...scope]);
  if (!refs) return null;
  let best = null;
  for (const ref of refs.split("\n")) {
    if (!ref || ref.endsWith("/HEAD") || ref.endsWith(`/${branch}`)) continue;
    if (git(cwd, ["merge-base", "--is-ancestor", "HEAD", ref]) !== null) continue;
    const mb = git(cwd, ["merge-base", "HEAD", ref]);
    if (!mb) continue;
    const ahead = Number(git(cwd, ["rev-list", "--count", `${mb}..HEAD`]));
    if (best === null || ahead < best.ahead) best = { base: ref, ahead };
  }
  return best && { base: best.base, source: "nearest-remote" };
}

export function findBase(cwd, userBase) {
  if (userBase) return { base: userBase, source: "user", confident: true };
  const branch = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const recorded = branch && fromReflog(cwd, branch);
  if (recorded) return { ...recorded, confident: true };
  const near = nearestRemote(cwd, branch ?? "");
  return near ? { ...near, confident: false } : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log("Usage: base-branch.mjs [--base <ref>] [--cd <dir>]\nPrints {base, source, confident}. Exit 3: no base found, ask the user.");
  } else {
    const at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
    const found = findBase(resolve(at("--cd") ?? process.cwd()), at("--base"));
    if (found) console.log(JSON.stringify(found));
    else {
      console.error("base-branch: no recorded or nearby base; ask the user which branch this work was cut from");
      process.exitCode = 3;
    }
  }
}
