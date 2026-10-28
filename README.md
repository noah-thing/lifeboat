# Lifeboat

Keep working when your coding agent is rate limited, banned or down. Lifeboat hands the task to the next agent in a chain, and finally to a local model, along with a record of what was asked and what has happened so far.

```
$ lifeboat run "add retry logic to the API client"

chain: claude-code → aider → opencode → local
› Running on Claude Code (opus) …
✗ Claude Code hit rate_limited.  Failing over.
› Continuing on OpenCode …
✓ OpenCode completed the task.
```

Example output. Which agents appear depends on what you have installed.

## Install

Lifeboat is not on npm yet. Build it from source (Node 20 or newer):

```sh
git clone https://github.com/noah-thing/lifeboat
cd lifeboat
npm install
npm link
```

`npm install` also builds, and `npm link` puts `lifeboat` on your PATH.

## Usage

Run these from the project you are working on.

```sh
lifeboat doctor                          # which agents are installed, and a local model for your RAM
lifeboat run "refactor the auth module"  # run a task with failover
lifeboat run "fix the flaky test" -f test/api.test.ts
```

To see a handoff without waiting for a real limit, force one on the first agent that runs:

```sh
lifeboat run "any task" --simulate rate_limited
```

Other commands:

| Command | Does |
| --- | --- |
| `lifeboat run "<task>"` | Run a task. Options: `-f, --file <files...>`, `--chain <ids>`, `--dry-run`, `--simulate <status>`, `--simulate-provider <id>` |
| `lifeboat doctor` | Check agents and Ollama, and suggest a local model |
| `lifeboat status` | Show the current task and its handoff log |
| `lifeboat snapshot "<task>"` | Save the context bundle without running anything |
| `lifeboat config [--init]` | Print the config, or write a default one to edit |

## How failover works

Lifeboat runs the task on each agent in your chain, in order, and classifies every result from the exit code and the output: `ok`, `transient`, `rate_limited`, `banned`, `outage` or `unavailable`. A transient error is retried on the same agent, twice by default. A rate limit, ban or outage moves to the next agent. An agent that is not installed is skipped. If every cloud agent fails, the chain ends at a local model through Ollama.

The context is a folder called `.lifeboat/` in your project. It holds the task, the files in scope and a log of each handoff. The next agent gets that bundle in its prompt, with an instruction to read the repo, keep the work already done and finish the task.

Lifeboat switches between providers. It does not rotate accounts on one provider, because that breaks their terms.

## Configuration

`lifeboat config --init` writes `.lifeboat/config.json`. Edit it to change the order or pin models.

| Key | Default | Meaning |
| --- | --- | --- |
| `providerChain` | `claude-code`, `aider`, `opencode`, `local` | Agents to try, in order |
| `providers.<id>.model` | | Model passed to that agent |
| `providers.claude-code.fallbackModels` | `sonnet`, `haiku` | Passed as `--fallback-model` |
| `providers.claude-code.permissionMode` | `acceptEdits` | Set `bypassPermissions` if the task also needs the shell |
| `providers.<id>.extraArgs` | | Extra flags for the agent command |
| `retry.transientMax` | `2` | Retries on the same agent for transient errors |
| `retry.backoffMs` | `1500` | Wait between those retries |
| `bundleDir` | `.lifeboat` | Where the context bundle lives |

Set `LIFEBOAT_OLLAMA_URL` if Ollama is not on `http://localhost:11434`.

## Supported agents

| Id | Agent | Install |
| --- | --- | --- |
| `claude-code` | [Claude Code](https://docs.anthropic.com/en/docs/claude-code), run headless with `claude -p` | `npm i -g @anthropic-ai/claude-code` |
| `aider` | [Aider](https://aider.chat), run with `--yes-always` | `pipx install aider-chat` |
| `opencode` | [OpenCode](https://opencode.ai), run with `opencode run` | `brew install opencode` |
| `local` | A local model through [Ollama](https://ollama.com) | `brew install ollama` |

Each agent is one file in `src/adapters/`. The local model is chosen from your RAM:

| RAM | Model |
| --- | --- |
| under 12 GB | `qwen2.5-coder:3b` |
| 12 to 19 GB | `qwen2.5-coder:7b` |
| 20 to 35 GB | `qwen2.5-coder:14b` |
| 36 GB and up | `qwen3-coder:30b` |

The reasoning behind these defaults is in [docs/RESEARCH.md](docs/RESEARCH.md).

## Development

```sh
npm test
npm run typecheck
```

## License

MIT
