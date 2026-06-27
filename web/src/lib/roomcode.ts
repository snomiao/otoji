// Human-memorizable, word-based room codes: three lowercase words, e.g.
// "swift-otter-falcon". Embedded directly in the shareable path URL
// (otoji.org/<code>). The regex also accepts the older Meet-style letter codes.

import { ADJECTIVES, ANIMALS, pickWord } from "./words";

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function suffix(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  return s;
}

// Memorable two words + a random suffix for entropy (the room code IS the
// persistent room key, so collisions must be improbable):
//   "noble-badger-7f3k"  ->  ~80 x 80 x 36^4 ≈ 1e10 combos.
export function generateRoomCode(): string {
  return `${pickWord(ADJECTIVES)}-${pickWord(ANIMALS)}-${suffix(4)}`;
}

// 3-4 lowercase-alphanumeric groups (>=2 chars). Matches generated word+suffix
// codes, plain word codes, AND legacy Meet-style codes like "kru-dfmq-atg".
export const ROOM_CODE_RE = /^[a-z0-9]{2,}(?:-[a-z0-9]{2,}){2,3}$/;

export function isRoomCode(s: string): boolean {
  return ROOM_CODE_RE.test(s);
}

/** Shareable join URL for a room code, e.g. https://otoji.org/kru-dfmq-atg */
export function joinUrl(code: string, origin: string): string {
  return `${origin}/${code}`;
}
