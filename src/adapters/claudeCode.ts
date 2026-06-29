import { execa } from "execa";
import type { Adapter } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, firstLine, tryJSON } from "./shared.js";

/** The shape of `claude -p --output-format json` we care about. */
interface ClaudeResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: string | null;
  result?: string;
  total_cost_usd?: number;
}

/**
 * Primary agent. Runs headless with `claude -p`, edits files under the chosen
 * permission mode, and falls back across its own models before Lifeboat ever
 * has to switch agents.
 */
export const claudeCode: Adapter = {
  id: "claude-code",
  label: "Claude Code",
  binary: "claude",
  installHint: "npm i -g @anthropic-ai/claude-code",
  async isAvailable() {
    return hasBinary("claude");
  },
  async run(ctx, opts) {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--permission-mode",
      opts.permissionMode ?? "acceptEdits",
    ];
    if (opts.model) args.push("--model", opts.model);
    if (opts.fallbackModels?.length) {
      args.push("--fallback-model", opts.fallbackModels.join(","));
    }
    if (opts.extraArgs?.length) args.push(...opts.extraArgs);
    args.push(buildPrompt(ctx));

    const res = await execa("claude", args, { cwd: ctx.cwd, reject: false, all: true });
    const parsed = tryJSON(res.stdout) as ClaudeResult | null;

    // Trust Claude Code's own success signal when we can read it.
    if (res.exitCode === 0 && parsed?.subtype === "success" && parsed.is_error !== true) {
      return {
        status: "ok",
        provider: "claude-code",
        exitCode: 0,
        output: parsed.result ?? firstLine(res.stdout, 500),
        costUsd: parsed.total_cost_usd,
      };
    }

    // Otherwise classify from the error fields Claude gives us, plus stderr.
    const status = classify({
      code: res.exitCode,
      stdout: `${parsed?.api_error_status ?? ""} ${parsed?.result ?? res.stdout}`,
      stderr: res.stderr,
    });
    return {
      status,
      provider: "claude-code",
      exitCode: res.exitCode ?? undefined,
      output: parsed?.result ?? firstLine(res.stdout, 500),
      detail: firstLine(parsed?.api_error_status ?? res.stderr ?? parsed?.result),
      costUsd: parsed?.total_cost_usd,
    };
  },
};
