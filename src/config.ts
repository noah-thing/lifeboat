import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { totalRamGB } from "./util.js";

export const ProviderOptionsSchema = z.object({
  model: z.string().optional(),
  fallbackModels: z.array(z.string()).optional(),
  permissionMode: z.string().optional(),
  runtime: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  providerChain: z.array(z.string()),
  providers: z.record(ProviderOptionsSchema),
  retry: z.object({
    transientMax: z.number().int().min(0),
    backoffMs: z.number().int().min(0),
  }),
  bundleDir: z.string(),
});
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default failover chain (from the 20-agent research, docs/RESEARCH.md):
 *   claude-code  → primary baseline; has its own model fallback
 *   aider        → universal multi-provider workhorse (cloud + local in one)
 *   opencode     → open-source AGENT-level failover (a different agent, not just a model)
 *   local        → Ollama last resort, never goes down, no API key
 */
export const DEFAULT_CONFIG: Config = {
  providerChain: ["claude-code", "aider", "opencode", "local"],
  providers: {
    "claude-code": {
      // aliases track the latest models, so this keeps working across releases
      model: "opus",
      fallbackModels: ["sonnet", "haiku"],
      // acceptEdits lets the backup edit files headlessly without prompting.
      // Set "bypassPermissions" for fully unattended runs that also use the shell.
      permissionMode: "acceptEdits",
    },
    // aider and opencode use whatever model their own config/env points at, so
    // they work as soon as you have a key set. Pin one here if you want.
    aider: {},
    opencode: {},
    local: { runtime: "ollama", model: "auto" },
  },
  retry: { transientMax: 2, backoffMs: 1500 },
  bundleDir: ".lifeboat",
};

/**
 * Pick a local coding model by available RAM. Tiers + numbers come straight
 * from the sizing research: qwen2.5-coder is the coding-focused sweet spot;
 * we only scale up when the unified memory is actually there, so Lifeboat
 * never bloats or thrashes the machine.
 */
export function recommendLocalModel(ramGB = totalRamGB()): { model: string; note: string } {
  if (ramGB < 12)
    return { model: "qwen2.5-coder:3b", note: "emergency tier. ~1.9 GB, degraded but okay for clarifications and simple refactors" };
  if (ramGB < 20)
    return { model: "qwen2.5-coder:7b", note: "sweet spot. ~3.8 GB, fast, solid coding on 16 GB Macs" };
  if (ramGB < 36)
    return { model: "qwen2.5-coder:14b", note: "stronger. ~9 GB, comfortable on 24 to 32 GB" };
  if (ramGB < 56)
    return { model: "qwen3-coder:30b", note: "high quality. MoE 30B with 3B active, needs ~24 GB free" };
  return { model: "qwen3-coder:30b", note: "high quality with room to spare. qwen3-coder-next (80B) also fits at 64 GB and up" };
}

export function resolveLocalModel(model: string | undefined): string {
  if (!model || model === "auto") return recommendLocalModel().model;
  return model;
}

export function configPath(cwd: string, bundleDir = DEFAULT_CONFIG.bundleDir): string {
  return path.join(cwd, bundleDir, "config.json");
}

export function loadConfig(cwd: string): Config {
  const p = configPath(cwd);
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      return ConfigSchema.parse({ ...DEFAULT_CONFIG, ...raw });
    } catch {
      // malformed config → fall back to defaults rather than crash
    }
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(cwd: string, cfg: Config): string {
  const dir = path.join(cwd, cfg.bundleDir);
  fs.mkdirSync(dir, { recursive: true });
  const p = configPath(cwd, cfg.bundleDir);
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}
