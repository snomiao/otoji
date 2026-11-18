import { describe, expect, it, vi } from "vitest";
import type { MicConfig } from "../../mic/config";
import type { SiteContext } from "../../mic/context";
import { polishText } from "../../mic/polish";

const context: SiteContext = {
  site: "github",
  title: "Thread title",
  messages: ["Relevant opted-in context"],
};
const config = (patch: Partial<MicConfig["polish"]> = {}): MicConfig["polish"] => ({
  enabled: true,
  provider: "deepseek",
  apiKey: "test-only-key",
  model: "test-model",
  useSiteContext: false,
  ...patch,
});
const response = (provider: "deepseek" | "gemini", text: unknown) =>
  provider === "deepseek"
    ? { choices: [{ message: { content: text } }] }
    : { candidates: [{ content: { parts: [{ text }] } }] };
function fakeRequest(data: unknown, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

describe("explicit direct-provider polishing", () => {
  it("returns the original text with zero network or credential requirements when disabled", async () => {
    const request = vi.fn<typeof fetch>();
    const original = " um exact raw text ";
    expect(
      await polishText(
        original,
        config({ enabled: false, apiKey: "", model: "" }),
        context,
        undefined,
        request,
      ),
    ).toBe(original);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([{ apiKey: "" }, { apiKey: "   " }, { model: "" }, { model: "   " }])(
    "fails locally for missing credentials/model %j",
    async (patch) => {
      const request = vi.fn<typeof fetch>();
      await expect(
        polishText("raw text", config(patch), context, undefined, request),
      ).rejects.toThrow(/model and API key/i);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(["deepseek", "gemini"] as const)(
    "sends the %s format with credentials in headers and bounded generation",
    async (provider) => {
      const request = fakeRequest(response(provider, "  Polished text.  "));
      const signal = new AbortController().signal;
      expect(await polishText("raw text", config({ provider }), context, signal, request)).toBe(
        "Polished text.",
      );
      expect(request).toHaveBeenCalledTimes(1);
      const [url, init] = request.mock.calls[0];
      expect(String(url)).not.toContain("test-only-key");
      expect(String(url)).not.toMatch(/[?&](?:key|api_key)=/);
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBe(signal);
      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("application/json");
      const body = JSON.parse(String(init?.body));
      if (provider === "deepseek") {
        expect(url).toBe("https://api.deepseek.com/chat/completions");
        expect(headers.get("authorization")).toBe("Bearer test-only-key");
        expect(body.model).toBe("test-model");
        expect(body.stream).toBe(false);
        expect(body.max_tokens).toBe(2048);
        expect(body.messages[0].role).toBe("system");
        expect(body.messages[0].content).toMatch(/untrusted data/i);
        expect(JSON.parse(body.messages[1].content)).toEqual({
          transcript: "raw text",
          context: null,
        });
      } else {
        expect(url).toBe(
          "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
        );
        expect(headers.get("x-goog-api-key")).toBe("test-only-key");
        expect(body.generationConfig.maxOutputTokens).toBe(2048);
        expect(body.systemInstruction.parts[0].text).toMatch(/untrusted data/i);
        expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({
          transcript: "raw text",
          context: null,
        });
      }
    },
  );

  it.each(["deepseek", "gemini"] as const)(
    "includes context only when useSiteContext is explicitly enabled for %s",
    async (provider) => {
      for (const useSiteContext of [false, true]) {
        const request = fakeRequest(response(provider, "clean"));
        await polishText("raw", config({ provider, useSiteContext }), context, undefined, request);
        const body = JSON.parse(String(request.mock.calls[0][1]?.body));
        const input = JSON.parse(
          provider === "deepseek" ? body.messages[1].content : body.contents[0].parts[0].text,
        );
        expect(input.context).toEqual(useSiteContext ? context : null);
      }
    },
  );

  it("encodes the Gemini model as a path component", async () => {
    const request = fakeRequest(response("gemini", "clean"));
    await polishText(
      "raw",
      config({ provider: "gemini", model: "model/with?query#fragment" }),
      null,
      undefined,
      request,
    );
    expect(request.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/model%2Fwith%3Fquery%23fragment:generateContent",
    );
  });

  it("joins Gemini text parts while excluding non-text metadata", async () => {
    const request = fakeRequest({
      candidates: [
        {
          content: {
            parts: [{ text: "Hello " }, { inlineData: { data: "ignored" } }, { text: "world." }],
          },
        },
      ],
    });
    expect(await polishText("raw", config({ provider: "gemini" }), null, undefined, request)).toBe(
      "Hello world.",
    );
  });

  it.each(["deepseek", "gemini"] as const)(
    "rejects empty, non-text, missing, and excessive %s output",
    async (provider) => {
      for (const output of ["", "   ", 123, "x".repeat(4097)]) {
        await expect(
          polishText(
            "short",
            config({ provider }),
            null,
            undefined,
            fakeRequest(response(provider, output)),
          ),
        ).rejects.toThrow(/no usable text/i);
      }
      await expect(
        polishText("short", config({ provider }), null, undefined, fakeRequest({})),
      ).rejects.toThrow(/no usable text/i);
    },
  );

  it("accepts bounded longer transcripts but rejects expansion beyond three times the input", async () => {
    const original = "x".repeat(2000);
    expect(
      (
        await polishText(
          original,
          config(),
          null,
          undefined,
          fakeRequest(response("deepseek", "y".repeat(6000))),
        )
      ).length,
    ).toBe(6000);
    await expect(
      polishText(
        original,
        config(),
        null,
        undefined,
        fakeRequest(response("deepseek", "y".repeat(6001))),
      ),
    ).rejects.toThrow(/no usable text/i);
  });

  it("reports HTTP status without reading or exposing raw provider errors", async () => {
    const json = vi.fn().mockResolvedValue({ error: "private upstream details test-only-key" });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: false, status: 429, json } as unknown as Response);
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      "Polishing request failed (429).",
    );
    expect(json).not.toHaveBeenCalled();
  });

  it("masks raw network exceptions that could contain request credentials", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("upstream echoed Authorization: Bearer test-only-key"));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing connection unavailable\.$/,
    );
  });

  it("masks JSON parsing exceptions and does not expose raw response text", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private invalid JSON test-only-key", { status: 200 }));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing returned no usable text\.$/,
    );
  });

  it.each(["deepseek", "gemini"] as const)(
    "handles null top-level %s JSON with a bounded generic error",
    async (provider) => {
      await expect(
        polishText("raw", config({ provider }), null, undefined, fakeRequest(null)),
      ).rejects.toThrow(/^Polishing returned no usable text\.$/);
    },
  );

  it("rejects malformed Gemini parts while tolerating null metadata beside valid text", async () => {
    for (const parts of [null, "not an array", { text: "not an array" }]) {
      const request = fakeRequest({ candidates: [{ content: { parts } }] });
      await expect(
        polishText("raw", config({ provider: "gemini" }), null, undefined, request),
      ).rejects.toThrow(/^Polishing returned no usable text\.$/);
    }
    const request = fakeRequest({
      candidates: [{ content: { parts: [null, { text: "clean" }, { data: "ignored" }] } }],
    });
    expect(await polishText("raw", config({ provider: "gemini" }), null, undefined, request)).toBe(
      "clean",
    );
  });
});
