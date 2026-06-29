import type { Status } from "./types.js";

export interface Signal {
  code?: number | null;
  stdout?: string;
  stderr?: string;
}

/**
 * Ordered classifier. The order matters: an account problem often *also* shows
 * a 401/403, so we check "banned" before the generic rate/limit bucket.
 * Patterns are intentionally broad — every agent CLI words its errors
 * differently, and Lifeboat only needs the category, not the exact message.
 */
const PATTERNS: Array<{ status: Status; re: RegExp }> = [
  {
    status: "banned",
    re: /\b(401|403)\b|unauthor|forbidden|invalid[_\s-]?api[_\s-]?key|authentication (failed|error)|account.{0,24}(suspend|ban|disabl|deactiv)|\bbanned\b|access (denied|revoked)/i,
  },
  {
    status: "rate_limited",
    re: /\b429\b|\b529\b|rate[_\s-]?limit|quota|too many requests|overloaded|usage limit|out of (credits|capacity)|insufficient[_\s-]?(quota|credit)|billing (hard )?limit/i,
  },
  {
    status: "outage",
    re: /\b(500|502|503|504)\b|service unavailable|internal server error|econnrefused|connection refused|getaddrinfo|enotfound|bad gateway|gateway timeout/i,
  },
  {
    status: "transient",
    re: /etimedout|econnreset|timed out|temporar|please try again|socket hang up|stream (error|interrupted)|read econn/i,
  },
];

/**
 * Classify one attempt from a process's exit code + captured output.
 * Adapters call this so the failover logic lives in exactly one place.
 */
export function classify(signal: Signal): Status {
  const hay = `${signal.stdout ?? ""}\n${signal.stderr ?? ""}`;
  for (const { status, re } of PATTERNS) {
    if (re.test(hay)) return status;
  }
  if (signal.code === 0) return "ok";
  // Unknown non-zero exit → transient, so the router retries once; the retry
  // cap then prevents an infinite loop on a genuinely broken provider.
  return "transient";
}
