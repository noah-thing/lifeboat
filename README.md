# 🛟 Lifeboat

**Failover for your AI coding agent. When Claude Code hits a rate limit, ban, or outage, Lifeboat keeps working on Aider, OpenCode, or a local model — carrying your context across.**

Your AI coding agent just got rate-limited in the middle of a task. Or your account hit its cap. Or it got banned and you still don't know why. Lifeboat keeps you working. It hands the same task to another agent, and when every cloud option is gone, to a local model on your own machine. Your context travels with it, so the next agent continues the work instead of starting from a blank page.

```
🛟  Lifeboat
chain: claude-code → aider → opencode → local
› Running on Claude Code (claude-opus-4-8) …
✗ Claude Code hit rate_limited.  Launching the lifeboat →
› Continuing on Aider (claude-sonnet-4-6) …
✓ Aider completed the task.
```

## Why it exists

You build all day on one agent and one account. The day it cuts you off, your work stops cold. No handoff, no portability, often no appeal. Someone on Hacker News put it the way most people feel it: "Anthropic banned me from Claude Code and I don't know what to do."

Lifeboat is the seatbelt for that moment. When the wall hits, you keep moving.

## What it does

1. Runs your task on a primary agent (Claude Code by default).
2. Reads every response for the signs of a wall: a 429, a 529, a quota message, an auth failure, a 503.
3. On a real wall, hands the task to the next agent in your chain and carries a context bundle so the new agent continues.
4. When every cloud agent is gone, drops to a local model through Ollama. Slower, private, no API key, and nothing can ban it.

The context bundle lives in a plain folder you own (`.lifeboat/`). It is the piece that lets a second agent pick up the thread, and it stays yours no matter which provider locks you out.

## Install

Lifeboat is not on npm yet. Install it from this repo and you get a global `lifeboat` command:

```bash
git clone https://github.com/noah-thing/lifeboat
cd lifeboat
pnpm install      # installs deps and builds in one step
npm link          # puts `lifeboat` on your PATH
```

Point it at any project and go:

```bash
cd ~/your-project
lifeboat doctor                  # which agents and local models are ready
lifeboat run "add retry logic to the API client"
```

`doctor` reads your Mac's memory and tells you what to install for a real backup:

```
🛟  Lifeboat doctor
This Mac: 16 GB RAM
Suggested local model: qwen2.5-coder:7b
  sweet spot. ~3.8 GB, fast, solid coding on 16 GB Macs

Failover chain
✓ Claude Code ready
! Aider missing → pipx install aider-chat
! OpenCode missing → brew install opencode
! Local model (Ollama) missing → brew install ollama && ollama serve
```

## Watch it fail over

Force a rate limit and watch the handoff, no waiting for a real one:

```bash
lifeboat run "refactor the auth module" --simulate rate_limited
```

## The failover chain

Lifeboat drives agents you already trust. Each one is a small adapter, so adding another is a single file.

| Provider | Role | What it brings |
| --- | --- | --- |
| Claude Code | primary | Headless `claude -p`, with its own model fallback (Opus → Sonnet → Haiku) |
| Aider | cloud and local | One `--model` flag reaches almost any cloud model and local Ollama |
| OpenCode | agent-level backup | Open source. A different agent and provider for when the Claude subscription itself is the problem |
| Local (Ollama) | last resort | Runs on your machine. No key, no limit, no ban |

Set your own order with `lifeboat config --init`, then edit `.lifeboat/config.json`.

## Autonomy and permissions

The backup runs unattended, so it has to act without stopping to ask. By default Claude Code runs in `acceptEdits` mode: it edits files on its own and leaves the shell alone. For a task that also needs the shell, like installing a dependency or running the tests, give it full autonomy in `.lifeboat/config.json`:

```json
{ "providers": { "claude-code": { "permissionMode": "bypassPermissions" } } }
```

That matches `aider --yes-always` and `cline --yolo`. Use it on projects you trust.

## The local model picks itself

A local fallback is only worth having if it runs well on your actual laptop. Lifeboat reads your RAM and chooses a coding model that fits, using the sizing work in [docs/RESEARCH.md](docs/RESEARCH.md):

| RAM | Model | Notes |
| --- | --- | --- |
| under 12 GB | qwen2.5-coder:3b | emergency tier, small and degraded |
| 16 GB | qwen2.5-coder:7b | the sweet spot, around 3.8 GB, fast |
| 24 to 32 GB | qwen2.5-coder:14b | stronger, around 9 GB |
| 48 GB and up | qwen3-coder:30b | MoE, high quality |

It never reaches for a model your machine cannot hold, so it stays out of the way until the day you need it.

## How it decides to fail over

One small classifier reads each agent's exit code and output, then sorts the result:

- `ok`: the agent finished. Stop here.
- `transient`: a blip. Retry the same agent a couple of times.
- `rate_limited`, `banned`, `outage`: a real wall. Hand off to the next agent.
- `unavailable`: that agent is not installed. Skip it.

A five-second network hiccup will not move you off your primary agent. A 429 will.

## What v1 leaves out

Lifeboat fails over between different providers and down to local. It does not rotate several accounts on the same provider, and it will not create a fresh account after a ban. That path breaks most providers' terms, and it tends to be the very thing that gets people banned. Here, resilience means other providers and your own hardware, not account evasion. That line stays.

## How it differs from a model router

LiteLLM, OpenRouter, and Portkey swap the model while the agent stays put. Claude Code Router and Requesty fail over inside one agent. Lifeboat fails over across whole agents, carries your task context to the new one, reads bans and caps rather than only HTTP codes, and ends at a local model nothing can cut off. No tool in the space covers that whole path today.

## Commands

| Command | What it does |
| --- | --- |
| `lifeboat run "<task>" [-f file ...]` | Run a task with failover |
| `lifeboat doctor` | Check agents, local runtime, and the right model for your RAM |
| `lifeboat status` | Show the current task bundle and its handoff log |
| `lifeboat snapshot "<task>"` | Save a context bundle without running anything |
| `lifeboat config [--init]` | Show the config, or write a default one to edit |

## What works today

- Claude Code as the primary agent runs real tasks headless and edits your files. Verified end to end.
- The failover engine (detect a wall, hand off, carry the bundle, retry a blip, exhaust cleanly) is covered by tests.
- The local fallback talks to Ollama over its OpenAI-compatible API. Covered by tests against a stub server.
- The Aider and OpenCode adapters run their documented headless commands. Install either, set a key, and it joins the chain. If a command or model is wrong, Lifeboat reports the error and moves on. It never fakes a success.

To watch a real cloud-to-local handoff, install Ollama, pull a model, then force a limit:

```bash
brew install ollama && ollama serve &
ollama pull qwen2.5-coder:7b
lifeboat run "any task" --simulate rate_limited
```

## Roadmap

- A live view that shows the handoff as it happens.
- A menubar light: green on Claude, yellow on local backup.
- Bundles that summarize the diff so far, not only the task.
- More adapters (Codex, Cline, Gemini) as drop-in files.

## License

MIT. Build on it.
