import { findEditableTarget, isSensitiveElement, type EditableTarget } from "./input";

export interface ContextOptions {
  /** Context and optional polishing must be explicitly enabled by the user. */
  enabled: boolean;
  adapters?: { slack?: boolean; github?: boolean };
  maxChars?: number;
}

export interface SiteContext {
  site: "generic" | "slack" | "github";
  title: string;
  selection?: string;
  nearEditor?: string;
  messages?: string[];
}

const excluded =
  "input,textarea,select,option,button,script,style,noscript,template,[contenteditable],[data-otoji-interim]";

/** Read visible text nodes, never form values, editor drafts, or hidden descendants. */
function visibleText(element: Element, limit: number): string {
  if (isSensitiveElement(element) || element.matches(excluded)) return "";
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let text = "";
  let visited = 0;
  for (
    let node = walker.nextNode();
    node && text.length < limit && visited++ < 1000;
    node = walker.nextNode()
  ) {
    const owner = node.parentElement;
    if (!owner || owner.closest(excluded) || isSensitiveElement(owner)) continue;
    text += ` ${node.textContent ?? ""}`.slice(0, limit - text.length);
  }
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

function selectedText(doc: Document, limit: number): string {
  const selection = doc.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return "";
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const ancestor = common.nodeType === 1 ? (common as Element) : common.parentElement;
  if (!ancestor || ancestor.closest(excluded) || isSensitiveElement(ancestor)) return "";
  // Iterate the original nodes so visibility is evaluated before any cloning.
  const walker = doc.createTreeWalker(common, 4);
  const nodes: Node[] = common.nodeType === 3 ? [common] : [];
  let count = 0;
  for (let node = walker.nextNode(); node && count++ < 1000; node = walker.nextNode())
    nodes.push(node);
  let text = "";
  for (const node of nodes) {
    const owner = node.parentElement;
    if (
      !owner ||
      owner.closest(excluded) ||
      isSensitiveElement(owner) ||
      !range.intersectsNode(node)
    )
      continue;
    const start = range.startContainer === node ? range.startOffset : 0;
    const end = range.endContainer === node ? range.endOffset : node.textContent?.length;
    text += (node.textContent ?? "").slice(start, end).slice(0, limit - text.length);
    if (text.length >= limit) break;
  }
  return text.replace(/\s+/g, " ").trim();
}

function editorLabels(target: EditableTarget | null, limit: number): string {
  if (!target || isSensitiveElement(target)) return "";
  const doc = target.ownerDocument;
  const labels: Element[] = [];
  // Only explicit labels and a nearby heading; never serialize a form/container.
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
    labels.push(...Array.from((target as HTMLInputElement).labels ?? []));
  for (const id of (target.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)) {
    const label = doc.getElementById(id);
    if (label) labels.push(label);
  }
  const heading = target
    .closest('form,section,[role="dialog"]')
    ?.querySelector('h1,h2,h3,[role="heading"]');
  if (heading) labels.push(heading);
  return [...new Set(labels)]
    .map((label) => visibleText(label, limit))
    .filter(Boolean)
    .join(" ")
    .slice(0, limit);
}

export interface ContextAdapter {
  site: SiteContext["site"];
  matches(hostname: string): boolean;
  messages(target: EditableTarget, limit: number): string[];
}

export const GenericAdapter: ContextAdapter = {
  site: "generic",
  matches: () => true,
  messages: () => [],
};

export const SlackAdapter: ContextAdapter = {
  site: "slack",
  matches: (hostname) => hostname === "app.slack.com" || hostname.endsWith(".slack.com"),
  messages(target, limit) {
    const thread = target.closest(
      '[data-otoji-thread],[data-thread-id],[data-qa="thread_flexpane"]',
    );
    if (!thread) return [];
    return Array.from(
      thread.querySelectorAll(
        '[data-message-id] .c-message_kit__text,[data-qa="message-text"],.c-message_kit__text',
      ),
    )
      .slice(-8)
      .map((message) => visibleText(message, limit))
      .filter(Boolean);
  },
};

export const GitHubAdapter: ContextAdapter = {
  site: "github",
  matches: (hostname) => hostname === "github.com",
  messages(target, limit) {
    const thread = target.closest(
      "[data-otoji-thread],.js-review-thread,.js-discussion,.discussion-timeline",
    );
    if (!thread) return [];
    return Array.from(thread.querySelectorAll(".comment-body"))
      .slice(-8)
      .map((message) => visibleText(message, limit))
      .filter(Boolean);
  },
};

/** No network activity. The caller decides whether to pass this to an opted-in LLM. */
export function collectContext(
  options: ContextOptions,
  target: EditableTarget | null = findEditableTarget(),
  doc: Document = target?.ownerDocument ?? document,
): SiteContext | null {
  if (
    !options.enabled ||
    (target && (isSensitiveElement(target) || !findEditableTarget(doc, target)))
  )
    return null;
  const requestedLimit = options.maxChars ?? 2048;
  let remaining = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(8192, Math.floor(requestedLimit)))
    : 2048;
  const take = (text: string, maximum = remaining): string => {
    const value = text.slice(0, Math.min(remaining, maximum));
    remaining -= value.length;
    return value;
  };
  const hostname = doc.location.hostname;
  const adapter =
    [SlackAdapter, GitHubAdapter].find((candidate) => candidate.matches(hostname)) ??
    GenericAdapter;
  const context: SiteContext = { site: adapter.site, title: take(doc.title, 256) };
  const selection = take(selectedText(doc, Math.min(remaining, 512)));
  if (selection) context.selection = selection;
  const nearEditor = take(editorLabels(target, Math.min(remaining, 256)));
  if (nearEditor) context.nearEditor = nearEditor;
  const adapterEnabled =
    adapter.site === "slack"
      ? options.adapters?.slack
      : adapter.site === "github"
        ? options.adapters?.github
        : false;
  if (target && adapterEnabled && remaining > 0) {
    const messages = adapter
      .messages(target, Math.min(remaining, 512))
      .map((message) => take(message))
      .filter(Boolean);
    if (messages.length) context.messages = messages;
  }
  return context;
}
