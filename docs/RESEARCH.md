# Research behind Lifeboat's defaults

This is a survey of the landscape as of 2026-06-29: which coding agents can stand in for Claude Code, which cloud models continue a task without losing quality, and which local models run well on a MacBook without bogging it down. This doc records the calls Lifeboat ships with and why. Treat exact prices and version numbers as a snapshot; the shape of the decisions is what matters.

## Failover targets (the agents)

Lifeboat needs agents it can drive headless and read for errors. These made the v1 chain or the short list.

| Agent | Headless entry | Verdict | Why |
| --- | --- | --- | --- |
| Claude Code | `claude -p --output-format json` | primary | Built-in model fallback (Opus to Sonnet to Haiku), clean 429/529 surfacing, native on Apple silicon |
| Aider | `aider --yes-always --no-auto-commits --model M --message ...` | in v1 | One adapter reaches almost any cloud model and local Ollama through `--model`. Maximum coverage per line of code |
| OpenCode | `opencode run "..." --format json` | in v1 | Open source, headless, many providers. A true agent-level backup when the Claude subscription itself is the problem |
| Cline | `cline --json "task"` | strong later add | 30+ providers, Ollama support, JSON output. Clean adapter |
| Codex CLI | `codex exec --json "..."` | secondary later | High quality, but subscription only and prone to its own 429s. Heavy artillery, not a first backup |
| Goose | `goose run --recipe r.yaml` | situational | Stable and multi-provider, but lands around 45% on SWE-bench versus Claude Code's 72%, same model. Use with care |
| OpenHands | `openhands --headless -t "..."` | later | Model-agnostic via LiteLLM, but heavier and cannot resume a long task mid-run |
| Gemini CLI | `gemini -p "..."` | skip for now | The research flagged a free-tier shutdown and a closed-source successor. Reach Gemini through the API instead |

The v1 chain stays lean on purpose: Claude Code, then Aider, then OpenCode, then local. Each extra agent is one file in `src/adapters/`, so the chain grows when you want it to.

## Cloud models for continuation

When the failover is at the model level, these continue a coding task without a sharp drop. Aider and OpenCode can route to any of them.

- Anthropic: Opus 4.8 for full agentic work, Sonnet 4.6 as a cheaper continuation with a modest quality trade.
- OpenAI: GPT-5.5 and GPT-5.4 hold up well on coding and expose an OpenAI-compatible API for a clean model swap.
- Google and open weights: Gemini 3.5 Flash for speed, plus DeepSeek, Qwen, Kimi, and GLM through OpenRouter, Groq, Together, or Fireworks at 60 to 80% less cost.
- Aggregators: OpenRouter for zero-ops breadth, LiteLLM if you want a self-hosted router. Both speak the OpenAI format, which keeps adapters simple.

## Local runtime

Four runtimes serve a local model on Apple silicon. Lifeboat targets Ollama first.

| Runtime | Endpoint | Call |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | first choice. `brew install ollama`, one port, scriptable, OpenAI-compatible |
| LM Studio | `http://localhost:1234/v1` | great app, GUI-first, harder to script |
| llama.cpp | `http://localhost:8080` | fastest raw, but you build it and manage models yourself |
| MLX / mlx-lm | `http://localhost:8080` | Apple's own framework, fastest on M4/M5, younger model catalog |

Ollama wins for v1 because it installs in one line, serves a stable OpenAI-compatible endpoint, and answers a health check at `/api/tags`. Lifeboat checks that endpoint before it tries the local fallback.

## Local model sizing

The point of the local fallback is to keep working without slowing the machine. Lifeboat reads your RAM and picks the smallest coding model that still does real work. Numbers below come from the sizing agents.

| RAM | Model | Disk | Notes |
| --- | --- | --- | --- |
| under 12 GB | qwen2.5-coder:3b | ~1.9 GB | Emergency tier. Clarifications and simple refactors, not architecture |
| 16 GB | qwen2.5-coder:7b | ~3.8 GB | The sweet spot. 80 to 150 tok/s on M3/M4, coding-focused |
| 24 to 32 GB | qwen2.5-coder:14b | ~9 GB | Stronger, comfortable headroom |
| 48 GB and up | qwen3-coder:30b | ~19 GB | MoE with 3B active, high quality, fast on MLX |
| 64 GB and up | qwen3-coder-next (80B) | ~26 GB+ | Best quality, for Mac Studio and Max-tier memory |

DeepSeek-Coder-V2-Lite (16B MoE, around 9 GB at Q4, 16 GB RAM and up) is a strong alternative once you have the memory. The picker stays conservative so the model never crowds out your editor and the rest of your work.

## Prior art, and the gap Lifeboat fills

The failover space split into three tiers by 2026:

- Provider-layer routers (LiteLLM, OpenRouter, Portkey): swap the model, keep the agent. No context carryover, no agent switch.
- Agent-native fallback (Claude Code Router, Requesty): fail over inside one agent. Cannot move to a different agent.
- Lifeboat: fail over across whole agents, carry the task context to the next one, classify bans and caps rather than only HTTP codes, and end at a local model nothing can cut off.

That last combination is the open space. Routers solve the model problem. Lifeboat solves the "I lost access and my work stopped" problem.

## Sources

Pricing, model names, and version numbers reflect 2026-06-29 and will drift. The structural calls (Ollama for local, Aider for breadth, RAM-based sizing, agent-level failover as the wedge) are built to outlast the specifics.
