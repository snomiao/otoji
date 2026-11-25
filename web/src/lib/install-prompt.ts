// PWA install-prompt policy (pure logic; the UI lives in ui/InstallPrompt).
// Only nudge MOBILE browser users who haven't installed and haven't recently
// dismissed: Android/Chromium gets the native beforeinstallprompt flow, iOS
// Safari (which has no install API) gets a short Add-to-Home-Screen guide.

export const INSTALL_DISMISS_KEY = "otoji.installPrompt.dismissedAt";
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-ask after 2 weeks

export type InstallPromptMode = "hide" | "native" | "ios-guide";

export interface InstallPromptEnv {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean; // display-mode standalone / navigator.standalone
  dismissedAt: number | null; // ms epoch of the last "not now", if any
  now: number;
  hasNativePrompt: boolean; // a beforeinstallprompt event was captured
  force?: boolean; // ?installprompt debug override
}

export function isMobileLike(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPod/i.test(userAgent)) return true;
  // iPadOS ships a macOS UA; touch points give it away
  if (/iPad/i.test(userAgent)) return true;
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const apple = /iPhone|iPod|iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  // Chromium/Firefox on iOS are Safari underneath and also lack the install
  // API, so the guide applies to them too — no engine sniffing needed.
  return apple;
}

export function installPromptMode(env: InstallPromptEnv): InstallPromptMode {
  if (env.force) return env.hasNativePrompt ? "native" : "ios-guide";
  if (env.standalone) return "hide"; // already installed
  if (!isMobileLike(env.userAgent, env.maxTouchPoints)) return "hide";
  if (env.dismissedAt !== null && env.now - env.dismissedAt < INSTALL_SNOOZE_MS) return "hide";
  if (env.hasNativePrompt) return "native";
  if (isIosSafari(env.userAgent, env.maxTouchPoints)) return "ios-guide";
  // mobile Chromium before beforeinstallprompt fires (or ineligible): wait
  return "hide";
}
