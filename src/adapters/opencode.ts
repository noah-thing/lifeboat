import { execa } from "execa";
import type { Adapter } from "../types.js";
import { classify } from "../detector.js";
import { hasBinary } from "../util.js";
import { buildPrompt, firstLine } from "./shared.js";

export const opencode: Adapter = {
  id: "opencode",
  label: "OpenCode",
  binary: "opencode",
  installHint: "brew install opencode   (or: npm i -g opencode-ai)",
  async isAvailable() {
    return hasBinary("opencode");
  },
  async run(ctx, opts) {
    const args = ["run", buildPrompt(ctx), "--format", "json"];
    if (opts.model) args.push("--model", opts.model);
    if (opts.extraArgs?.length) args.push(...opts.extraArgs);

    const res = await execa("opencode", args, { cwd: ctx.cwd, reject: false, all: true });
    const status = classify({ code: res.exitCode, stdout: res.all, stderr: res.stderr });
    return {
      status,
      provider: "opencode",
      exitCode: res.exitCode ?? undefined,
      output: firstLine(res.all, 500),
      detail: status === "ok" ? undefined : firstLine(res.stderr || res.all),
    };
  },
};
