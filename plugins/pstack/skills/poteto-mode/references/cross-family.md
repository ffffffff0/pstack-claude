# Cross-family seats

Upstream's panels span model families on purpose: two models from one family share blind spots, so their agreement is weak evidence. The port keeps one seat on the other family. A role entry from the other family is a **cross-family seat**: on Claude Code a `gpt-*` slug, on Codex a `claude-*` slug (the role's Models section names the defaults). The `Agent` tool and `spawn_agent` cannot run it, so it runs through `cross-run.mjs` under the installed plugin.

## Run a seat

1. Write the seat's full brief to a file in a fresh temp directory outside the repo (`mktemp -d`), and its `--out` there too, so the worktree under review stays clean. The brief is the same filled template the in-family seats get, with the diff or file contents inline. A read-only Claude seat has Read, Grep, and Glob but no shell.
2. Launch it in the background, in the same message as the in-family seats:

   ```shell
   node <plugin>/skills/poteto-mode/scripts/cross-run.mjs --model <slug> --prompt-file <brief> --out <result> [--cd <repo>] [--write] [--timeout <sec>]
   ```

   `--write` only for a seat that must edit, such as an arena runner in its own worktree. A model value may carry an effort after `@`, as in `<slug>@xhigh`.
3. Wait for the command, then read `<result>`. Exit 0 means the seat answered. Treat its output exactly like an in-family seat's.

## Fallback

A non-zero exit means the other family is unreachable (billing, network, a sandbox without network). Read the last lines of `<result>.log` for the reason, rerun that seat in-family on the role's `default` model, and say in the verdict that the panel ran single-family and why. Never present a single-family panel as cross-family.

On Codex, a read-only sandbox has no network, so a cross-family seat needs a session that allows network.
