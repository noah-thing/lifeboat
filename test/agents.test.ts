import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codexArgs, interpretCodex } from "../src/adapters/codex";
import { geminiArgs, interpretGemini } from "../src/adapters/gemini";
import { grokArgs, interpretGrok } from "../src/adapters/grok";
import { getAdapter } from "../src/adapters/index";
import { DEFAULT_CONFIG } from "../src/config";

const fx = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("codex", () => {
  it("reads a finished turn as ok", () => {
    const r = interpretCodex(0, fx("codex-ok.jsonl"), "");
    expect(r.status).toBe("ok");
    expect(r.output).toBe("ok");
  });

  it("reads a usage limit as rate_limited", () => {
    const r = interpretCodex(1, fx("codex-usage-limit.jsonl"), "");
    expect(r.status).toBe("rate_limited");
    expect(r.detail).toMatch(/usage limit/);
  });

  it("ignores MCP login noise on stderr when the turn completed", () => {
    expect(interpretCodex(0, fx("codex-ok.jsonl"), fx("codex-stderr-noise.txt")).status).toBe("ok");
  });

  it("treats a clean exit with no finished turn as transient", () => {
    expect(interpretCodex(0, "", "").status).toBe("transient");
  });

  it("runs in the workspace sandbox unless told otherwise", () => {
    const a = codexArgs({});
    expect(a.slice(0, 3)).toEqual(["exec", "--json", "--skip-git-repo-check"]);
    expect(a).toContain("workspace-write");
    expect(a.at(-1)).toBe("-");
    expect(codexArgs({ permissionMode: "bypassPermissions" })).toContain(
      "--dangerously-bypass-approvals-and-sandbox",
    );
    expect(codexArgs({ model: "gpt-x" })).toEqual(expect.arrayContaining(["-m", "gpt-x"]));
  });
});

describe("gemini", () => {
  it("collects the assistant text on success", () => {
    const r = interpretGemini(0, fx("gemini-ok.jsonl"), "");
    expect(r.status).toBe("ok");
    expect(r.output).toBe("ok");
  });

  it("reads RESOURCE_EXHAUSTED as rate_limited", () => {
    expect(interpretGemini(1, fx("gemini-quota.jsonl"), "").status).toBe("rate_limited");
  });

  it("reads an ineligible tier as banned and names the cause", () => {
    const r = interpretGemini(1, "", fx("gemini-ineligible.txt"));
    expect(r.status).toBe("banned");
    expect(r.detail).toMatch(/IneligibleTierError/);
  });

  it("maps permission modes to approval modes", () => {
    expect(geminiArgs({})).toEqual(expect.arrayContaining(["--approval-mode", "auto_edit"]));
    expect(geminiArgs({ permissionMode: "bypassPermissions" })).toContain("yolo");
  });
});

describe("grok", () => {
  it("returns the text and the reported cost", () => {
    const r = interpretGrok(0, fx("grok-ok.jsonl"), "");
    expect(r.status).toBe("ok");
    expect(r.output).toBe("ok");
    expect(r.costUsd).toBeCloseTo(0.047008);
  });

  it("reads an error end event as rate_limited", () => {
    expect(interpretGrok(1, fx("grok-error.jsonl"), "").status).toBe("rate_limited");
  });

  it("reads a signed out message as banned", () => {
    expect(interpretGrok(1, "", fx("grok-signed-out.txt")).status).toBe("banned");
  });

  it("sandboxes to the workspace by default", () => {
    const a = grokArgs("/p", {}, ["-p", "hi"]);
    expect(a).toEqual(expect.arrayContaining(["--sandbox", "workspace", "--cwd", "/p"]));
    expect(a.slice(-2)).toEqual(["-p", "hi"]);
  });
});

describe("default chain", () => {
  it("lists every adapter, local last, and every id is registered", () => {
    expect(DEFAULT_CONFIG.providerChain).toEqual([
      "claude-code",
      "codex",
      "gemini",
      "grok",
      "aider",
      "opencode",
      "local",
    ]);
    for (const id of DEFAULT_CONFIG.providerChain) expect(getAdapter(id)).toBeDefined();
  });
});
