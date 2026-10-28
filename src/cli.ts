#!/usr/bin/env node
import process from "node:process";
import { Command } from "commander";
import {
  DEFAULT_CONFIG,
  loadConfig,
  recommendLocalModel,
  saveConfig,
} from "./config.js";
import { runWithFailover } from "./router.js";
import { ADAPTERS } from "./adapters/index.js";
import { ensureBundle, loadManifest } from "./bundle.js";
import { canReach, c, hasBinary, log, totalRamGB } from "./util.js";
import type { Status } from "./types.js";

const VALID_STATUS: Status[] = ["ok", "transient", "rate_limited", "banned", "outage", "unavailable"];

const program = new Command();
program
  .name("lifeboat")
  .description(
    "Fail over to another coding agent, then to a local model, when your agent is rate limited, banned or down.",
  )
  .version("0.1.0");

interface RunOpts {
  file?: string[];
  chain?: string;
  simulate?: string;
  simulateProvider?: string;
  dryRun?: boolean;
}

program
  .command("run")
  .description("run a coding task with failover")
  .argument("<task...>", "what you want done")
  .option("-f, --file <files...>", "files in scope", [])
  .option("--chain <ids>", "comma-separated provider chain override")
  .option("--simulate <status>", "force the first provider to report a status")
  .option("--simulate-provider <id>", "which provider to simulate the status on")
  .option("--dry-run", "show the plan without invoking any agent")
  .action(async (taskParts: string[], options: RunOpts) => {
    const cwd = process.cwd();
    const config = loadConfig(cwd);
    if (options.chain) {
      config.providerChain = options.chain
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const task = taskParts.join(" ");
    const files = options.file ?? [];

    log.title("Lifeboat");
    log.dim(`chain: ${config.providerChain.join(" → ")}`);

    let simulate;
    if (options.simulate) {
      if (!VALID_STATUS.includes(options.simulate as Status)) {
        log.err(`unknown --simulate status "${options.simulate}". Use one of: ${VALID_STATUS.join(", ")}`);
        process.exit(1);
      }
      simulate = { status: options.simulate as Status, provider: options.simulateProvider };
    }

    const outcome = await runWithFailover({
      task,
      files,
      cwd,
      config,
      simulate,
      dryRun: options.dryRun,
    });

    const spent = outcome.attempts.reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
    const cost = spent > 0 ? c.dim(` · $${spent.toFixed(4)}`) : "";

    if (outcome.finalStatus === "completed") {
      log.title(`Done via ${c.green(outcome.winner ?? "?")} after ${outcome.attempts.length} attempt(s).${cost}`);
    } else {
      log.title(c.red("Every provider was exhausted. Your context bundle is saved so you can resume.") + cost);
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("check which agents and local models are ready")
  .action(async () => {
    const cwd = process.cwd();
    const ram = totalRamGB();
    const rec = recommendLocalModel(ram);

    log.title("Lifeboat doctor");
    log.info(`This Mac: ${c.bold(`${ram} GB`)} RAM`);
    log.info(`Suggested local model: ${c.bold(rec.model)}`);
    log.dim(`  ${rec.note}`);

    log.title("Failover chain");
    for (const a of ADAPTERS) {
      const ready = await a.isAvailable(cwd);
      if (ready) log.ok(`${a.label} ${c.dim("ready")}`);
      else log.warn(`${a.label} ${c.dim("missing → " + a.installHint)}`);
    }

    if (await hasBinary("ollama")) {
      const serving = await canReach("http://localhost:11434/api/tags");
      log.info(
        serving
          ? `Ollama is serving on :11434. Pull the model with: ${c.bold("ollama pull " + rec.model)}`
          : `Ollama is installed but not serving. Start it with: ${c.bold("ollama serve")}`,
      );
    }
  });

program
  .command("status")
  .description("show the current task bundle")
  .action(() => {
    const cwd = process.cwd();
    const cfg = loadConfig(cwd);
    const m = loadManifest(cwd, cfg.bundleDir);
    if (!m) {
      log.warn("No Lifeboat bundle here yet. Run a task with `lifeboat run` first.");
      return;
    }
    log.title("Current task");
    log.info(`Task:    ${m.task}`);
    log.info(`Status:  ${m.status}`);
    log.info(`Updated: ${m.updatedAt}`);
    if (m.history.length) {
      log.title("Handoffs");
      for (const h of m.history) {
        log.info(`  ${h.at}  ${h.provider} → ${h.status}${h.detail ? c.dim(` (${h.detail})`) : ""}`);
      }
    }
  });

program
  .command("snapshot")
  .description("save a context bundle for a task without running anything")
  .argument("<task...>", "the task to remember")
  .option("-f, --file <files...>", "files in scope", [])
  .action((taskParts: string[], options: { file?: string[] }) => {
    const cwd = process.cwd();
    const cfg = loadConfig(cwd);
    ensureBundle(cwd, cfg.bundleDir, taskParts.join(" "), options.file ?? []);
    log.ok(`Saved a context bundle to ${cfg.bundleDir}/. Resume any time.`);
  });

program
  .command("config")
  .description("show the config, or write a default one to edit")
  .option("--init", "write a default config file")
  .action((options: { init?: boolean }) => {
    const cwd = process.cwd();
    if (options.init) {
      const p = saveConfig(cwd, DEFAULT_CONFIG);
      log.ok(`Wrote ${p}. Edit the provider chain or models there.`);
      return;
    }
    log.title("Lifeboat config");
    console.log(JSON.stringify(loadConfig(cwd), null, 2));
  });

program.parseAsync().catch((e: unknown) => {
  log.err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
