import type { Adapter, AttemptResult, ProviderOptions, RunContext, Simulation } from "./types.js";
import { FAILOVER_STATUSES } from "./types.js";
import type { Config } from "./config.js";
import { getAdapter } from "./adapters/index.js";
import { ensureBundle, markStatus, readBundleText, recordHandoff } from "./bundle.js";
import { c, log, nowISO, sleep } from "./util.js";

export interface RunOptions {
  task: string;
  files: string[];
  cwd: string;
  config: Config;
  simulate?: Simulation;
  dryRun?: boolean;
  /** override how provider ids map to adapters (used by tests) */
  resolveAdapter?: (id: string) => Adapter | undefined;
}

export interface RunOutcome {
  finalStatus: "completed" | "exhausted";
  winner?: string;
  attempts: AttemptResult[];
}

/**
 * The SUPERVISOR. Walk the provider chain; on a failover status, record a
 * handoff and carry the bundle to the next agent so it CONTINUES the task.
 */
export async function runWithFailover(o: RunOptions): Promise<RunOutcome> {
  const { task, files, cwd, config } = o;
  const bundleDir = config.bundleDir;
  ensureBundle(cwd, bundleDir, task, files);

  const attempts: AttemptResult[] = [];
  let resumed = false;
  let simulatedDone = false;

  const resolve = o.resolveAdapter ?? getAdapter;
  for (const providerId of config.providerChain) {
    const adapter = resolve(providerId);
    if (!adapter) {
      log.warn(`unknown provider "${providerId}" in chain — skipping`);
      continue;
    }

    if (!(await adapter.isAvailable(cwd))) {
      log.dim(`  ${adapter.label}: not installed — skipping  ·  ${adapter.installHint}`);
      attempts.push({ status: "unavailable", provider: providerId });
      continue;
    }

    const opts: ProviderOptions = config.providers[providerId] ?? {};
    const ctx: RunContext = {
      task,
      files,
      cwd,
      bundleDir,
      bundleText: readBundleText(cwd, bundleDir),
      resumed,
    };

    log.step(
      `${resumed ? "Continuing on" : "Running on"} ${c.bold(adapter.label)}` +
        `${opts.model ? c.dim(` (${opts.model})`) : ""} …`,
    );

    if (o.dryRun) {
      log.dim(`  dry run — would invoke \`${adapter.binary}\``);
      attempts.push({ status: "ok", provider: providerId, detail: "dry-run" });
      return { finalStatus: "completed", winner: providerId, attempts };
    }

    let result = await attempt(adapter, ctx, opts, o, providerId, simulatedDone);
    if (result.simulated) simulatedDone = true;
    attempts.push(result.res);

    if (result.res.status === "ok") {
      markStatus(cwd, bundleDir, "done");
      log.ok(`${adapter.label} completed the task.`);
      if (result.res.output) log.dim(truncate(result.res.output, 400));
      return { finalStatus: "completed", winner: providerId, attempts };
    }

    if (result.res.status === "transient") {
      for (let tries = 1; tries <= config.retry.transientMax; tries++) {
        log.warn(
          `${adapter.label}: transient issue — retry ${tries}/${config.retry.transientMax} in ${config.retry.backoffMs}ms`,
        );
        await sleep(config.retry.backoffMs);
        const r = await attempt(adapter, ctx, opts, o, providerId, true);
        attempts.push(r.res);
        result = r;
        if (r.res.status === "ok") {
          markStatus(cwd, bundleDir, "done");
          log.ok(`${adapter.label} completed the task.`);
          return { finalStatus: "completed", winner: providerId, attempts };
        }
        if (FAILOVER_STATUSES.has(r.res.status)) break;
      }
    }

    if (FAILOVER_STATUSES.has(result.res.status)) {
      recordHandoff(cwd, bundleDir, {
        at: nowISO(),
        provider: providerId,
        status: result.res.status,
        detail: result.res.detail,
      });
      log.err(
        `${adapter.label} hit ${c.bold(result.res.status)}` +
          `${result.res.detail ? c.dim(` (${result.res.detail})`) : ""}.  ${c.cyan("Launching the lifeboat →")}`,
      );
    }
    resumed = true;
  }

  markStatus(cwd, bundleDir, "failed");
  log.err("Every provider in the chain was exhausted. Your context bundle is saved in " + bundleDir + ".");
  return { finalStatus: "exhausted", attempts };
}

async function attempt(
  adapter: Adapter,
  ctx: RunContext,
  opts: ProviderOptions,
  o: RunOptions,
  providerId: string,
  simulatedAlready: boolean,
): Promise<{ res: AttemptResult; simulated: boolean }> {
  const shouldSim =
    !!o.simulate &&
    !simulatedAlready &&
    (o.simulate.provider ? o.simulate.provider === providerId : true);
  if (shouldSim && o.simulate) {
    log.dim(`  (simulating ${o.simulate.status})`);
    return {
      res: { status: o.simulate.status, provider: providerId, detail: "simulated" },
      simulated: true,
    };
  }
  const t0 = Date.now();
  const res = await adapter.run(ctx, opts);
  res.durationMs = Date.now() - t0;
  return { res, simulated: false };
}

function truncate(s: string, n: number): string {
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
