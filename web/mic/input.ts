/** Framework-independent dictation. Interim speech never changes the editor. */
export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function parent(element: Element): Element | null {
  return element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null;
}

export function deepActiveElement(doc: Document = document): Element | null {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function isSensitiveElement(element: Element): boolean {
  for (let node: Element | null = element; node; node = parent(node)) {
    if (node.matches('[hidden], [inert], [aria-hidden="true"], [data-sensitive], [data-private]'))
      return true;
    const autocomplete = node.getAttribute("autocomplete") ?? "";
    const identity = `${node.getAttribute("name") ?? ""} ${node.id}`;
    if (
      /(?:password|one-time-code|cc-)/i.test(autocomplete) ||
      /(?:password|passwd|secret|token|credit.?card|card.?number|cvc|cvv|ssn|security.?code|\bpin\b|\botp\b|\biban\b|routing.?number|bank.?account)/i.test(
        identity,
      )
    )
      return true;
    if (node.matches('input[type="password"], input[type="hidden"]')) return true;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    )
      return true;
  }
  return false;
}

export function findEditableTarget(
  doc: Document = document,
  from: Element | null = deepActiveElement(doc),
): EditableTarget | null {
  if (!from || isSensitiveElement(from)) return null;
  for (let node: Element | null = from; node; node = parent(node)) {
    if (node.tagName === "INPUT") {
      const input = node as HTMLInputElement;
      if (
        !["text", "search", "url", "tel", "email"].includes(input.type) ||
        input.matches(":disabled") ||
        input.readOnly
      )
        return null;
      return input;
    }
    if (node.tagName === "TEXTAREA") {
      const textarea = node as HTMLTextAreaElement;
      return textarea.matches(":disabled") || textarea.readOnly ? null : textarea;
    }
    const editable = node.getAttribute("contenteditable");
    if (
      editable === "false" ||
      node.getAttribute("aria-readonly") === "true" ||
      node.getAttribute("aria-disabled") === "true"
    )
      return null;
    if (editable === "" || editable === "true" || editable === "plaintext-only")
      return node as HTMLElement;
  }
  return null;
}

function isField(target: EditableTarget): target is HTMLInputElement | HTMLTextAreaElement {
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

type Snapshot = {
  target: EditableTarget;
  original: string;
  start: number;
  end: number;
  range: Range | null;
  dirty: boolean;
  observer: MutationObserver | null;
  onEdit: EventListener;
};

export class InputPipe {
  private snapshot: Snapshot | null = null;
  private preview: HTMLElement | null = null;

  constructor(private readonly doc: Document = document) {}

  get current(): EditableTarget | null {
    return this.snapshot?.target ?? null;
  }

  /** Capture the target and selection once per utterance, before mic UI takes focus. */
  begin(target: EditableTarget | null = findEditableTarget(this.doc)): boolean {
    this.cancel();
    if (!target?.isConnected || findEditableTarget(this.doc, target) !== target) return false;
    let range: Range | null = null;
    if (!isField(target)) {
      const root = target.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null };
      const selection = root.getSelection?.() ?? this.doc.getSelection();
      if (
        selection?.rangeCount &&
        target.contains(selection.anchorNode) &&
        target.contains(selection.focusNode)
      ) {
        range = selection.getRangeAt(0).cloneRange();
      } else {
        range = this.doc.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
      }
    }
    const snapshot: Snapshot = {
      target,
      original: isField(target) ? target.value : target.innerHTML,
      start: isField(target) ? (target.selectionStart ?? target.value.length) : 0,
      end: isField(target) ? (target.selectionEnd ?? target.value.length) : 0,
      range,
      dirty: false,
      observer: null,
      onEdit: () => {
        snapshot.dirty = true;
        this.removePreview();
      },
    };
    target.addEventListener("beforeinput", snapshot.onEdit);
    target.addEventListener("input", snapshot.onEdit);
    const Observer = this.doc.defaultView?.MutationObserver;
    if (!isField(target) && Observer) {
      snapshot.observer = new Observer(() => {
        snapshot.dirty = true;
        this.removePreview();
      });
      snapshot.observer.observe(target, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
    }
    this.snapshot = snapshot;
    return true;
  }

  partial(text: string): boolean {
    if (!this.valid()) {
      this.cancel();
      return false;
    }
    if (!text) {
      this.removePreview();
      return true;
    }
    const target = this.snapshot!.target;
    const preview = this.preview ?? this.doc.createElement("span");
    preview.setAttribute("data-otoji-interim", "");
    preview.setAttribute("aria-hidden", "true");
    preview.style.cssText =
      "position:fixed;z-index:2147483646;pointer-events:none;color:#888;background:Canvas;font:14px sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-width:min(480px,90vw);padding:4px 6px;border-radius:4px;";
    const rect = target.getBoundingClientRect();
    preview.style.left = `${Math.max(0, rect.left)}px`;
    preview.style.top = `${Math.max(0, rect.bottom)}px`;
    preview.textContent = text;
    if (!this.preview) (this.doc.body ?? this.doc.documentElement).append(preview);
    this.preview = preview;
    return true;
  }

  /** Commit only to the captured, unchanged target. Never focuses or submits it. */
  final(text: string): boolean {
    if (!text || !this.valid()) {
      this.cancel();
      return false;
    }
    const snapshot = this.snapshot!;
    const { target } = snapshot;
    // The page can veto insertion, including editors with their own transaction model.
    const EventClass = this.doc.defaultView!.InputEvent;
    target.removeEventListener("beforeinput", snapshot.onEdit);
    const before = new EventClass("beforeinput", {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    });
    const allowed = target.dispatchEvent(before);
    if (this.snapshot !== snapshot) return false;
    if (!allowed || !this.valid()) {
      this.cancel();
      return false;
    }
    this.cancel();
    if (isField(target)) {
      const proto =
        target.tagName === "INPUT"
          ? this.doc.defaultView!.HTMLInputElement.prototype
          : this.doc.defaultView!.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
      setter.call(
        target,
        snapshot.original.slice(0, snapshot.start) + text + snapshot.original.slice(snapshot.end),
      );
      try {
        target.setSelectionRange(snapshot.start + text.length, snapshot.start + text.length);
      } catch {
        /* Some text-like input types do not expose selection. */
      }
    } else {
      const range = snapshot.range!;
      range.deleteContents();
      const fragment = this.doc.createDocumentFragment();
      const lines = text.split(/\r\n|\r|\n/);
      lines.forEach((line, index) => {
        if (index) fragment.append(this.doc.createElement("br"));
        fragment.append(this.doc.createTextNode(line));
      });
      const last = fragment.lastChild!;
      range.insertNode(fragment);
      range.setStartAfter(last);
      range.collapse(true);
      // Keep keyboard navigation at the inserted text, without stealing focus.
      if (deepActiveElement(this.doc) === target) {
        const selection = this.doc.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    target.dispatchEvent(
      new EventClass("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text,
      }),
    );
    return true;
  }

  cancel(): void {
    const snapshot = this.snapshot;
    if (snapshot) {
      snapshot.target.removeEventListener("beforeinput", snapshot.onEdit);
      snapshot.target.removeEventListener("input", snapshot.onEdit);
      snapshot.observer?.disconnect();
    }
    this.snapshot = null;
    this.removePreview();
  }

  private valid(): boolean {
    const snapshot = this.snapshot;
    if (
      !snapshot ||
      snapshot.dirty ||
      !snapshot.target.isConnected ||
      findEditableTarget(this.doc, snapshot.target) !== snapshot.target
    )
      return false;
    if (snapshot.observer?.takeRecords().length) return false;
    const focused = deepActiveElement(this.doc);
    // Focusing another editor ends ownership; a microphone button may take focus safely.
    if (focused && focused !== snapshot.target && findEditableTarget(this.doc, focused))
      return false;
    return (
      snapshot.original ===
      (isField(snapshot.target) ? snapshot.target.value : snapshot.target.innerHTML)
    );
  }

  private removePreview(): void {
    this.preview?.remove();
    this.preview = null;
  }
}
