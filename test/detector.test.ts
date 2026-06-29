import { describe, expect, it } from "vitest";
import { classify } from "../src/detector";

describe("classify", () => {
  it("reports ok on a clean exit", () => {
    expect(classify({ code: 0, stdout: "all done" })).toBe("ok");
  });

  it("catches a 429 as rate_limited", () => {
    expect(classify({ code: 1, stderr: "Error 429: too many requests" })).toBe("rate_limited");
  });

  it("catches an overloaded 529 as rate_limited", () => {
    expect(classify({ code: 1, stderr: "overloaded_error (529)" })).toBe("rate_limited");
  });

  it("catches a 401 as banned", () => {
    expect(classify({ code: 1, stderr: "401 unauthorized: invalid api key" })).toBe("banned");
  });

  it("catches a suspended account as banned", () => {
    expect(classify({ code: 1, stdout: "your account has been suspended" })).toBe("banned");
  });

  it("catches a 503 as outage", () => {
    expect(classify({ code: 1, stderr: "503 service unavailable" })).toBe("outage");
  });

  it("catches a refused connection as outage", () => {
    expect(classify({ code: 1, stderr: "connect ECONNREFUSED 127.0.0.1:11434" })).toBe("outage");
  });

  it("treats an unknown non-zero exit as transient", () => {
    expect(classify({ code: 2, stderr: "something nobody planned for" })).toBe("transient");
  });
});
