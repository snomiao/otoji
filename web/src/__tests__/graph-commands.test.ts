import { describe, expect, it } from "vitest";
import { parseGraphCommands, resolveGraphNodeReference } from "../graph/graph-commands";
import type { VoiceNode } from "../graph/model";

const node = (id: string, type: VoiceNode["type"]): VoiceNode => ({ id, type, device: null, pos: { x: 0, y: 0 } });

describe("parseGraphCommands", () => {
  it("parses a clean command array", () => {
    expect(parseGraphCommands('[{"op":"add","type":"stt"},{"op":"remove","id":"old"}]')).toEqual([
      { op: "add", type: "stt" },
      { op: "remove", id: "old" },
    ]);
  });

  it("extracts fenced JSON surrounded by prose", () => {
    expect(parseGraphCommands('Here you go:\n```json\n[{"op":"connect","from":"mic-vad","to":"stt"}]\n```\nDone.')).toEqual([
      { op: "connect", from: "mic-vad", to: "stt" },
    ]);
  });

  it("rejects an unknown operation", () => {
    expect(parseGraphCommands('[{"op":"rename","id":"stt"}]')).toEqual({ error: 'command 1: unknown op "rename"' });
  });

  it("rejects text without an array", () => {
    expect(parseGraphCommands('{"op":"add","type":"stt"}')).toEqual({ error: "expected a JSON array of graph commands" });
  });
});

describe("resolveGraphNodeReference", () => {
  it("prefers exact ids and resolves unique graph types", () => {
    const nodes = [node("stt", "sink"), node("asr-1", "stt")];
    expect(resolveGraphNodeReference("stt", nodes)).toEqual({ id: "stt" });
    expect(resolveGraphNodeReference("sink", nodes)).toEqual({ id: "stt" });
  });

  it("rejects ambiguous types", () => {
    expect(resolveGraphNodeReference("stt", [node("a", "stt"), node("b", "stt")])).toEqual({ error: 'ambiguous node reference "stt" (2 matches)' });
  });

  it("resolves a unique just-added type after graph lookup", () => {
    expect(resolveGraphNodeReference("translate", [node("asr", "stt")], [node("translate-new", "translate")])).toEqual({ id: "translate-new" });
  });
});
