// Build/typecheck fallback for @snomiao/rgui.
//
// The rgui readable-grid renderer is an OPTIONAL local dependency (not yet on
// npm). tsconfig `paths` maps `@snomiao/rgui` here so `tsgo --noEmit` typechecks
// without the lib installed, and vite's alias falls back here when the real lib
// isn't resolvable (CI / production builds). It throws when actually invoked, so
// `?renderer=rgui` shows a "renderer unavailable" notice instead of crashing.
// Local dev with the lib present resolves to the real package via the vite alias.

export interface RgViewer {
  setGraph(g: unknown): void;
  invalidate(): void;
  destroy(): void;
}

export default function createRgui(_canvas: HTMLCanvasElement, _options?: unknown): RgViewer {
  throw new Error("@snomiao/rgui is not installed in this build");
}
