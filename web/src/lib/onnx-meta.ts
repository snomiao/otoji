// Minimal ONNX (protobuf) reader that extracts `metadata_props` from a model
// without a full protobuf runtime. onnxruntime-web does NOT expose the custom
// metadata map, but SenseVoice stores the values we need (CMVN vectors, LFR
// window, blank id, ...) there — so we scan the serialized ModelProto for them.
//
// ModelProto.metadata_props is field 14 (repeated StringStringEntryProto).
// StringStringEntryProto: field 1 = key (string), field 2 = value (string).
// We skip every other field (including the multi-hundred-MB `graph`, field 7)
// by reading its length prefix and advancing — so this stays cheap.

/** Read a base-128 varint at `pos`; returns [value, nextPos]. */
function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  for (;;) {
    const byte = buf[pos++];
    result += (byte & 0x7f) * Math.pow(2, shift); // avoid 32-bit << overflow
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, pos];
}

/** Decode a UTF-8 byte range to string. */
function decodeUtf8(buf: Uint8Array, start: number, end: number): string {
  return new TextDecoder("utf-8").decode(buf.subarray(start, end));
}

/** Parse one StringStringEntryProto sub-message into [key, value]. */
function parseEntry(buf: Uint8Array, start: number, end: number): [string, string] {
  let pos = start;
  let key = "";
  let value = "";
  while (pos < end) {
    const [tag, p1] = readVarint(buf, pos);
    pos = p1;
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (wire === 2) {
      const [len, p2] = readVarint(buf, pos);
      pos = p2;
      const s = decodeUtf8(buf, pos, pos + len);
      if (field === 1) key = s;
      else if (field === 2) value = s;
      pos += len;
    } else if (wire === 0) {
      pos = readVarint(buf, pos)[1];
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else break;
  }
  return [key, value];
}

/** Extract the full `metadata_props` map from a serialized ONNX model. */
export function parseOnnxMetadata(model: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  const n = model.length;
  while (pos < n) {
    const [tag, p1] = readVarint(model, pos);
    pos = p1;
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (wire === 2) {
      const [len, p2] = readVarint(model, pos);
      pos = p2;
      if (field === 14) {
        const [k, v] = parseEntry(model, pos, pos + len);
        if (k) out[k] = v;
      }
      pos += len; // skip body (graph, entry we already read, etc.)
    } else if (wire === 0) {
      pos = readVarint(model, pos)[1];
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else break;
  }
  return out;
}

/** Parse a whitespace/comma-separated float list (SenseVoice stores CMVN so). */
export function parseFloatList(s: string): Float32Array {
  const parts = s.split(/[\s,]+/).filter((x) => x.length > 0);
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = parseFloat(parts[i]);
  return out;
}
