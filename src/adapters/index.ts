import type { Adapter } from "../types.js";
import { claudeCode } from "./claudeCode.js";
import { codex } from "./codex.js";
import { gemini } from "./gemini.js";
import { grok } from "./grok.js";
import { aider } from "./aider.js";
import { opencode } from "./opencode.js";
import { local } from "./local.js";

// A new agent is one file in this folder plus an entry here.
export const ADAPTERS: Adapter[] = [claudeCode, codex, gemini, grok, aider, opencode, local];

const BY_ID = new Map<string, Adapter>(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: string): Adapter | undefined {
  return BY_ID.get(id);
}
