# Changelog

## 0.2.0 (2026-10-28)

- Added Codex CLI, Gemini CLI and Grok CLI as failover agents. Each runs headless with its JSON output and is classified from its own events: usage limits, `RESOURCE_EXHAUSTED`, signed out sessions and unsupported accounts, dropped streams.
- New default chain: `claude-code`, `codex`, `gemini`, `grok`, `aider`, `opencode`, `local`. With no config file, `lifeboat run` keeps only the agents installed on the machine.
- `permissionMode` now applies to Codex, Gemini and Grok as well as Claude Code. Claude Code's `default` is called `manual` in the current CLI; both work for Gemini.
- Detector knows more signals: `IneligibleTierError`, "not logged in", "hit your usage limit", `usage_limit_reached`, `RESOURCE_EXHAUSTED`, "stream disconnected", "at capacity".
- Local model table moved to the Qwen 3.5 and 3.6 families, which are what Ollama's library now offers for each RAM tier. `qwen3-coder-next` is 52 GB, so it starts at 96 GB of RAM.
- `lifeboat --version` reads the version from `package.json`.
- Dependencies: commander 15, execa 10, zod 4, vitest 5, tsx and @types/node patch bumps. TypeScript stays on 5.9: 7.x did not resolve the Node types with the current tsconfig. Node 22.12 or newer is now required, as commander, execa and vitest need it.
- Added a GitHub Actions workflow that typechecks, tests and builds on Node 22 and 24.

## 0.1.0 (2026-06-29)

First release: Claude Code, Aider, OpenCode and Ollama with failover and a context bundle.
