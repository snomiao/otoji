// Google Docs source helpers for the google-doc-live node.
//
// Poll mode reads the Docs API directly from the browser (docs.googleapis.com
// allows CORS) with an OAuth bearer token; live mode consumes an SSE stream
// from a local `otoji gdoc` bridge, which sniffs the Docs realtime sync
// channel in a headless Chrome and re-exports the text on every remote edit.

export const DEFAULT_GDOC_LIVE_SERVER = "http://127.0.0.1:8992/live";

const DOCS_API_BASE = "https://docs.googleapis.com/v1/documents";

/** Accepts a docs.google.com URL (any /edit, /view, /u/N/ variant) or a bare document id. */
export function parseGoogleDocId(input: string | undefined | null): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

interface ParagraphElement { textRun?: { content?: string } }
interface StructuralElement {
  paragraph?: { elements?: ParagraphElement[] };
  table?: { tableRows?: { tableCells?: { content?: StructuralElement[] }[] }[] };
  tableOfContents?: { content?: StructuralElement[] };
}

export interface GoogleDocJson {
  title?: string;
  revisionId?: string;
  body?: { content?: StructuralElement[] };
}

/** Flattens a documents.get body (paragraphs, tables, TOC) into plain text. */
export function extractDocText(doc: GoogleDocJson): string {
  const walk = (els: StructuralElement[] | undefined): string => {
    let out = "";
    for (const el of els ?? []) {
      if (el.paragraph) for (const pe of el.paragraph.elements ?? []) out += pe.textRun?.content ?? "";
      if (el.table) for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) out += walk(cell.content);
      if (el.tableOfContents) out += walk(el.tableOfContents.content);
    }
    return out;
  };
  return walk(doc.body?.content).replace(/\s+$/, "");
}

export async function fetchGoogleDoc(
  docId: string,
  token: string,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response> = (...a) => fetch(...a),
): Promise<{ title?: string; revisionId?: string; text: string }> {
  const res = await fetchFn(`${DOCS_API_BASE}/${encodeURIComponent(docId)}?fields=title,revisionId,body`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const hint = res.status === 401 ? " (OAuth token expired?)" : res.status === 403 ? " (no access to this doc?)" : "";
    throw new Error(`Docs API ${res.status}${hint}`);
  }
  const doc = (await res.json()) as GoogleDocJson;
  return { title: doc.title, revisionId: doc.revisionId, text: extractDocText(doc) };
}
