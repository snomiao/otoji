import { describe, expect, it } from "vitest";
import { INSTALL_SNOOZE_MS, installPromptMode, isMobileLike } from "../lib/install-prompt";

const base = {
  userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/126 Mobile",
  maxTouchPoints: 5,
  standalone: false,
  dismissedAt: null as number | null,
  now: 1_000_000_000,
  hasNativePrompt: true,
};

describe("install prompt policy", () => {
  it("running as the installed PWA never prompts", () => {
    expect(installPromptMode({ ...base, standalone: true })).toBe("hide");
  });

  it("desktop browsers never prompt", () => {
    expect(installPromptMode({ ...base, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/126", maxTouchPoints: 0 })).toBe("hide");
    expect(installPromptMode({ ...base, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 0 })).toBe("hide");
  });

  it("mobile Chromium with a captured event gets the native flow", () => {
    expect(installPromptMode(base)).toBe("native");
  });

  it("iPhone Safari (no install API) gets the add-to-home guide", () => {
    expect(installPromptMode({ ...base, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605", hasNativePrompt: false })).toBe("ios-guide");
  });

  it("iPadOS hides behind a Mac UA but has touch points", () => {
    expect(isMobileLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", 5)).toBe(true);
    expect(installPromptMode({ ...base, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", hasNativePrompt: false })).toBe("ios-guide");
  });

  it("a dismissal snoozes for two weeks, then asks again", () => {
    const dismissedAt = base.now - 1000;
    expect(installPromptMode({ ...base, dismissedAt })).toBe("hide");
    expect(installPromptMode({ ...base, dismissedAt, now: base.now + INSTALL_SNOOZE_MS + 1 })).toBe("native");
  });

  it("mobile Chromium before the event fires stays quiet (no premature guide)", () => {
    expect(installPromptMode({ ...base, hasNativePrompt: false })).toBe("hide");
  });
});
