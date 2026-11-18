// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { collectContext } from "../../mic/context";

const { JSDOM } = createRequire(import.meta.url)("jsdom");

afterEach(() => {
  document.body.replaceChildren();
  document.title = "";
  document.getSelection()?.removeAllRanges();
});

function editor(html: string) {
  document.body.innerHTML = html;
  const target = document.querySelector("textarea")!;
  target.focus();
  return target;
}
function site(hostname: string): Document {
  return new JSDOM("<title>Thread title</title>", { url: `https://${hostname}/` }).window.document;
}

describe("explicit bounded context", () => {
  it("is disabled unless explicitly enabled", () => {
    const target = editor("<textarea></textarea>");
    expect(collectContext({ enabled: false }, target)).toBeNull();
  });

  it("reads labels and headings while excluding editor drafts, values, and hidden text", () => {
    document.title = "Useful page";
    const target = editor(
      '<form><h2>Write a reply <span hidden>hidden heading secret</span></h2><label for="reply">Reply</label><textarea id="reply">private draft</textarea><input value="password-secret"><p>Unrelated private message</p></form>',
    );
    const context = collectContext({ enabled: true }, target)!;
    expect(context.title).toBe("Useful page");
    expect(context.nearEditor).toBe("Reply Write a reply");
    expect(JSON.stringify(context)).not.toMatch(/private|secret|Unrelated/);
    expect(context.messages).toBeUndefined();
  });

  it("bounds all returned text with one global budget", () => {
    document.title = "t".repeat(400);
    const target = editor(
      '<label for="reply">' + "label".repeat(100) + '</label><textarea id="reply"></textarea>',
    );
    const context = collectContext({ enabled: true, maxChars: 280 }, target)!;
    expect(context.title.length + (context.nearEditor?.length ?? 0)).toBeLessThanOrEqual(280);
    expect(collectContext({ enabled: true, maxChars: 0 }, target)?.title).toBe("");
  });

  it("copies only visible selected text and excludes hidden nodes and form values", () => {
    const target = editor(
      '<p>Public <span hidden>hidden</span><input value="secret">text</p><textarea></textarea>',
    );
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(collectContext({ enabled: true }, target)?.selection).toBe("Public text");
  });

  it("does not collect context for a sensitive editor", () => {
    const target = editor('<textarea name="secret"></textarea>');
    expect(collectContext({ enabled: true }, target)).toBeNull();
  });

  it.each(["slack", "github"] as const)(
    "requires opt-in for %s messages and limits collection to the relevant thread",
    (adapter) => {
      const doc = site(adapter === "slack" ? "app.slack.com" : "github.com");
      const message = adapter === "slack" ? 'data-qa="message-text"' : 'class="comment-body"';
      doc.body.innerHTML = `<div data-otoji-thread><p ${message}>Outside thread</p></div><div data-otoji-thread><p ${message}>Relevant message</p><p ${message} hidden>Hidden message</p><textarea>Draft</textarea></div>`;
      const target = doc.querySelector("textarea")!;
      expect(collectContext({ enabled: true }, target, doc)?.messages).toBeUndefined();
      const context = collectContext(
        { enabled: true, adapters: { [adapter]: true } },
        target,
        doc,
      )!;
      expect(context.site).toBe(adapter);
      expect(context.messages).toEqual(["Relevant message"]);
    },
  );
});
