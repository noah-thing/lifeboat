import fs from "node:fs";
import path from "node:path";
import { nowISO } from "./util.js";

/**
 * The CONTEXT BUNDLE is Lifeboat's portable, provider-neutral memory of a task.
 * It is what makes a second agent CONTINUE instead of restart, and it is the
 * thing you own — it never lives only inside a provider you can be cut off from.
 */
export interface HandoffEntry {
  at: string;
  provider: string;
  status: string;
  detail?: string;
}

export interface BundleManifest {
  task: string;
  files: string[];
  createdAt: string;
  updatedAt: string;
  status: "in_progress" | "done" | "failed";
  history: HandoffEntry[];
}

const MANIFEST = "manifest.json";
const BUNDLE_MD = "bundle.md";

export function bundleDirPath(cwd: string, bundleDir: string): string {
  return path.join(cwd, bundleDir);
}

function manifestPath(cwd: string, bundleDir: string): string {
  return path.join(bundleDirPath(cwd, bundleDir), MANIFEST);
}

export function loadManifest(cwd: string, bundleDir: string): BundleManifest | null {
  const p = manifestPath(cwd, bundleDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as BundleManifest;
  } catch {
    return null;
  }
}

export function writeManifest(cwd: string, bundleDir: string, m: BundleManifest): void {
  m.updatedAt = nowISO();
  fs.mkdirSync(bundleDirPath(cwd, bundleDir), { recursive: true });
  fs.writeFileSync(manifestPath(cwd, bundleDir), JSON.stringify(m, null, 2));
  writeBundleMd(cwd, bundleDir, m);
}

/** Create the bundle for a task (or reuse it if the same task is resumed). */
export function ensureBundle(
  cwd: string,
  bundleDir: string,
  task: string,
  files: string[],
): BundleManifest {
  const existing = loadManifest(cwd, bundleDir);
  if (existing && existing.task === task && existing.status !== "done") {
    return existing;
  }
  const m: BundleManifest = {
    task,
    files,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    status: "in_progress",
    history: [],
  };
  writeManifest(cwd, bundleDir, m);
  return m;
}

export function recordHandoff(cwd: string, bundleDir: string, entry: HandoffEntry): void {
  const m = loadManifest(cwd, bundleDir);
  if (!m) return;
  m.history.push(entry);
  writeManifest(cwd, bundleDir, m);
}

export function markStatus(cwd: string, bundleDir: string, status: BundleManifest["status"]): void {
  const m = loadManifest(cwd, bundleDir);
  if (!m) return;
  m.status = status;
  writeManifest(cwd, bundleDir, m);
}

/** Render the human-readable bundle injected into a continuing agent. */
export function writeBundleMd(cwd: string, bundleDir: string, m: BundleManifest): void {
  const lines: string[] = [
    `# Lifeboat context bundle`,
    ``,
    `**Task:** ${m.task}`,
    `**Status:** ${m.status}`,
    `**Files in scope:** ${m.files.length ? m.files.join(", ") : "(whole repo)"}`,
    `**Started:** ${m.createdAt}  ·  **Updated:** ${m.updatedAt}`,
    ``,
  ];
  if (m.history.length) {
    lines.push(`## Handoff log`);
    for (const h of m.history) {
      lines.push(`- ${h.at} — \`${h.provider}\` → **${h.status}**${h.detail ? ` (${h.detail})` : ""}`);
    }
    lines.push(``);
  }
  lines.push(
    `## For the agent continuing this task`,
    `A previous agent may already have started. Read the repo and the files in`,
    `scope, infer what is already done, and continue the task above. Do not`,
    `restart from scratch. If the work already looks complete, verify it and finish.`,
  );
  fs.writeFileSync(path.join(bundleDirPath(cwd, bundleDir), BUNDLE_MD), lines.join("\n"));
}

export function readBundleText(cwd: string, bundleDir: string): string {
  const p = path.join(bundleDirPath(cwd, bundleDir), BUNDLE_MD);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}
