#!/usr/bin/env node
// otoji gdoc — fetch a Google Doc's text locally (via the `gws` CLI) and print
// it, so it can flow into an otoji graph "Google Docs" node.
//
//   otoji gdoc <docUrlOrId> [--json] [--watch <sec>]
//     <docUrlOrId>  a Google Docs URL (…/document/d/<ID>/…) or the bare doc ID.
//     --json        emit one NDJSON line {type:"gdoc",id,title,text} instead of
//                   plain text (handy when piping into a graph node with metadata).
//     --watch <sec> re-fetch every <sec> seconds and print again on change
//                   (poor-man's live sync until the graph does it natively).
//
// The fetch is NATIVE: it runs `gws docs documents get` with YOUR local Google
// auth, so private docs work and there's no browser/CORS involved. Pipe it into
// a room to feed a node:
//
//   otoji gdoc <url> | otoji node <room/nodeId>
//   otoji gdoc <url> --watch 30 | otoji node <room/nodeId>
//
// Requires the `gws` CLI on PATH (Google Workspace CLI) and a valid login
// (`gws auth login` if you see an auth error).

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let pos = args.filter((a) => !a.startsWith("-"));
if (pos[0] === "gdoc") pos = pos.slice(1); // allow `otoji gdoc <...>` (leading subcommand)
const asJson = args.includes("--json");
const watchIdx = args.indexOf("--watch");
const watchSec = watchIdx >= 0 ? Math.max(1, Number(args[watchIdx + 1]) || 30) : 0;
const gws = process.env.OTOJI_GWS || "gws";

const raw = (pos[0] || "").trim();
if (!raw) {
  console.error("usage: otoji gdoc <docUrlOrId> [--json] [--watch <sec>]");
  process.exit(2);
}

// Accept a full URL (…/document/d/<ID>/…), an ?id=<ID> form, or a bare ID.
function extractDocId(s) {
  const m =
    s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    s.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

const docId = extractDocId(raw);
if (!docId) {
  console.error(`otoji gdoc: could not find a Google Docs ID in "${raw}"`);
  process.exit(2);
}

// Run `gws docs documents get` and return the parsed document JSON.
function fetchDoc(id) {
  return new Promise((resolve, reject) => {
    const params = JSON.stringify({ documentId: id });
    const child = spawn(gws, ["docs", "documents", "get", "--params", params, "--format", "json"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      reject(new Error(e.code === "ENOENT" ? `\`${gws}\` not found on PATH — install the gws CLI` : e.message)),
    );
    child.on("close", (code) => {
      let doc;
      try {
        doc = JSON.parse(out);
      } catch {
        return reject(new Error(err.trim() || `gws exited ${code} with no JSON`));
      }
      if (doc && doc.error) {
        const msg = doc.error.message || JSON.stringify(doc.error);
        return reject(new Error(msg));
      }
      if (code !== 0 && !doc?.body) return reject(new Error(err.trim() || `gws exited ${code}`));
      resolve(doc);
    });
  });
}

// Walk the Docs API document into plain text. Handles paragraphs (with nested
// textRuns) and tables (recursively); ignores images/positioned objects. Good
// enough for a v1 read-only node — not a full round-trip of the doc structure.
function docToText(doc) {
  const parts = [];
  const walkContent = (content) => {
    for (const el of content || []) {
      if (el.paragraph) {
        let line = "";
        for (const pe of el.paragraph.elements || []) {
          if (pe.textRun && typeof pe.textRun.content === "string") line += pe.textRun.content;
        }
        parts.push(line);
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          const cells = (row.tableCells || []).map((cell) => {
            const before = parts.length;
            walkContent(cell.content);
            return parts.splice(before).join("").trim();
          });
          parts.push(cells.join("\t") + "\n");
        }
      } else if (el.tableOfContents) {
        walkContent(el.tableOfContents.content);
      }
    }
  };
  walkContent(doc?.body?.content);
  // textRun contents already carry their own newlines; strip a trailing blank.
  return parts.join("").replace(/\n+$/, "\n").replace(/\n$/, "");
}

async function once() {
  const doc = await fetchDoc(docId);
  const title = doc.title || "";
  const text = docToText(doc);
  if (asJson) {
    process.stdout.write(JSON.stringify({ type: "gdoc", id: docId, title, text }) + "\n");
  } else {
    process.stdout.write(text + "\n");
  }
  return text;
}

try {
  let last = await once();
  if (watchSec) {
    setInterval(async () => {
      try {
        const doc = await fetchDoc(docId);
        const text = docToText(doc);
        if (text !== last) {
          last = text;
          if (asJson) process.stdout.write(JSON.stringify({ type: "gdoc", id: docId, title: doc.title || "", text }) + "\n");
          else process.stdout.write(text + "\n");
        }
      } catch (e) {
        console.error("otoji gdoc:", e.message);
      }
    }, watchSec * 1000);
  }
} catch (e) {
  console.error("otoji gdoc:", e.message);
  process.exit(1);
}
