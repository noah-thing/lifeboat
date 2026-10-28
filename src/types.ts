export type Status =
  | "ok"
  | "transient" // retried on the same provider
  | "rate_limited"
  | "banned"
  | "outage"
  | "unavailable"; // CLI or runtime not installed, skipped

/** Statuses that move on to the next provider. */
export const FAILOVER_STATUSES: ReadonlySet<Status> = new Set<Status>([
  "rate_limited",
  "banned",
  "outage",
]);

export interface AttemptResult {
  status: Status;
  provider: string;
  output?: string;
  detail?: string;
  exitCode?: number;
  durationMs?: number;
  /** Only set when the agent reports a cost. */
  costUsd?: number;
}

export interface RunContext {
  task: string;
  files: string[];
  cwd: string;
  /** Relative to cwd, as set in the config. */
  bundleDir: string;
  bundleText: string;
  /** True once an earlier provider has already worked on the task. */
  resumed: boolean;
}

export interface ProviderOptions {
  model?: string;
  /** Passed to Claude Code as --fallback-model. */
  fallbackModels?: string[];
  /**
   * acceptEdits (default), bypassPermissions or manual. Claude Code takes all three;
   * Codex, Gemini and Grok map them to their own sandbox and approval flags.
   */
  permissionMode?: string;
  runtime?: string;
  /** Appended to the agent command line. */
  extraArgs?: string[];
}

export interface Adapter {
  id: string;
  label: string;
  binary: string;
  installHint: string;
  isAvailable(cwd: string): Promise<boolean>;
  /** Must resolve with a classified result. Provider errors are returned, not thrown. */
  run(ctx: RunContext, opts: ProviderOptions): Promise<AttemptResult>;
}

/** Forces a provider to report a status, for demos and tests. */
export interface Simulation {
  provider?: string; // defaults to the first provider that runs
  status: Status;
}
