import type { Adapter } from "../types.js";
import { resolveLocalModel } from "../config.js";
import { canReach, hasBinary } from "../util.js";
import { buildPrompt } from "./shared.js";

/** LIFEBOAT_OLLAMA_URL overrides the default port, for a custom setup or a remote machine. */
function ollamaBase(): string {
  return process.env.LIFEBOAT_OLLAMA_URL ?? "http://localhost:11434";
}

export const local: Adapter = {
  id: "local",
  label: "Local model (Ollama)",
  binary: "ollama",
  installHint: "brew install ollama && ollama serve, then: ollama pull qwen3.5:9b",
  async isAvailable() {
    if (!(await hasBinary("ollama"))) return false;
    return canReach(`${ollamaBase()}/api/tags`);
  },
  async run(ctx, opts) {
    const model = resolveLocalModel(opts.model);
    try {
      const res = await fetch(`${ollamaBase()}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a local coding assistant stepping in after the cloud agent was cut off. Continue the task. Give the exact code or patch and the steps to apply it.",
            },
            { role: "user", content: buildPrompt(ctx) },
          ],
          stream: false,
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 404 || /not found|try pulling|pull/i.test(body)) {
          return {
            status: "unavailable",
            provider: "local",
            detail: `model ${model} not pulled. run: ollama pull ${model}`,
          };
        }
        return { status: "outage", provider: "local", detail: `ollama responded ${res.status}` };
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        status: "ok",
        provider: "local",
        output: `[local · ${model}]\n${text}`.trim(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "no server";
      return { status: "unavailable", provider: "local", detail: `ollama unreachable (${msg})` };
    }
  },
};
