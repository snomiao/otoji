import { describe, it, expect, afterEach } from "vitest";
import { extractDocText, parseGoogleDocId, fetchGoogleDoc, type GoogleDocJson } from "../providers/text/google-doc";
import { GraphRuntime } from "../graph/runtime";
import { emptyGraph, type VoiceGraph } from "../graph/model";
import { browserKeyStore } from "../lib/keystore";

const DOC_ID = "1awWVokCkyH_jO6_bqYaGym0BiQtwN0OsUnTb6hcGge8";

describe("parseGoogleDocId", () => {
  it("parses an /edit URL with a fragment", () => {
    expect(parseGoogleDocId(`https://docs.google.com/document/d/${DOC_ID}/edit#heading=h.abc`)).toBe(DOC_ID);
  });
  it("parses a multi-account /u/N/ URL", () => {
    expect(parseGoogleDocId(`https://docs.google.com/document/u/2/d/${DOC_ID}/view`)).toBe(DOC_ID);
  });
  it("accepts a bare document id", () => {
    expect(parseGoogleDocId(DOC_ID)).toBe(DOC_ID);
  });
  it("rejects other URLs and short strings", () => {
    expect(parseGoogleDocId("https://example.com/doc")).toBeNull();
    expect(parseGoogleDocId("hello world")).toBeNull();
    expect(parseGoogleDocId("")).toBeNull();
    expect(parseGoogleDocId(undefined)).toBeNull();
  });
});

describe("extractDocText", () => {
  it("flattens paragraphs, tables, and trims trailing whitespace", () => {
    const doc: GoogleDocJson = {
      body: {
        content: [
          { }, // section break
          { paragraph: { elements: [{ textRun: { content: "Hello " } }, { textRun: { content: "world\n" } }] } },
          { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: "cell\n" } }] } }] }] }] } },
          { paragraph: { elements: [{ textRun: { content: "\n" } }] } },
        ],
      },
    };
    expect(extractDocText(doc)).toBe("Hello world\ncell");
  });
  it("returns empty text for an empty document", () => {
    expect(extractDocText({})).toBe("");
  });
});

describe("fetchGoogleDoc", () => {
  it("requests with a bearer token and extracts text", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const doc: GoogleDocJson = { title: "T", revisionId: "r1", body: { content: [{ paragraph: { elements: [{ textRun: { content: "doc text\n" } }] } }] } };
    const fetchFn = async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(JSON.stringify(doc), { status: 200 });
    };
    const out = await fetchGoogleDoc(DOC_ID, "tok-123", fetchFn);
    expect(seenUrl).toContain(`/v1/documents/${DOC_ID}`);
    expect(seenAuth).toBe("Bearer tok-123");
    expect(out).toEqual({ title: "T", revisionId: "r1", text: "doc text" });
  });
  it("throws with a hint on auth errors", async () => {
    const fetchFn = async () => new Response("nope", { status: 401, statusText: "Unauthorized" });
    await expect(fetchGoogleDoc(DOC_ID, "bad", fetchFn)).rejects.toThrow(/401.*expired/);
  });
});

describe("google-doc-live node (poll mode)", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    browserKeyStore().remove("GOOGLE_OAUTH_TOKEN");
  });

  function docGraph(config: Record<string, unknown>): VoiceGraph {
    const g = emptyGraph();
    g.nodes = {
      doc: { id: "doc", type: "google-doc-live", device: null, pos: { x: 0, y: 0 }, config },
      sink: { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } },
    };
    g.edges = [{ id: "e", source: "doc", sourceHandle: "out", target: "sink", targetHandle: "in" }];
    return g;
  }

  it("emits the document text once on start", async () => {
    browserKeyStore().set("GOOGLE_OAUTH_TOKEN", "tok");
    const doc: GoogleDocJson = { revisionId: "r1", body: { content: [{ paragraph: { elements: [{ textRun: { content: "live doc\n" } }] } }] } };
    globalThis.fetch = (async () => new Response(JSON.stringify(doc), { status: 200 })) as typeof fetch;
    const seen: string[] = [];
    const rt = new GraphRuntime(docGraph({ url: DOC_ID }), { onSink: (_id, t) => seen.push(t.text) });
    await rt.start();
    expect(seen).toEqual(["live doc"]);
    await rt.stop();
  });

  it("reports an error when no OAuth token is configured", async () => {
    const errors: string[] = [];
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const rt = new GraphRuntime(docGraph({ url: DOC_ID }), { onError: (e) => errors.push(e.message) });
    await rt.start();
    expect(errors.join(" ")).toContain("Google OAuth Token");
    await rt.stop();
  });

  it("reports an error when the URL is missing", async () => {
    const errors: string[] = [];
    const rt = new GraphRuntime(docGraph({}), { onError: (e) => errors.push(e.message) });
    await rt.start();
    expect(errors.join(" ")).toContain("Google Docs URL");
    await rt.stop();
  });
});
