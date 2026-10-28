import { execa } from "execa";
import type { Adapter } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, firstLine } from "./shared.js";

export const aider: Adapter = {
  id: "aider",
  label: "Aider",
  binary: "aider",
  installHint: "pipx install aider-chat   (or: python -m pip install aider-chat)",
  async isAvailable() {
    return hasBinary("aider");
  },
  async run(ctx, opts) {
    const args = ["--yes-always", "--no-auto-commits"];
    if (opts.model) args.push("--model", opts.model);
    if (opts.extraArgs?.length) args.push(...opts.extraArgs);
    args.push("--message", buildPrompt(ctx));
    args.push(...ctx.files);

    const res = await execa("aider", args, { cwd: ctx.cwd, reject: false, all: true });
    const status = classify({ code: res.exitCode, stdout: res.all, stderr: res.stderr });
    return {
      status,
      provider: "aider",
      exitCode: res.exitCode ?? undefined,
      output: firstLine(res.all, 500),
      detail: status === "ok" ? undefined : firstLine(res.stderr || res.all),
    };
  },
};
