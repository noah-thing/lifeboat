import { describe, expect, it } from "vitest";
import { recommendLocalModel } from "../src/config";

describe("recommendLocalModel", () => {
  it("drops to a tiny model on an 8 GB Mac", () => {
    expect(recommendLocalModel(8).model).toBe("qwen2.5-coder:3b");
  });

  it("lands on the 7b sweet spot at 16 GB", () => {
    expect(recommendLocalModel(16).model).toBe("qwen2.5-coder:7b");
  });

  it("steps up to 14b at 32 GB", () => {
    expect(recommendLocalModel(32).model).toBe("qwen2.5-coder:14b");
  });

  it("runs a 30b MoE at 48 GB", () => {
    expect(recommendLocalModel(48).model).toBe("qwen3-coder:30b");
  });
});
