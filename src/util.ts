import os from "node:os";
import { execa } from "execa";
import pc from "picocolors";

/** Total physical RAM in GiB (rounded). */
export function totalRamGB(): number {
  return Math.round(os.totalmem() / 1024 ** 3);
}

/** Is a command on PATH? (darwin/linux) */
export async function hasBinary(cmd: string): Promise<boolean> {
  try {
    await execa("command", ["-v", cmd], { shell: true });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort: is something serving an HTTP endpoint? */
export async function canReach(url: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export const log = {
  info: (m: string) => console.log(m),
  dim: (m: string) => console.log(pc.dim(m)),
  ok: (m: string) => console.log(`${pc.green("✓")} ${m}`),
  warn: (m: string) => console.log(`${pc.yellow("!")} ${m}`),
  err: (m: string) => console.log(`${pc.red("✗")} ${m}`),
  step: (m: string) => console.log(`${pc.cyan("›")} ${m}`),
  title: (m: string) => console.log(`\n${pc.bold(m)}`),
};

export const c = pc;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function nowISO(): string {
  return new Date().toISOString();
}
