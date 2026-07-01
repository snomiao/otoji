// Graph templates: small, reusable subgraphs that drop onto the canvas. A
// template is device-neutral data (node types + relative positions + edges by
// local key); the editor remaps keys to fresh ids and offsets to the drop point.
// Built-in demos ship in code; users can save the current selection as one
// (persisted in localStorage).

import type { NodeType } from "../graph/model";

export interface TemplateNode {
  key: string; // local id used to wire edges within the template
  type: NodeType;
  dx: number; // position relative to the template origin
  dy: number;
  config?: Record<string, unknown>;
}
export interface TemplateEdge {
  from: string;
  fromHandle: string;
  to: string;
  toHandle: string;
}
export interface GraphTemplate {
  id: string;
  name: string;
  desc?: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  builtin?: boolean;
}

const COL = 240;
const ROW = 160;

export const BUILTIN_TEMPLATES: GraphTemplate[] = [
  {
    id: "yolo-webcam",
    name: "YOLO webcam",
    desc: "Camera → object detection → labels",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "rate", to: "cam", toHandle: "rate" }, // backpressure
      { from: "yolo", fromHandle: "labels", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "narrated-yolo",
    name: "Narrated YOLO",
    desc: "Camera → detection → spoken labels (TTS)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "tts", type: "tts", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "rate", to: "cam", toHandle: "rate" },
      { from: "yolo", fromHandle: "labels", to: "tts", toHandle: "in" },
    ],
  },
  {
    id: "live-captions",
    name: "Live captions",
    desc: "Mic → STT → transcript",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "live-translate",
    name: "Live translate",
    desc: "Mic → STT → translate → transcript",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "tr", type: "translate", dx: COL * 2, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 3, dy: 0 },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "tr", toHandle: "in" },
      { from: "tr", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "mix-two-mics",
    name: "Mix two mics",
    desc: "Two mics → time-aligned mix → STT (pick a device on each mic)",
    builtin: true,
    nodes: [
      { key: "mic1", type: "mic-vad", dx: 0, dy: 0 },
      { key: "mic2", type: "mic-vad", dx: 0, dy: ROW },
      { key: "mix", type: "audio-mix", dx: COL, dy: ROW / 2 },
      { key: "stt", type: "stt", dx: COL * 2, dy: ROW / 2 },
      { key: "sink", type: "sink", dx: COL * 3, dy: ROW / 2 },
    ],
    edges: [
      { from: "mic1", fromHandle: "out", to: "mix", toHandle: "in" },
      { from: "mic2", fromHandle: "out", to: "mix", toHandle: "in" },
      { from: "mix", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-audio-stt",
    name: "Screen audio → STT",
    desc: "Capture tab/system audio → transcript (share a tab with audio)",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "screen", fromHandle: "audio", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-yolo",
    name: "Screen YOLO",
    desc: "Screen share → object detection → labels",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "rate", to: "screen", toHandle: "rate" }, // backpressure
      { from: "yolo", fromHandle: "labels", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-depth",
    name: "Screen depth",
    desc: "Screen share → live depth map (preview)",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "depth", type: "vision-model", dx: COL, dy: 0, config: { task: "depth" } },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "depth", toHandle: "in" },
      { from: "depth", fromHandle: "rate", to: "screen", toHandle: "rate" },
    ],
  },
  {
    id: "depth-cam",
    name: "Depth camera",
    desc: "Camera → live depth map (preview)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "depth", type: "vision-model", dx: COL, dy: 0, config: { task: "depth" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "depth", toHandle: "in" },
      { from: "depth", fromHandle: "rate", to: "cam", toHandle: "rate" },
    ],
  },
  {
    id: "pose-mirror",
    name: "Pose mirror",
    desc: "Camera → body pose skeleton (MediaPipe)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "pose", type: "vision-model", dx: COL, dy: 0, config: { task: "pose" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "pose", toHandle: "in" },
      { from: "pose", fromHandle: "rate", to: "cam", toHandle: "rate" },
    ],
  },
  {
    id: "hand-tracking",
    name: "Hand tracking",
    desc: "Camera → hand landmarks (MediaPipe)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "hand", type: "vision-model", dx: COL, dy: 0, config: { task: "hand" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "hand", toHandle: "in" },
      { from: "hand", fromHandle: "rate", to: "cam", toHandle: "rate" },
    ],
  },
  {
    id: "caption-objects",
    name: "Caption + objects",
    desc: "Voice captions and webcam object labels side by side",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "vsink", type: "sink", dx: COL * 2, dy: 0 },
      { key: "cam", type: "camera", dx: 0, dy: ROW },
      { key: "yolo", type: "vision-model", dx: COL, dy: ROW },
      { key: "osink", type: "sink", dx: COL * 2, dy: ROW },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "vsink", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "rate", to: "cam", toHandle: "rate" },
      { from: "yolo", fromHandle: "labels", to: "osink", toHandle: "in" },
    ],
  },
];

// ---- User templates (localStorage) ----------------------------------------

const KEY = "otoji.templates";

export function loadUserTemplates(): GraphTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GraphTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(list: GraphTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota */
  }
}

export function saveUserTemplate(t: GraphTemplate): GraphTemplate[] {
  const list = loadUserTemplates().filter((x) => x.id !== t.id);
  list.push(t);
  persist(list);
  return list;
}

export function deleteUserTemplate(id: string): GraphTemplate[] {
  const list = loadUserTemplates().filter((x) => x.id !== id);
  persist(list);
  return list;
}

/** Build a template from a selection of nodes (+ the edges fully inside it).
 *  Positions are normalized so the top-left node sits at the origin. */
export function templateFromSelection(
  name: string,
  sel: { id: string; type: NodeType; x: number; y: number; config?: Record<string, unknown> }[],
  edges: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }[],
  idSuffix: string,
): GraphTemplate {
  const minX = Math.min(...sel.map((n) => n.x));
  const minY = Math.min(...sel.map((n) => n.y));
  const keyOf = new Map(sel.map((n, i) => [n.id, `n${i}`]));
  const ids = new Set(sel.map((n) => n.id));
  return {
    id: `user-${idSuffix}`,
    name,
    nodes: sel.map((n) => ({
      key: keyOf.get(n.id)!,
      type: n.type,
      dx: n.x - minX,
      dy: n.y - minY,
      config: n.config && Object.keys(n.config).length ? n.config : undefined,
    })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        from: keyOf.get(e.source)!,
        fromHandle: e.sourceHandle ?? "out",
        to: keyOf.get(e.target)!,
        toHandle: e.targetHandle ?? "in",
      })),
  };
}
