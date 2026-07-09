import React, { useEffect, useRef, useState } from "react";

// Monaco-backed text box for the textarea node's inspector. Monaco (~a few MB)
// is dynamically imported on first mount so it lands in a lazy chunk that only
// users of the node ever download; while it loads — or if it fails (offline,
// old browser) — a plain <textarea> takes over with the same commit contract.
//
// Commit contract: `onCommit(text)` fires on blur and on Cmd/Ctrl+Enter. The
// caller persists it to the node config; unchanged text is the caller's no-op.

type Monaco = typeof import("monaco-editor");

let monacoPromise: Promise<Monaco> | null = null;
function loadMonaco(): Promise<Monaco> {
  if (!monacoPromise) {
    monacoPromise = (async () => {
      const [{ default: EditorWorker }, monaco] = await Promise.all([
        // Plain-text/markdown editing needs only the base editor worker.
        import("monaco-editor/esm/vs/editor/editor.worker?worker"),
        import("monaco-editor"),
      ]);
      (self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
      return monaco;
    })();
    // A failed load (e.g. offline dev server) should retry on the next mount.
    monacoPromise.catch(() => { monacoPromise = null; });
  }
  return monacoPromise;
}

export function MonacoText({
  value,
  onCommit,
  height = 140,
}: {
  value: string;
  onCommit: (text: string) => void;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadMonaco()
      .then((monaco) => {
        if (disposed || !hostRef.current) return;
        const ed = monaco.editor.create(hostRef.current, {
          value,
          language: "markdown",
          theme: "vs-dark",
          minimap: { enabled: false },
          lineNumbers: "off",
          wordWrap: "on",
          fontSize: 12,
          lineDecorationsWidth: 4,
          folding: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          automaticLayout: true,
          padding: { top: 4, bottom: 4 },
        });
        ed.onDidBlurEditorWidget(() => commitRef.current(ed.getValue()));
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => commitRef.current(ed.getValue()));
        editorRef.current = ed;
      })
      .catch(() => { if (!disposed) setFallback(true); });
    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // mount-only: `value` seeds the buffer; later external changes sync below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A remote edit (room sync) replaces the buffer — but never mid-typing.
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !ed.hasTextFocus() && ed.getValue() !== value) ed.setValue(value);
  }, [value]);

  if (fallback) {
    return (
      <textarea
        data-rgui-interactive
        defaultValue={value}
        onBlur={(e) => commitRef.current(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }}
        spellCheck={false}
        style={{ width: "100%", height, boxSizing: "border-box", fontSize: 12, fontFamily: "ui-monospace, monospace", resize: "none" }}
      />
    );
  }
  // data-rgui-interactive: Monaco is a custom (non-form-control) widget, so the
  // rgui overlay's click-through background would swallow its pointer events
  // without this opt-in.
  return (
    <div
      ref={hostRef}
      data-rgui-interactive
      style={{ width: "100%", height, border: "1px solid #2d3748", borderRadius: 4, overflow: "hidden" }}
    />
  );
}
