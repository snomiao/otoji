import { NODE_SPECS, type NodeType, type VoiceNode } from "./model";

export type GraphCommand =
  | { op: "add"; type: NodeType; id?: string; config?: Record<string, unknown> }
  | { op: "connect"; from: string; fromPort?: string; to: string; toPort?: string }
  | { op: "remove"; id: string };

export type NodeReferenceResolution = { id: string } | { error: string };

function firstJsonArray(text: string): string | null {
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (char === "[") { start = i; depth = 1; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(entry: Record<string, unknown>, field: string, index: number): string | { error: string } {
  const value = entry[field];
  return typeof value === "string" && value.length > 0 ? value : { error: `command ${index + 1}: ${field} must be a non-empty string` };
}

/** Extract and strictly validate the first JSON command array in LLM output. */
export function parseGraphCommands(text: string): GraphCommand[] | { error: string } {
  const json = firstJsonArray(text);
  if (!json) return { error: "expected a JSON array of graph commands" };
  let value: unknown;
  try { value = JSON.parse(json); }
  catch (error) { return { error: `invalid JSON array: ${error instanceof Error ? error.message : String(error)}` }; }
  if (!Array.isArray(value)) return { error: "expected a JSON array of graph commands" };
  const commands: GraphCommand[] = [];
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (!isRecord(entry)) return { error: `command ${index + 1}: expected an object` };
    if (entry.op !== "add" && entry.op !== "connect" && entry.op !== "remove") return { error: `command ${index + 1}: unknown op ${JSON.stringify(entry.op)}` };
    if (entry.op === "add") {
      if (typeof entry.type !== "string" || !(entry.type in NODE_SPECS)) return { error: `command ${index + 1}: unknown node type ${JSON.stringify(entry.type)}` };
      if (entry.id !== undefined && (typeof entry.id !== "string" || !entry.id)) return { error: `command ${index + 1}: id must be a non-empty string` };
      if (entry.config !== undefined && !isRecord(entry.config)) return { error: `command ${index + 1}: config must be an object` };
      commands.push({ op: "add", type: entry.type as NodeType, ...(entry.id === undefined ? {} : { id: entry.id }), ...(entry.config === undefined ? {} : { config: entry.config }) });
    } else if (entry.op === "connect") {
      const from = stringField(entry, "from", index); if (typeof from !== "string") return from;
      const to = stringField(entry, "to", index); if (typeof to !== "string") return to;
      if (entry.fromPort !== undefined && (typeof entry.fromPort !== "string" || !entry.fromPort)) return { error: `command ${index + 1}: fromPort must be a non-empty string` };
      if (entry.toPort !== undefined && (typeof entry.toPort !== "string" || !entry.toPort)) return { error: `command ${index + 1}: toPort must be a non-empty string` };
      commands.push({ op: "connect", from, to, ...(entry.fromPort === undefined ? {} : { fromPort: entry.fromPort }), ...(entry.toPort === undefined ? {} : { toPort: entry.toPort }) });
    } else {
      const id = stringField(entry, "id", index); if (typeof id !== "string") return id;
      commands.push({ op: "remove", id });
    }
  }
  return commands;
}

/** Resolve an LLM reference without guessing between nodes of the same type. */
export function resolveGraphNodeReference(reference: string, nodes: Iterable<VoiceNode>, justAdded: Iterable<VoiceNode> = []): NodeReferenceResolution {
  const all = [...nodes];
  const added = [...justAdded];
  if ([...all, ...added].some((node) => node.id === reference)) return { id: reference };
  const typeMatches = all.filter((node) => node.type === reference);
  if (typeMatches.length === 1) return { id: typeMatches[0].id };
  if (typeMatches.length > 1) return { error: `ambiguous node reference ${JSON.stringify(reference)} (${typeMatches.length} matches)` };
  const addedMatches = added.filter((node) => node.type === reference);
  if (addedMatches.length === 1) return { id: addedMatches[0].id };
  if (addedMatches.length > 1) return { error: `ambiguous just-added node reference ${JSON.stringify(reference)} (${addedMatches.length} matches)` };
  return { error: `unresolved node reference ${JSON.stringify(reference)}` };
}
