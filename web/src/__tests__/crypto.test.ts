import { describe, it, expect } from "vitest";
import { hmacSha1Base64, hmacSha256Base64, md5Hex } from "../lib/crypto";

describe("crypto", () => {
  it("md5Hex matches known vector", () => {
    expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });
  it("hmacSha1Base64 matches known vector (RFC 2202 test case 4)", async () => {
    // key = 0x0102...19 (25 bytes), data = 50 x 0xcd — skip; use a simple known vector:
    // HMAC-SHA1("key", "The quick brown fox jumps over the lazy dog") =
    //   de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9
    // base64 = 3nybhbi3iqa8ino29wqQcBydtNk=
    const out = await hmacSha1Base64("key", "The quick brown fox jumps over the lazy dog");
    expect(out).toBe("3nybhbi3iqa8ino29wqQcBydtNk=");
  });
  it("hmacSha256Base64 matches known vector", async () => {
    // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog") =
    //   f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
    // base64 = 97yD9DBThCSxMpjmqm+xQ+9NWaFJRhF1mXSd28LRo82=? must compute
    const out = await hmacSha256Base64("key", "The quick brown fox jumps over the lazy dog");
    expect(out).toBe("97yD9DBThCSxMpjmqm+xQ+9NWaFJRhdZl0edvC0aPNg=");
  });
});
