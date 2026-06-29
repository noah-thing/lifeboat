import type { RunContext } from "../types.js";

/**
 * Build the prompt handed to an agent. When Lifeboat is resuming after a
 * failover, the bundle goes first so the new agent picks up the thread instead
 * of starting over.
 */
export function buildPrompt(ctx: RunContext): string {
  const parts: string[] = [];
  if (ctx.resumed && ctx.bundleText) {
    parts.push(
      "You are taking over an in-progress coding task. The previous agent was cut off (rate limit, ban, or outage).",
      "Here is the shared Lifeboat context bundle:",
      "",
      ctx.bundleText,
      "",
      "Continue from where it left off. Read the repo first, keep what is already done, and finish the task below.",
      "",
    );
  }
  parts.push(`Task: ${ctx.task}`);
  if (ctx.files.length) parts.push(`Files in scope: ${ctx.files.join(", ")}`);
  return parts.join("\n");
}

export function firstLine(s: string | undefined, max = 240): string | undefined {
  if (!s) return undefined;
  const line = s
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return undefined;
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

export function tryJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
