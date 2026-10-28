import { describe, expect, it } from "vitest";
import { recommendLocalModel } from "../src/config";

describe("recommendLocalModel", () => {
  it("drops to a small model on an 8 GB Mac", () => {
    expect(recommendLocalModel(8).model).toBe("qwen3.5:4b");
  });

  it("lands on the 9b sweet spot at 16 GB", () => {
    expect(recommendLocalModel(16).model).toBe("qwen3.5:9b");
  });

  it("steps up to 27b at 32 GB", () => {
    expect(recommendLocalModel(32).model).toBe("qwen3.6:27b");
  });

  it("runs the 35b MoE at 64 GB", () => {
    expect(recommendLocalModel(64).model).toBe("qwen3.6:35b-a3b");
  });

  it("only picks the 52 GB model from 96 GB", () => {
    expect(recommendLocalModel(96).model).toBe("qwen3-coder-next");
  });
});
