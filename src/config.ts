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

// Why this order is in docs/RESEARCH.md.
export const DEFAULT_CONFIG: Config = {
  providerChain: ["claude-code", "aider", "opencode", "local"],
  providers: {
    "claude-code": {
      // Aliases track the latest models across releases.
      model: "opus",
      fallbackModels: ["sonnet", "haiku"],
      // bypassPermissions also lets it use the shell, for fully unattended runs.
      permissionMode: "acceptEdits",
    },
    // Empty means the agent uses whatever model its own config or env selects.
    aider: {},
    opencode: {},
    local: { runtime: "ollama", model: "auto" },
  },
  retry: { transientMax: 2, backoffMs: 1500 },
  bundleDir: ".lifeboat",
};

// Tiers come from docs/RESEARCH.md. Only scale up when the memory is there.
export function recommendLocalModel(ramGB = totalRamGB()): { model: string; note: string } {
  if (ramGB < 12)
    return { model: "qwen3.5:4b", note: "emergency tier. ~3.3 GB, good for clarifications and small edits" };
  if (ramGB < 24)
    return { model: "qwen3.5:9b", note: "sweet spot. ~6.6 GB, leaves room for your editor on a 16 GB Mac" };
  if (ramGB < 48)
    return { model: "qwen3.6:27b", note: "strong agentic coding. ~17 GB, comfortable from 32 GB" };
  if (ramGB < 96)
    return { model: "qwen3.6:35b-a3b", note: "MoE with 3B active, ~24 GB, fast and strong. devstral-small-2 (24B, 15 GB) is a good alternative" };
  return { model: "qwen3-coder-next", note: "~52 GB at q4, the largest coding model Lifeboat will pick on its own" };
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
      // A malformed config falls back to the defaults.
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
