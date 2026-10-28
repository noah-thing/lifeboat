import { execa } from "execa";
import type { Adapter, AttemptResult, ProviderOptions } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, errorLine, firstLine, parseJsonLines, rec, str } from "./shared.js";

/** Headless flags for `codex exec`. The prompt goes in on stdin (the trailing `-`). */
export function codexArgs(opts: ProviderOptions): string[] {
  const args = ["exec", "--json", "--skip-git-repo-check"];
  if (opts.permissionMode === "bypassPermissions") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    // Writes stay inside the workspace, and a blocked action fails instead of waiting for a prompt nobody sees.
    args.push("-s", "workspace-write", "-c", 'approval_policy="never"');
  }
  if (opts.model) args.push("-m", opts.model);
  if (opts.extraArgs?.length) args.push(...opts.extraArgs);
  args.push("-");
  return args;
}

/** Reads `codex exec --json` events: item.completed (agent_message), turn.completed, turn.failed, error. */
export function interpretCodex(
  code: number | undefined,
  stdout: string,
  stderr: string,
): AttemptResult {
  const events = parseJsonLines(stdout);
  let text: string | undefined;
  let completed = false;
  let failure: string | undefined;
  for (const ev of events) {
    if (ev.type === "item.completed") {
      const item = rec(ev.item);
      if (item?.type === "agent_message") text = str(item.text) ?? text;
    } else if (ev.type === "turn.completed") {
      completed = true;
    } else if (ev.type === "turn.failed") {
      failure = str(rec(ev.error)?.message) ?? failure ?? "turn failed";
    } else if (ev.type === "error") {
      failure = failure ?? str(ev.message);
    }
  }

  if (code === 0 && completed && !failure) {
    return { status: "ok", provider: "codex", exitCode: 0, output: text };
  }
  // stderr carries unrelated MCP login noise, so it is only read when no event explained the failure.
  const hay = failure ?? (stderr || stdout);
  return {
    status: classify({ code: code === 0 ? 1 : code, stdout: hay }),
    provider: "codex",
    exitCode: code,
    output: text,
    detail: errorLine(hay),
  };
}

export const codex: Adapter = {
  id: "codex",
  label: "Codex CLI",
  binary: "codex",
  installHint: "npm i -g @openai/codex   (or: brew install codex)",
  async isAvailable() {
    return hasBinary("codex");
  },
  async run(ctx, opts) {
    const res = await execa("codex", codexArgs(opts), {
      cwd: ctx.cwd,
      reject: false,
      input: buildPrompt(ctx),
    });
    const r = interpretCodex(res.exitCode, res.stdout, res.stderr);
    return { ...r, output: r.output ?? firstLine(res.stdout, 500) };
  },
};
