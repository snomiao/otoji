/** Private recording bindings. Hosts own authentication, fetching, storage and playback. */
export const AUDIO_LIMITS = {
  manifestBytes: 4 * 1024 * 1024,
  archiveBytes: 20 * 1024 * 1024,
  memberBytes: 8 * 1024 * 1024,
  chapters: 128,
  entries: 20_000,
  zipEntries: 5_000,
  clipMs: 30_000,
  durationMs: 6 * 60 * 60_000,
  expansion: 200,
} as const;

export type NativeChapter = {
  id: string;
  inboxItemId: string;
  memberPath: string;
  sha256: string;
  archiveSha256: string;
  bytes: number;
  durationMs: number;
};
export type NativeEntry = {
  listId: string;
  key: string;
  term: string;
  chapterId: string;
  startMs: number;
  endMs: number;
  confidence: number;
  reason: string;
  estimated: true;
  verified: false;
};
export type NativeManifest = {
  version: 1;
  scope: "account-private";
  chapters: NativeChapter[];
  entries: NativeEntry[];
};
export type NativeWord = { entry: NativeEntry; chapter: NativeChapter };

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("native-audio-invalid");
  return v as Record<string, unknown>;
};
function text(v: unknown, max: number): string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
    throw Error("native-audio-invalid");
  return v;
}
function number(v: unknown, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
    throw Error("native-audio-invalid");
  return v;
}
function hash(v: unknown): string {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw Error("native-audio-invalid");
  return v;
}
export function safeMemberPath(v: unknown): string {
  const path = text(v, 500);
  if (
    path.startsWith("/") ||
    /[\\:?#%]/.test(path) ||
    path
      .replace(/\/$/, "")
      .split("/")
      .some((p) => !p || p === "." || p === "..")
  )
    throw Error("native-audio-path");
  return path;
}

/** Parse only the runtime fields; never copy arbitrary audit metadata into application state. */
export function parseNativeManifest(raw: string): NativeManifest {
  if (new TextEncoder().encode(raw).length > AUDIO_LIMITS.manifestBytes)
    throw Error("native-audio-size");
  const value = object(JSON.parse(raw));
  if (
    value.version !== 1 ||
    value.scope !== "account-private" ||
    !Array.isArray(value.chapters) ||
    value.chapters.length > AUDIO_LIMITS.chapters ||
    !Array.isArray(value.entries) ||
    value.entries.length > AUDIO_LIMITS.entries ||
    (value.unavailable !== undefined &&
      (!Array.isArray(value.unavailable) || value.unavailable.length > AUDIO_LIMITS.entries))
  )
    throw Error("native-audio-invalid");
  const ids = new Map<string, NativeChapter>();
  const chapters = value.chapters.map((raw) => {
    const c = object(raw);
    const id = text(c.id, 120),
      inboxItemId = text(c.inboxItemId, 20);
    const memberPath = safeMemberPath(c.memberPath);
    const bytes = number(c.bytes, AUDIO_LIMITS.memberBytes);
    const durationMs = number(c.durationMs, AUDIO_LIMITS.durationMs);
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(id) ||
      !/^[a-f0-9]{20}$/.test(inboxItemId) ||
      !memberPath.startsWith("audio/") ||
      !/\.mp3$/i.test(memberPath) ||
      !Number.isSafeInteger(bytes) ||
      bytes === 0 ||
      durationMs === 0 ||
      ids.has(id)
    )
      throw Error("native-audio-invalid");
    const chapter = {
      id,
      inboxItemId,
      memberPath,
      bytes,
      durationMs,
      sha256: hash(c.sha256),
      archiveSha256: hash(c.archiveSha256),
    };
    ids.set(id, chapter);
    return chapter;
  });
  const keys = new Set<string>(),
    terms = new Set<string>();
  const entries = value.entries.map((raw) => {
    const e = object(raw);
    const listId = text(e.listId, 64),
      key = text(e.key, 64),
      term = text(e.term, 200);
    const chapterId = text(e.chapterId, 120),
      chapter = ids.get(chapterId);
    const startMs = number(e.startMs, AUDIO_LIMITS.durationMs);
    const endMs = number(e.endMs, AUDIO_LIMITS.durationMs);
    const identity = `${listId}\0${key}`,
      termIdentity = `${listId}\0${term}`;
    if (
      !chapter ||
      endMs <= startMs ||
      endMs > chapter.durationMs ||
      endMs - startMs > AUDIO_LIMITS.clipMs ||
      keys.has(identity) ||
      terms.has(termIdentity) ||
      e.estimated !== true ||
      e.verified !== false
    )
      throw Error("native-audio-invalid");
    keys.add(identity);
    terms.add(termIdentity);
    return {
      listId,
      key,
      term,
      chapterId,
      startMs,
      endMs,
      confidence: number(e.confidence, 1),
      reason: text(e.reason, 200),
      estimated: true as const,
      verified: false as const,
    };
  });
  return { version: 1, scope: "account-private", chapters, entries };
}

/** A private source is selected by card identity, never by pronunciation text globally. */
export function nativeWordIndex(manifest: NativeManifest) {
  const chapters = new Map(manifest.chapters.map((c) => [c.id, c]));
  const entries = new Map(manifest.entries.map((e) => [`${e.listId}\0${e.term}`, e]));
  return (listId: string, term: string, key?: string): NativeWord | undefined => {
    const entry = entries.get(`${listId}\0${term}`);
    if (!entry || (key !== undefined && entry.key !== key)) return;
    return { entry, chapter: chapters.get(entry.chapterId)! };
  };
}

export function validateArchiveMembers(names: readonly string[], target: string): void {
  if (names.length > AUDIO_LIMITS.zipEntries || !names.includes(target))
    throw Error("native-audio-archive");
  for (const name of names) safeMemberPath(name);
}

/** Stream output is counted, not trusted from a ZIP directory's advertised sizes. */
export async function collectNativeMember(
  chunks: AsyncIterable<Uint8Array>,
  expectedBytes: number,
  archiveBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > AUDIO_LIMITS.memberBytes ||
    archiveBytes < 1 ||
    archiveBytes > AUDIO_LIMITS.archiveBytes
  )
    throw Error("native-audio-size");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of chunks) {
      signal?.throwIfAborted();
      size += chunk.byteLength;
      if (size > expectedBytes || size > archiveBytes * AUDIO_LIMITS.expansion)
        throw Error("native-audio-size");
      parts.push(chunk.slice());
    }
    signal?.throwIfAborted();
    if (size !== expectedBytes) throw Error("native-audio-size");
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  } finally {
    for (const part of parts) part.fill(0);
  }
}
