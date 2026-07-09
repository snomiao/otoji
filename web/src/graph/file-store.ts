// Per-device, local file association for file-source nodes, keyed by nodeId.
// The dropped file's bytes are LOCAL to the device that dropped them and never
// go into the DO-synced graph (only a small filename lives in node config). A
// file node runs only on the device that holds its file here.

export interface FileEntry {
  kind: "audio" | "text" | "video" | "image";
  name: string;
  file?: File; // raw dropped file (audio decoded lazily at runtime)
  text?: string; // for text files, read eagerly
}

class FileStore {
  private map = new Map<string, FileEntry>();
  private listeners = new Set<() => void>();

  set(nodeId: string, entry: FileEntry): void {
    this.map.set(nodeId, entry);
    this.emit();
  }
  get(nodeId: string): FileEntry | undefined {
    return this.map.get(nodeId);
  }
  delete(nodeId: string): void {
    if (this.map.delete(nodeId)) this.emit();
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((f) => f());
  }
}

// Module-level singleton (one per device/tab) — intentionally not in React state
// or the synced graph.
export const fileStore = new FileStore();

export function fileKindForName(name: string): "audio" | "text" | "video" | "image" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "webm", "flac", "aac"].includes(ext)) return "audio";
  if (["md", "txt", "srt", "vtt", "text"].includes(ext)) return "text";
  return null;
}
