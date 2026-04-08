import md5 from "blueimp-md5";
import { bytesToBase64 } from "./base64";

export function md5Hex(input: string): string {
  return md5(input);
}

async function importHmacKey(keyBytes: Uint8Array, hash: "SHA-1" | "SHA-256") {
  return crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
}

export async function hmacSha1Base64(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await importHmacKey(enc.encode(key), "SHA-1");
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg) as unknown as BufferSource);
  return bytesToBase64(new Uint8Array(sig));
}

export async function hmacSha256Base64(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await importHmacKey(enc.encode(key), "SHA-256");
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg) as unknown as BufferSource);
  return bytesToBase64(new Uint8Array(sig));
}
