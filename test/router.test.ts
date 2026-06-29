import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWithFailover } from "../src/router";
import type { Adapter, Status } from "../src/types";
import type { Config } from "../src/config";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "lb-router-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A controllable agent. Each call returns the next status in the list. */
function stub(id: string, statuses: Status[], available = true): Adapter {
  let i = 0;
  return {
    id,
    label: id,
    binary: id,
    installHint: "",
    isAvailable: async () => available,
    run: async () => {
      const s = statuses[Math.min(i, statuses.length - 1)] ?? "ok";
      i += 1;
      return { status: s, provider: id };
    },
  };
}

function cfg(chain: string[], transientMax = 1): Config {
  return {
    providerChain: chain,
    providers: {},
    retry: { transientMax, backoffMs: 1 },
    bundleDir: ".lifeboat",
  };
}

function manifest(cwd: string): { history: Array<{ provider: string; status: string }>; status: string } {
  return JSON.parse(readFileSync(join(cwd, ".lifeboat", "manifest.json"), "utf8"));
}

describe("runWithFailover", () => {
  it("finishes on the first agent when it succeeds", async () => {
    const cwd = tmp();
    const map: Record<string, Adapter> = { a: stub("a", ["ok"]), b: stub("b", ["ok"]) };
    const out = await runWithFailover({
      task: "t",
      files: [],
      cwd,
      config: cfg(["a", "b"]),
      resolveAdapter: (id) => map[id],
    });
    expect(out.finalStatus).toBe("completed");
    expect(out.winner).toBe("a");
    expect(manifest(cwd).status).toBe("done");
  });

  it("fails over to the next agent and records the handoff", async () => {
    const cwd = tmp();
    const map: Record<string, Adapter> = { a: stub("a", ["rate_limited"]), b: stub("b", ["ok"]) };
    const out = await runWithFailover({
      task: "t",
      files: [],
      cwd,
      config: cfg(["a", "b"]),
      resolveAdapter: (id) => map[id],
    });
    expect(out.finalStatus).toBe("completed");
    expect(out.winner).toBe("b");
    const m = manifest(cwd);
    expect(m.history.some((h) => h.provider === "a" && h.status === "rate_limited")).toBe(true);
  });

  it("exhausts the chain when every agent hits a wall", async () => {
    const cwd = tmp();
    const map: Record<string, Adapter> = { a: stub("a", ["outage"]), b: stub("b", ["banned"]) };
    const out = await runWithFailover({
      task: "t",
      files: [],
      cwd,
      config: cfg(["a", "b"]),
      resolveAdapter: (id) => map[id],
    });
    expect(out.finalStatus).toBe("exhausted");
    expect(manifest(cwd).status).toBe("failed");
  });

  it("retries a transient blip on the same agent before giving up", async () => {
    const cwd = tmp();
    const a = stub("a", ["transient", "ok"]);
    const out = await runWithFailover({
      task: "t",
      files: [],
      cwd,
      config: cfg(["a"], 1),
      resolveAdapter: () => a,
    });
    expect(out.finalStatus).toBe("completed");
    expect(out.winner).toBe("a");
    // one initial attempt + one retry
    expect(out.attempts.length).toBe(2);
  });

  it("skips an agent that is not installed", async () => {
    const cwd = tmp();
    const map: Record<string, Adapter> = {
      a: stub("a", ["ok"], false), // not available
      b: stub("b", ["ok"]),
    };
    const out = await runWithFailover({
      task: "t",
      files: [],
      cwd,
      config: cfg(["a", "b"]),
      resolveAdapter: (id) => map[id],
    });
    expect(out.finalStatus).toBe("completed");
    expect(out.winner).toBe("b");
  });
});
