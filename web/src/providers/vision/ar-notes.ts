// AR sticky notes: pinch (thumb tip ↔ index tip) places a billboard note at
// the calibrated fingertip position in camera space; notes render into the
// camera frame with three.js. Notes live in the node's config so they persist
// and sync to every device in the room like any other graph edit.

import * as THREE from "three";
import type { CalibratedSpace } from "./spatial-renderer";

export interface ArNote {
  id: string;
  text: string;
  color: string;
  pos: { x: number; y: number; z: number }; // camera space, meters, +z forward
  at: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

// Classic sticky-note palette, cycled by placement order.
export const NOTE_COLORS = ["#ffd75e", "#7ddb84", "#7cc4ff", "#ff9eb5", "#d6a2ff"];

// Pinch = thumb tip (4) to index tip (8) distance, normalized by hand span
// (wrist 0 to middle-finger MCP 9) so it's invariant to hand distance.
export const PINCH_ON = 0.32;
export const PINCH_OFF = 0.52;

export function pinchRatio(landmarks: HandLandmark[] | undefined): number | null {
  const thumb = landmarks?.[4];
  const index = landmarks?.[8];
  const wrist = landmarks?.[0];
  const knuckle = landmarks?.[9];
  if (!thumb || !index || !wrist || !knuckle) return null;
  const span = Math.hypot(wrist.x - knuckle.x, wrist.y - knuckle.y);
  if (span < 1e-6) return null;
  return Math.hypot(thumb.x - index.x, thumb.y - index.y) / span;
}

export type PinchEvent = "start" | "hold" | "end" | "idle";

/** Edge-triggered pinch state machine with hysteresis. Starts "unknown" so a
 *  hand that is already pinching when tracking (re)starts doesn't fire a
 *  spurious "start" (e.g. after a runtime restart mid-pinch). */
export class PinchTracker {
  private state: "unknown" | "open" | "pinched" = "unknown";

  update(landmarks: HandLandmark[] | undefined): PinchEvent {
    const ratio = pinchRatio(landmarks);
    if (ratio == null) {
      const wasPinched = this.state === "pinched";
      this.state = "unknown";
      return wasPinched ? "end" : "idle";
    }
    if (ratio < PINCH_ON) {
      const prev = this.state;
      this.state = "pinched";
      return prev === "open" ? "start" : "hold";
    }
    if (ratio > PINCH_OFF) {
      const wasPinched = this.state === "pinched";
      this.state = "open";
      return wasPinched ? "end" : "idle";
    }
    // Hysteresis band: keep the current state ("unknown" resolves to open).
    if (this.state === "pinched") return "hold";
    this.state = "open";
    return "idle";
  }
}

export function placeNote(notes: ArNote[], text: string, pos: { x: number; y: number; z: number }, at: number): ArNote[] {
  const note: ArNote = {
    id: `note-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
    pos: { x: pos.x, y: pos.y, z: pos.z },
    at,
  };
  return [...notes, note];
}

const NOTE_WORLD_SIZE = 0.12; // meters — a real sticky note is ~7.6cm; slightly larger reads better

function noteCanvas(text: string, color: string): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.03);
  ctx.translate(-size / 2, -size / 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(14, 18, size - 24, size - 28);
  ctx.fillStyle = color;
  ctx.fillRect(8, 8, size - 24, size - 28);
  // folded corner
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.moveTo(size - 16, size - 62);
  ctx.lineTo(size - 16, size - 20);
  ctx.lineTo(size - 58, size - 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2d3136";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > size - 64 && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
    if (lines.length === 3) break;
  }
  if (line && lines.length < 4) lines.push(line);
  const startY = size / 2 - ((lines.length - 1) * 50) / 2;
  lines.forEach((l, i) => ctx.fillText(l, size / 2 - 4, startY + i * 50, size - 56));
  ctx.restore();
  return canvas;
}

export class ArNotesRenderer {
  private canvas = document.createElement("canvas");
  private renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
  private sprites = new Map<string, THREE.Sprite>(); // note id -> sprite
  private textures = new Map<string, THREE.CanvasTexture>(); // text|color -> texture

  constructor() {
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
  }

  private textureFor(note: ArNote): THREE.CanvasTexture {
    const key = `${note.color}|${note.text}`;
    let tex = this.textures.get(key);
    if (!tex) {
      tex = new THREE.CanvasTexture(noteCanvas(note.text, note.color));
      this.textures.set(key, tex);
    }
    return tex;
  }

  private syncSprites(notes: ArNote[]): void {
    const alive = new Set(notes.map((n) => n.id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(id);
    }
    for (const note of notes) {
      let sprite = this.sprites.get(note.id);
      const texture = this.textureFor(note);
      if (!sprite) {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        sprite.scale.setScalar(NOTE_WORLD_SIZE);
        this.scene.add(sprite);
        this.sprites.set(note.id, sprite);
      } else if (sprite.material.map !== texture) {
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
      }
      // Camera space is +z forward; three looks down -Z.
      sprite.position.set(note.pos.x, note.pos.y, -note.pos.z);
    }
  }

  async render(frame: ImageBitmap, notes: ArNote[], space: CalibratedSpace | null, pinching: boolean): Promise<ImageBitmap> {
    const width = frame.width;
    const height = frame.height;
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    this.camera.aspect = width / height;
    this.camera.fov = space?.intrinsics?.fovDegrees || 60;
    this.camera.updateProjectionMatrix();
    this.syncSprites(notes);
    this.renderer.render(this.scene, this.camera);

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(frame, 0, 0);
    ctx.drawImage(this.canvas, 0, 0, width, height);
    // Pinch cursor: ring at the index fingertip (normalized image coords),
    // filled while pinching so placement has visible feedback.
    const tip = space?.landmarks?.[8];
    if (tip) {
      const x = tip.x * width;
      const y = tip.y * height;
      ctx.beginPath();
      ctx.arc(x, y, pinching ? 10 : 14, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = pinching ? "#ffd75e" : "rgba(255,255,255,0.85)";
      ctx.stroke();
      if (pinching) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd75e";
        ctx.fill();
      }
    }
    return createImageBitmap(out);
  }

  dispose(): void {
    for (const sprite of this.sprites.values()) sprite.material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.sprites.clear();
    this.textures.clear();
    this.renderer.dispose();
  }
}
