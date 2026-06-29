/**
 * Core types for Lifeboat.
 *
 * The whole system is small on purpose: a CONTEXT BUNDLE travels with a task,
 * a SUPERVISOR (router) tries a chain of ADAPTERS, and a DETECTOR classifies
 * what happened so the router knows whether to retry, fail over, or stop.
 */

/** The classified result of one attempt by one adapter. */
export type Status =
  | "ok" // the agent completed the turn
  | "transient" // a blip (network/timeout) — retry the SAME provider
  | "rate_limited" // hit a usage/quota/rate wall — FAIL OVER
  | "banned" // auth/account blocked or suspended — FAIL OVER
  | "outage" // provider is down (5xx / refused) — FAIL OVER
  | "unavailable"; // adapter's CLI/runtime isn't installed — SKIP silently

/** Statuses that should advance the failover chain. */
export const FAILOVER_STATUSES: ReadonlySet<Status> = new Set<Status>([
  "rate_limited",
  "banned",
  "outage",
]);

export interface AttemptResult {
  status: Status;
  provider: string;
  /** the agent's final text/summary, if any */
  output?: string;
  /** a short human-readable note (error line, reason) */
  detail?: string;
  exitCode?: number;
  durationMs?: number;
  /** dollars this attempt cost, when the agent reports it */
  costUsd?: number;
}

/** Everything an adapter needs to run (and continue) a task. */
export interface RunContext {
  task: string;
  files: string[];
  cwd: string;
  /** absolute path to the .lifeboat dir for this project */
  bundleDir: string;
  /** serialized bundle text to inject so a new agent CONTINUES rather than restarts */
  bundleText: string;
  /** true when at least one prior provider already worked on this task */
  resumed: boolean;
}

export interface ProviderOptions {
  /** primary model id for this provider */
  model?: string;
  /** in-provider fallbacks (e.g. Claude Code's --fallback-model) */
  fallbackModels?: string[];
  /** how much autonomy the agent gets (Claude Code: acceptEdits | bypassPermissions | default) */
  permissionMode?: string;
  /** local runtime, e.g. "ollama" */
  runtime?: string;
  /** escape hatch for extra CLI flags */
  extraArgs?: string[];
}

export interface Adapter {
  id: string;
  label: string;
  /** the CLI/binary this adapter drives (for doctor + install hints) */
  binary: string;
  /** one-line install hint shown by `lifeboat doctor` when missing */
  installHint: string;
  /** is the underlying CLI/runtime installed & usable right now? */
  isAvailable(cwd: string): Promise<boolean>;
  /**
   * Run the task. MUST resolve with a classified AttemptResult and MUST NOT
   * throw on provider errors — provider failure is data, not an exception.
   */
  run(ctx: RunContext, opts: ProviderOptions): Promise<AttemptResult>;
}

/** A forced outcome for demos/tests: make a provider report a status. */
export interface Simulation {
  provider?: string; // default: the first available provider
  status: Status;
}
