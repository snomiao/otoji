import { describe, expect, it, vi } from "vitest";
import type { MicConfig } from "../../mic/config";
import { MIC_POLISH_URL, MicPolishError, polishText } from "../../mic/polish";

const token = `lk_${"a".repeat(64)}`;
const config = (patch: Partial<MicConfig["polish"]> = {}): MicConfig["polish"] => ({
  enabled: true,
  accountToken: token,
  useSiteContext: false,
  ...patch,
});
const context = { site: "github" as const, title: "Visible issue", messages: ["Relevant context"] };
const requestFor = (data: unknown, status = 200) =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

describe("account-billed Worker AI polishing", () => {
  it("makes no request when disabled and requires an account token when enabled", async () => {
    const request = vi.fn<typeof fetch>();
    expect(
      await polishText(
        " raw ",
        config({ enabled: false, accountToken: "" }),
        context,
        undefined,
        request,
      ),
    ).toBe(" raw ");
    await expect(
      polishText("raw", config({ accountToken: "provider-key" }), null, undefined, request),
    ).rejects.toMatchObject({ code: "auth" });
    expect(request).not.toHaveBeenCalled();
  });
  it("only sends transcript/context to otoji.org, with an account token in the header", async () => {
    const request = requestFor({ text: " clean ", charged: 1 });
    const signal = new AbortController().signal;
    expect(await polishText("raw", config(), context, signal, request)).toBe("clean");
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(MIC_POLISH_URL);
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({ transcript: "raw", context: null });
    expect(String(init?.body)).not.toMatch(/model|price|userId|apiKey/);
  });
  it("only includes page context with an explicit opt-in", async () => {
    const request = requestFor({ text: "clean" });
    await polishText("raw", config({ useSiteContext: true }), context, undefined, request);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).context).toEqual(context);
  });
  it.each([
    [401, {}, "auth"],
    [403, {}, "auth"],
    [402, {}, "credits"],
    [429, { error: "daily-limit" }, "daily-limit"],
    [429, { error: "rate" }, "unavailable"],
    [500, { error: "private upstream details" }, "unavailable"],
  ] as const)("reports bounded actionable failure for status %s", async (status, data, code) => {
    const result = polishText("raw", config(), null, undefined, requestFor(data, status));
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.toThrow(/keeping the recognized text/);
  });
  it.each([null, {}, { text: 2 }, { text: "" }, { text: " " }, { text: "x".repeat(4097) }])(
    "rejects malformed or excessive output",
    async (data) => {
      await expect(
        polishText("raw", config(), null, undefined, requestFor(data)),
      ).rejects.toBeInstanceOf(MicPolishError);
    },
  );
  it("masks transport and JSON exceptions containing credentials", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(token));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing unavailable; keeping the recognized text\.$/,
    );
    request.mockResolvedValue(new Response("private invalid JSON"));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing unavailable; keeping the recognized text\.$/,
    );
  });
});
