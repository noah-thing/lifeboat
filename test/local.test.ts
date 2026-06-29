import { describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { local } from "../src/adapters/local";
import type { RunContext } from "../src/types";

/** Spin up a throwaway HTTP server that stands in for Ollama. */
function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const ctx: RunContext = {
  task: "add a retry to the client",
  files: [],
  cwd: process.cwd(),
  bundleDir: ".lifeboat",
  bundleText: "",
  resumed: true,
};

describe("local (Ollama) adapter", () => {
  it("returns ok with the model's text on a 200", async () => {
    const srv = await startServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: "here is the patch you asked for" } }] }));
      });
    });
    process.env.LIFEBOAT_OLLAMA_URL = srv.url;
    try {
      const r = await local.run(ctx, { model: "test-model" });
      expect(r.status).toBe("ok");
      expect(r.output).toContain("here is the patch you asked for");
    } finally {
      delete process.env.LIFEBOAT_OLLAMA_URL;
      await srv.close();
    }
  });

  it("reports unavailable with a pull hint when the model is not there", async () => {
    const srv = await startServer((_req, res) => {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "model 'missing-model' not found, try pulling it first" }));
    });
    process.env.LIFEBOAT_OLLAMA_URL = srv.url;
    try {
      const r = await local.run(ctx, { model: "missing-model" });
      expect(r.status).toBe("unavailable");
      expect(r.detail).toMatch(/ollama pull missing-model/);
    } finally {
      delete process.env.LIFEBOAT_OLLAMA_URL;
      await srv.close();
    }
  });

  it("reports unavailable when nothing is listening", async () => {
    process.env.LIFEBOAT_OLLAMA_URL = "http://127.0.0.1:1";
    try {
      const r = await local.run(ctx, { model: "test-model" });
      expect(r.status).toBe("unavailable");
    } finally {
      delete process.env.LIFEBOAT_OLLAMA_URL;
    }
  });
});
