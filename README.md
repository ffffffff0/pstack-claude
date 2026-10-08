# pstack

A maintained fork of pstack for Claude Code and Codex (Pi and GitHub Copilot work too). It tracks Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack) for Cursor and Michael Denyer's [port](https://github.com/michael-denyer/pstack-claude), and adds what we need on top. Every local difference is declared in [`tools/forks.json`](tools/forks.json), and [CHANGES.md](CHANGES.md) records each release.

Tell `poteto-mode` your goal and it will invoke the correct workflow for the task. It keeps your code concise, simple and verified.

## What this fork adds

- **Cross-family panels.** `interrogate`, `arena`, and `architect` can seat GPT models next to Claude ones through `cross-run.mjs`, so a review or a design race is not one model family agreeing with itself. A seat that fails falls back to a single-family panel.
- **Branch-aware review.** Diffs are taken against the branch the worktree was cut from, not `main`. Set `git config pstack.baseBranches "origin/DEV-*"` to sharpen the guess.
- **Read-only reviewers at any effort.** Explorers, reviewers, and judges run on `pstack:reviewer-<level>` agents, which cannot edit files.
- **A fast code model.** Routine code delegates run on a fast tier, while judgment and the hardest changes stay on the strongest model.
- **Faster upstream sync.** Cursor releases are merged here directly, without waiting for the next port release.

## Install

### Claude Code

Run in Claude Code:

```text
/plugin marketplace add ffffffff0/pstack-claude
/plugin install pstack@pstack-claude
```

### Codex

Run in your terminal:

```shell
codex plugin marketplace add ffffffff0/pstack-claude
codex plugin add pstack@pstack-claude
```

### Pi

Run in your terminal:

```shell
pi install git:github.com/ffffffff0/pstack-claude
```

The package loads the skills and the pstack Pi extension, which adds the subagent, question, and wake-up tools the skills use, plus `/loop` and the routing instruction. Invoke a skill with `/skill:<name>`.

### GitHub Copilot

Run in your terminal:

```shell
copilot plugin marketplace add ffffffff0/pstack-claude
copilot plugin install pstack@pstack-claude
```

This installs pstack for the Copilot CLI and the GitHub Copilot app, which share `~/.copilot`. Start a new session afterwards. Copilot ships no default pstack models, so the first skill that needs one runs `setup-pstack` to pick from the models your account lists, and later sessions reuse that choice.

The Copilot build is tested on Copilot CLI 1.0.87 through 1.0.92. On those versions the routing hook's context reaches the session alongside other plugins' session-start context. If a later version keeps only one plugin's context, `setup-pstack` offers a [standing instruction](plugins/pstack/skills/setup-pstack/copilot.md#wire-it-in) for `~/.copilot/copilot-instructions.md` instead. On 1.0.92, once the CLI caches its computer-use experiment assignment, `copilot -p` sessions list no plugin skills and a `skill` call returns "Skill not found". Interactive sessions, the hooks, and the agents are unaffected.

Run `setup-pstack` to change model defaults, set a reasoning effort per role (for example `arena runners: opus @xhigh, fable @max`, which Claude Code dispatches through the plugin's `pstack:effort-<level>` or `pstack:poteto-agent-<level>` agents; roles without a level keep the session's effort unless the sheet's `default effort` line names one), or turn automatic routing off. The plugin installs the routing hook on Claude Code, Codex, and GitHub Copilot; Codex asks you to trust it through `/hooks` before it runs. On Pi the extension injects the same routing instruction. In Claude Code and the Copilot CLI, use `/pstack:setup-pstack`.

For Prime Agent, OpenCode, Gemini CLI, or skills-only installs for any harness, see [shared installation](docs/reference.md#shared-skills-installation).

## Getting started

```text
Use poteto-mode to fix the search filter resetting when I change pages.
```

For a bug, it reproduces the failure, uses `how` and `why` to investigate, delegates the fix, then reruns the failing case. If the fix crosses a function boundary, it brings in `architect` before implementation. You receive the fix and the failing and passing evidence.

[Other playbooks](plugins/pstack/skills/poteto-mode/SKILL.md#playbooks) cover planning, features, refactoring, performance issues, investigations, prototypes, PR maintenance, shipping, and longer projects.

![poteto-mode on Claude Code, Codex, and Pi turns a request into verified work. Choose a playbook, plan and delegate with architect, arena, or swarm, then review and verify with interrogate, tests, and measurements. Project playbooks customize the workflow, and setup-pstack configures the model and reasoning effort per role. Supporting skills include how, why, and unslop.](assets/pstack-overview.png)

## Details

- [Skills and slash commands](docs/reference.md#slash-commands)
- [Runtime setup](docs/reference.md#runtime-support)
- [Models and dependencies](docs/reference.md#configuration-and-dependencies)
- [Maintenance and port scope](docs/reference.md#maintenance)

## Data handling

pstack has no server or telemetry. Anything its skills ask your agent to read, including session transcripts, goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.

## Contributing

Issues and pull requests are welcome at [ffffffff0/pstack-claude](https://github.com/ffffffff0/pstack-claude). See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks and where your change belongs. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

This fork is [MIT-licensed](LICENSE). The port it builds on is © 2026 Michael Denyer. Original pstack © 2026 Lauren Tan; imported cursor-team-kit skills © 2026 Cursor. See [LICENSE-cursor-team-kit](LICENSE-cursor-team-kit) and [NOTICE.md](NOTICE.md).
