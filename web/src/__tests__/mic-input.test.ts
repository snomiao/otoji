// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { InputPipe, deepActiveElement, findEditableTarget } from "../../mic/input";

const pipes: InputPipe[] = [];
function pipe() {
  const value = new InputPipe(document);
  pipes.push(value);
  return value;
}
function field(value = "hello world") {
  const input = document.createElement("textarea");
  document.body.append(input);
  input.value = value;
  input.focus();
  return input;
}
afterEach(() => {
  pipes.splice(0).forEach((value) => value.cancel());
  document.body.replaceChildren();
});

describe("dictation input pipe", () => {
  it("previews outside the field and replaces only the captured selection", () => {
    const input = field();
    input.setSelectionRange(6, 11);
    const value = pipe();
    expect(value.begin()).toBe(true);
    expect(value.current).toBe(input);
    value.partial("earth");
    expect(input.value).toBe("hello world");
    expect(input.selectionStart).toBe(6);
    expect(document.querySelector("[data-otoji-interim]")?.textContent).toBe("earth");
    value.partial("everyone");
    expect(value.final("everyone")).toBe(true);
    expect(input.value).toBe("hello everyone");
    expect(input.selectionStart).toBe(14);
    expect(document.querySelector("[data-otoji-interim]")).toBeNull();
  });

  it("uses the native setter and bubbling input event for controlled React inputs", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let changed = "";
    function Controlled() {
      const [text, setText] = React.useState("original");
      return React.createElement("input", {
        value: text,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          changed = event.target.value;
          setText(changed);
        },
      });
    }
    flushSync(() => root.render(React.createElement(Controlled)));
    const input = host.querySelector("input")!;
    input.focus();
    input.setSelectionRange(0, 8);
    const value = pipe();
    value.begin();
    let bubbled = false;
    host.addEventListener("input", (event) => {
      bubbled = event.bubbles && (event as InputEvent).data === "spoken";
    });
    flushSync(() => {
      expect(value.final("spoken")).toBe(true);
    });
    expect(changed).toBe("spoken");
    expect(input.value).toBe("spoken");
    expect(bubbled).toBe(true);
    flushSync(() => root.unmount());
  });

  it("updates a rich editable range while preserving surrounding markup", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.setAttribute("contenteditable", "true");
    editor.innerHTML = "<b>hello</b> world <i>again</i>";
    document.body.append(editor);
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.childNodes[1], 1);
    range.setEnd(editor.childNodes[1], 6);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const value = pipe();
    expect(value.begin()).toBe(true);
    value.partial("earth");
    expect(editor.innerHTML).toBe("<b>hello</b> world <i>again</i>");
    expect(value.final("earth")).toBe(true);
    expect(editor.innerHTML).toBe("<b>hello</b> earth <i>again</i>");
  });

  it("never replaces manual edits made during partial transcription", () => {
    const input = field();
    const value = pipe();
    value.begin();
    value.partial("speech");
    input.value += "!";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(value.final("speech")).toBe(false);
    expect(input.value).toBe("hello world!");
  });

  it("inserts plain multiline text in an empty editable without requiring a selection", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    editor.focus();
    document.getSelection()!.removeAllRanges();
    const value = pipe();
    expect(value.begin()).toBe(true);
    expect(value.final("first\nsecond <literal>")).toBe(true);
    expect(editor.textContent).toBe("firstsecond <literal>");
    expect(editor.innerHTML).toBe("first<br>second &lt;literal&gt;");
    expect(editor.querySelector("literal")).toBeNull();
  });

  it("cancels an empty final without deleting selected text", () => {
    const input = field();
    input.select();
    const value = pipe();
    value.begin();
    value.partial("noise");
    expect(value.final("")).toBe(false);
    expect(input.value).toBe("hello world");
  });

  it("aborts when rich DOM changes, including a change that restores original text", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "original";
    document.body.append(editor);
    editor.focus();
    const value = pipe();
    value.begin();
    editor.textContent = "edited";
    editor.textContent = "original";
    expect(value.final("speech")).toBe(false);
    expect(editor.textContent).toBe("original");
  });

  it("does not write detached targets or a newly focused field", () => {
    const input = field();
    const value = pipe();
    value.begin();
    input.remove();
    expect(value.final("speech")).toBe(false);
    const first = field("first");
    value.begin();
    const second = field("second");
    expect(value.final("speech")).toBe(false);
    expect(first.value).toBe("first");
    expect(second.value).toBe("second");
  });

  it("retains the captured field if a microphone button takes focus and never submits", () => {
    const input = field("");
    const value = pipe();
    value.begin();
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    let submitted = false;
    document.addEventListener(
      "submit",
      () => {
        submitted = true;
      },
      { once: true },
    );
    expect(value.final("hello")).toBe(true);
    expect(input.value).toBe("hello");
    expect(document.activeElement).toBe(button);
    expect(submitted).toBe(false);
  });

  it("honors cancelable beforeinput and cleans up preview on cancellation", () => {
    const input = field();
    input.addEventListener("beforeinput", (event) => event.preventDefault());
    const value = pipe();
    value.begin();
    value.partial("speech");
    expect(value.final("speech")).toBe(false);
    expect(input.value).toBe("hello world");
    expect(document.querySelector("[data-otoji-interim]")).toBeNull();
    expect(value.current).toBeNull();
  });

  it("discovers deep shadow-root editable focus", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.append(input);
    input.focus();
    expect(deepActiveElement()).toBe(input);
    expect(findEditableTarget()).toBe(input);
    const value = pipe();
    expect(value.begin()).toBe(true);
    expect(value.final("shadow")).toBe(true);
    expect(input.value).toBe("shadow");
  });

  it.each([
    '<input type="password">',
    '<input type="hidden">',
    "<input readonly>",
    "<input disabled>",
    '<input autocomplete="cc-number">',
    '<input autocomplete="one-time-code">',
    '<input name="api_token">',
    "<fieldset disabled><textarea></textarea></fieldset>",
    '<input name="bank_account">',
    "<textarea data-sensitive></textarea>",
    "<div hidden><textarea></textarea></div>",
    '<div contenteditable="true" aria-readonly="true">x</div>',
  ])("rejects sensitive or non-editable target %s", (html) => {
    document.body.innerHTML = html;
    const target = document.querySelector("input,textarea,[contenteditable]")!;
    expect(findEditableTarget(document, target)).toBeNull();
    expect(pipe().begin(target as HTMLElement)).toBe(false);
  });
});
