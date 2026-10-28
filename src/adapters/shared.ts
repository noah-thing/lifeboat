import type { RunContext } from "../types.js";

// After a failover the bundle goes first, so the new agent continues the work.
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

/** Parses newline-delimited JSON, skipping lines that are not JSON (CLIs mix log noise into stdout). */
export function parseJsonLines(text: string | undefined): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of (text ?? "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    const v = tryJSON(t);
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Record<string, unknown>);
  }
  return out;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** The most telling line of an error dump: the first one that names an error, else the first line. */
export function errorLine(s: string | undefined, max = 240): string | undefined {
  if (!s) return undefined;
  const hit = s
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /error|fail|denied|limit|quota|exhausted|unauthor|log ?in|sign/i.test(l));
  return firstLine(hit ?? s, max);
}
