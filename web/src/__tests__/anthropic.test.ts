import { describe, it, expect } from "vitest";
import { buildAnthropicRequest, parseAnthropicResponse } from "../providers/polish/anthropic";

describe("anthropic polish", () => {
  it("builds request with required browser header", () => {
    const { url, init } = buildAnthropicRequest({ apiKey: "sk", model: "claude-haiku-4-5" }, "hi", "polish");
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const h = init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(h["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.system).toBe("polish");
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });
  it("parses response content array", () => {
    expect(parseAnthropicResponse({ content: [{ text: "a" }, { text: "b" }] })).toBe("ab");
  });
});
