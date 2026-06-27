// Google-Meet-style room codes: three lowercase-letter groups, e.g. "kru-dfmq-atg".
// Used as the room id and embedded directly in the shareable path URL
// (otoji.org/<code>).

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function group(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

export function generateRoomCode(): string {
  return `${group(3)}-${group(4)}-${group(3)}`;
}

export const ROOM_CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function isRoomCode(s: string): boolean {
  return ROOM_CODE_RE.test(s);
}

/** Shareable join URL for a room code, e.g. https://otoji.org/kru-dfmq-atg */
export function joinUrl(code: string, origin: string): string {
  return `${origin}/${code}`;
}
