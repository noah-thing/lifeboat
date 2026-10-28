import type { Status } from "./types.js";

export interface Signal {
  code?: number | null;
  stdout?: string;
  stderr?: string;
}

// Order matters: an account problem often also shows a 401 or 403, so banned
// is checked before the rate limit bucket. The patterns are broad because every
// agent CLI words its errors differently.
const PATTERNS: Array<{ status: Status; re: RegExp }> = [
  {
    status: "banned",
    re: /\b(401|403)\b|unauthor|forbidden|invalid[_\s-]?api[_\s-]?key|authentication (failed|error)|account.{0,24}(suspend|ban|disabl|deactiv)|\bbanned\b|access (denied|revoked)|ineligibletier|not (logged|signed) in|please run \/login|(codex|grok) login|token (has )?(expired|been revoked)|permission_denied|api key not valid|no longer supported for/i,
  },
  {
    status: "rate_limited",
    re: /\b429\b|\b529\b|rate[_\s-]?limit|quota|too many requests|overloaded|usage limit|out of (credits|capacity)|insufficient[_\s-]?(quota|credit)|billing (hard )?limit|resource_exhausted|usage_limit_reached|hit your usage limit|exceeded your current quota|capacity_exhausted|no capacity available|at capacity|credit balance is too low/i,
  },
  {
    status: "outage",
    re: /\b(500|502|503|504)\b|service unavailable|internal server error|econnrefused|connection refused|getaddrinfo|enotfound|bad gateway|gateway timeout|stream disconnected|fetch failed|high demand|\bunavailable\b/i,
  },
  {
    status: "transient",
    re: /etimedout|econnreset|timed out|temporar|please try again|socket hang up|stream (error|interrupted)|read econn/i,
  },
];

export function classify(signal: Signal): Status {
  const hay = `${signal.stdout ?? ""}\n${signal.stderr ?? ""}`;
  for (const { status, re } of PATTERNS) {
    if (re.test(hay)) return status;
  }
  if (signal.code === 0) return "ok";
  // Unknown non-zero exit counts as transient. The retry cap stops a broken
  // provider from looping forever.
  return "transient";
}
