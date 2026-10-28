import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import type { Adapter, AttemptResult, ProviderOptions } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, errorLine, parseJsonLines, rec, str } from "./shared.js";

// Past this size the prompt goes through --prompt-file instead of the argument list.
const MAX_ARG_PROMPT = 100_000;

/** Headless flags for Grok Build. `promptArgs` is `["-p", text]` or `["--prompt-file", path]`. */
export function grokArgs(cwd: string, opts: ProviderOptions, promptArgs: string[]): string[] {
  const args = ["--output-format", "streaming-json", "--cwd", cwd];
  if (opts.permissionMode === "bypassPermissions") {
    args.push("--permission-mode", "bypassPermissions");
  } else {
    args.push("--permission-mode", opts.permissionMode ?? "acceptEdits", "--sandbox", "workspace");
  }
  if (opts.model) args.push("-m", opts.model);
  if (opts.extraArgs?.length) args.push(...opts.extraArgs);
  args.push(...promptArgs);
  return args;
}

/** Reads streaming-json events: text, error, and a final end event with stopReason and cost. */
export function interpretGrok(
  code: number | undefined,
  stdout: string,
  stderr: string,
): AttemptResult {
  const events = parseJsonLines(stdout);
  let text = "";
  let end: Record<string, unknown> | undefined;
  let failure: string | undefined;
  for (const ev of events) {
    if (ev.type === "text") {
      text += str(ev.data) ?? "";
    } else if (ev.type === "end") {
      end = ev;
      const reason = str(ev.stopReason);
      if (reason === "error" || reason === "refusal") {
        failure = str(ev.error) ?? str(ev.message) ?? `Grok stopped: ${reason}`;
      }
    } else if (ev.type === "error") {
      failure = str(ev.message) ?? str(ev.data) ?? str(rec(ev.error)?.message) ?? failure;
    }
  }
  const costUsd = typeof end?.total_cost_usd === "number" ? end.total_cost_usd : undefined;

  if (code === 0 && end && !failure) {
    return { status: "ok", provider: "grok", exitCode: 0, output: text.trim() || undefined, costUsd };
  }
  const hay = failure ?? (stderr || stdout);
  return {
    status: classify({ code: code === 0 ? 1 : code, stdout: hay }),
    provider: "grok",
    exitCode: code,
    output: text.trim() || undefined,
    detail: errorLine(hay),
    costUsd,
  };
}

export const grok: Adapter = {
  id: "grok",
  label: "Grok CLI",
  binary: "grok",
  installHint: "curl -fsSL https://x.ai/cli/install.sh | bash   (then: grok login)",
  async isAvailable() {
    if (!(await hasBinary("grok"))) return false;
    // Other tools are also called grok (a log pattern matcher, an unrelated npm CLI), so check the version banner.
    const v = await execa("grok", ["--version"], { reject: false, stdin: "ignore" });
    return /^grok \d/i.test(v.stdout.trim());
  },
  async run(ctx, opts) {
    const prompt = buildPrompt(ctx);
    let tmp: string | undefined;
    let promptArgs = ["-p", prompt];
    if (prompt.length > MAX_ARG_PROMPT) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lifeboat-grok-"));
      const file = path.join(tmp, "prompt.txt");
      fs.writeFileSync(file, prompt);
      promptArgs = ["--prompt-file", file];
    }
    try {
      const res = await execa("grok", grokArgs(ctx.cwd, opts, promptArgs), {
        cwd: ctx.cwd,
        reject: false,
        stdin: "ignore",
      });
      return interpretGrok(res.exitCode, res.stdout, res.stderr);
    } finally {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
};
