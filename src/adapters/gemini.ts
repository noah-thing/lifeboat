import { execa } from "execa";
import type { Adapter, AttemptResult, ProviderOptions } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, errorLine, parseJsonLines, rec, str } from "./shared.js";

const APPROVAL: Record<string, string> = {
  default: "default",
  manual: "default",
  acceptEdits: "auto_edit",
  bypassPermissions: "yolo",
};

/** Headless flags for Gemini CLI. The prompt arrives on stdin and `-p` only points at it. */
export function geminiArgs(opts: ProviderOptions): string[] {
  const args = [
    "--output-format",
    "stream-json",
    "--skip-trust",
    "--approval-mode",
    APPROVAL[opts.permissionMode ?? "acceptEdits"] ?? "auto_edit",
  ];
  if (opts.model) args.push("-m", opts.model);
  if (opts.extraArgs?.length) args.push(...opts.extraArgs);
  args.push("-p", "Follow the request above.");
  return args;
}

/** Reads stream-json events: message (assistant), error, and a final result with a status. */
export function interpretGemini(
  code: number | undefined,
  stdout: string,
  stderr: string,
): AttemptResult {
  const events = parseJsonLines(stdout);
  let text = "";
  let sawResult = false;
  let failure: string | undefined;
  for (const ev of events) {
    if (ev.type === "message" && ev.role === "assistant") {
      text += str(ev.content) ?? "";
    } else if (ev.type === "error") {
      if (ev.severity === "error") failure = str(ev.message) ?? failure;
    } else if (ev.type === "result") {
      sawResult = true;
      if (ev.status !== undefined && ev.status !== "success") {
        failure = str(rec(ev.error)?.message) ?? failure ?? "Gemini CLI reported an error";
      }
    }
  }

  if (code === 0 && sawResult && !failure) {
    return { status: "ok", provider: "gemini", exitCode: 0, output: text.trim() || undefined };
  }
  // Sign-in and tier errors are printed to stderr and exit before any event is emitted.
  const hay = failure ?? (stderr || stdout);
  return {
    status: classify({ code: code === 0 ? 1 : code, stdout: hay }),
    provider: "gemini",
    exitCode: code,
    output: text.trim() || undefined,
    detail: errorLine(hay),
  };
}

export const gemini: Adapter = {
  id: "gemini",
  label: "Gemini CLI",
  binary: "gemini",
  installHint: "npm i -g @google/gemini-cli   (or: brew install gemini-cli)",
  async isAvailable() {
    return hasBinary("gemini");
  },
  async run(ctx, opts) {
    const res = await execa("gemini", geminiArgs(opts), {
      cwd: ctx.cwd,
      reject: false,
      input: buildPrompt(ctx),
    });
    return interpretGemini(res.exitCode, res.stdout, res.stderr);
  },
};
