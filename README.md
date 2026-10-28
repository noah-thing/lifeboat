# Lifeboat

Keep working when your coding agent is rate limited, banned or down. Lifeboat hands the task to the next agent in a chain, and finally to a local model, along with a record of what was asked and what has happened so far.

```
$ lifeboat run "add retry logic to the API client"

chain: claude-code → codex → gemini → grok → aider → opencode → local
› Running on Claude Code (opus) …
✗ Claude Code hit rate_limited.  Failing over.
› Continuing on OpenCode …
✓ OpenCode completed the task.
```

Example output. Which agents appear depends on what you have installed.

## Install

Lifeboat is not on npm yet. Build it from source (Node 22.12 or newer):

```sh
git clone https://github.com/noah-thing/lifeboat
cd lifeboat
npm install
npm link
```

`npm install` also builds, and `npm link` puts `lifeboat` on your PATH.

## Usage

Run these from the project you are working on. With no config of your own, the default chain shrinks to the agents installed on your machine.

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
| `providerChain` | `claude-code`, `codex`, `gemini`, `grok`, `aider`, `opencode`, `local` | Agents to try, in order |
| `providers.<id>.model` | | Model passed to that agent. Empty uses the agent's own default |
| `providers.claude-code.model` | `opus` | An alias that tracks the newest model, or a full model name |
| `providers.claude-code.fallbackModels` | `sonnet`, `haiku` | Passed as `--fallback-model` |
| `providers.<id>.permissionMode` | `acceptEdits` | `acceptEdits`, `bypassPermissions` or `manual`. `bypassPermissions` also lets the agent use the shell and, for Codex, drops its sandbox. Claude Code, Codex, Gemini and Grok read it |
| `providers.<id>.extraArgs` | | Extra flags for the agent command |
| `retry.transientMax` | `2` | Retries on the same agent for transient errors |
| `retry.backoffMs` | `1500` | Wait between those retries |
| `bundleDir` | `.lifeboat` | Where the context bundle lives |

Set `LIFEBOAT_OLLAMA_URL` if Ollama is not on `http://localhost:11434`.

## Supported agents

| Id | Agent | Install |
| --- | --- | --- |
| `claude-code` | [Claude Code](https://docs.anthropic.com/en/docs/claude-code), run headless with `claude -p` | `npm i -g @anthropic-ai/claude-code` |
| `codex` | [Codex CLI](https://github.com/openai/codex), run with `codex exec --json` in the workspace sandbox | `npm i -g @openai/codex` |
| `gemini` | [Gemini CLI](https://github.com/google-gemini/gemini-cli), run with `gemini -p --approval-mode auto_edit` | `npm i -g @google/gemini-cli` |
| `grok` | [Grok CLI](https://x.ai/cli), run with `grok -p` and a workspace sandbox | `curl -fsSL https://x.ai/cli/install.sh \| bash` |
| `aider` | [Aider](https://aider.chat), run with `--yes-always` | `pipx install aider-chat` |
| `opencode` | [OpenCode](https://opencode.ai), run with `opencode run` | `brew install opencode` |
| `local` | A local model through [Ollama](https://ollama.com) | `brew install ollama` |

Each agent is one file in `src/adapters/`. Lifeboat reads each CLI's own JSON output, so a rate limit, a signed out session or an unsupported account is recognised from the agent's real error and not guessed from the exit code.

The local model is chosen from your RAM. Every tag below is in the [Ollama library](https://ollama.com/library):

| RAM | Model | Size |
| --- | --- | --- |
| under 12 GB | `qwen3.5:4b` | 3.3 GB |
| 12 to 23 GB | `qwen3.5:9b` | 6.6 GB |
| 24 to 47 GB | `qwen3.6:27b` | 17 GB |
| 48 to 95 GB | `qwen3.6:35b-a3b` | 24 GB |
| 96 GB and up | `qwen3-coder-next` | 52 GB |

You can pin any other model with `providers.local.model`, for example `devstral-small-2` (15 GB) or `qwen3-coder:30b`.

The reasoning behind these defaults is in [docs/RESEARCH.md](docs/RESEARCH.md).

## Development

```sh
npm test
npm run typecheck
```

## License

MIT
