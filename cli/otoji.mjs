#!/usr/bin/env node
// otoji — subcommand launcher.
//
//   otoji node <host/room/nodeId> [-d]   bridge a terminal's stdio to a graph pipe node
//   otoji gdoc <docUrlOrId> [--json]     fetch a Google Doc's text (via the gws CLI)
//   otoji <room>                         shorthand for `otoji node <room>`
//
// Each subcommand also runs standalone (otoji-node.mjs / otoji-gdoc.mjs); this
// launcher just dispatches so a single `otoji` bin exposes them all.

const sub = process.argv[2];
if (sub === "gdoc") await import("./otoji-gdoc.mjs");
else await import("./otoji-node.mjs"); // "node <...>" or a bare room code
