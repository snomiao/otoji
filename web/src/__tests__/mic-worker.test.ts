// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleMicPolish } from "../../../signal/src/mic-polish";
import { micUserscriptHeader } from "../../userscript/build";

const token = `lk_${"a".repeat(64)}`;
function req(patch: RequestInit = {}, url = "https://otoji.org/signal/mic/polish") {
  return new Request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Cookie: "never-forward",
    },
    body: JSON.stringify({ transcript: "raw", context: null }),
    ...patch,
  });
}
const result = { text: "clean", charged: 1, daily: { used: 2, max: 100 } };
const transport = (value: unknown = result, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json(value, { status }));

describe("Otoji account-billed mic proxy", () => {
  it("forwards only to the fixed account endpoint and returns bounded billing metadata", async () => {
    const send = transport({ ...result, userId: "private-account" });
    const response = await handleMicPolish(req(), send);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://lianki.com/api/mic/polish");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(init?.headers).get("cookie")).toBeNull();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({ transcript: "raw", context: null });
  });
  it.each([
    [{ method: "GET", body: undefined }, 405],
    [{ headers: { "Content-Type": "application/json" } }, 401],
    [{ body: JSON.stringify({ transcript: "x", userId: "other-account" }) }, 400],
    [{ body: JSON.stringify({ transcript: "x", model: "arbitrary-model" }) }, 400],
    [{ body: JSON.stringify({ transcript: "x", daily: { max: 999999 } }) }, 400],
    [{ body: JSON.stringify({ transcript: "x".repeat(8001) }) }, 400],
    [{ body: "x".repeat(32769) }, 413],
    [{ body: "invalid JSON" }, 400],
    [{ body: JSON.stringify({ transcript: "x", context: [] }) }, 400],
    [{ body: JSON.stringify({ transcript: " " }) }, 400],
  ] as const)("rejects invalid requests before forwarding", async (patch, status) => {
    const send = transport();
    const response = await handleMicPolish(req(patch), send);
    expect(response.status).toBe(status);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects query-string overrides", async () => {
    const send = transport();
    expect(
      (await handleMicPolish(req({}, "https://otoji.org/signal/mic/polish?userId=other"), send))
        .status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    [401, { error: "private" }, "auth"],
    [403, {}, "auth"],
    [402, {}, "no-credits"],
    [429, { error: "daily-limit", balance: "private" }, "daily-limit"],
    [429, { error: "rate" }, "rate"],
    [500, { error: "private exception" }, "unavailable"],
  ] as const)(
    "preserves actionable refusal %s without upstream private data",
    async (status, data, code) => {
      const response = await handleMicPolish(req(), transport(data, status));
      expect(response.status).toBe(status === 500 ? 503 : status);
      expect(await response.json()).toEqual({ error: code });
    },
  );
  it("never falls back to anonymous AI on account-service failure or incomplete billing results", async () => {
    for (const data of [
      { text: "unmetered" },
      { ...result, charged: -1 },
      { ...result, daily: null },
      null,
    ]) {
      const send = transport(data);
      const response = await handleMicPolish(req(), send);
      expect(response.status).toBe(503);
      expect(send).toHaveBeenCalledTimes(1);
    }
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("private account failure"));
    expect(await (await handleMicPolish(req(), send)).json()).toEqual({ error: "unavailable" });
  });
  it("only grants the production script its own domain and bumps its version", () => {
    const header = micUserscriptHeader();
    expect(header.match(/@connect\s+\S+/g)).toEqual(["@connect      otoji.org"]);
    expect(header).toContain("@version      0.1.1");
    expect(header).not.toMatch(/deepseek|googleapis/);
  });
});
