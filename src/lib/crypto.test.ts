import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const KEY = "test-passphrase-123";

describe("crypto", () => {
  it("round-trips a token", () => {
    const token = "IGQVJ-example-long-lived-token";
    const payload = encrypt(token, KEY);
    expect(payload).not.toContain(token);
    expect(decrypt(payload, KEY)).toBe(token);
  });

  it("fails to decrypt with a different key", () => {
    const payload = encrypt("secret", KEY);
    expect(() => decrypt(payload, "wrong-key-123")).toThrow();
  });

  it("detects tampered payloads", () => {
    const payload = encrypt("secret", KEY);
    const parts = payload.split(".");
    parts[3] = Buffer.from("garbage").toString("base64");
    expect(() => decrypt(parts.join("."), KEY)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("not-encrypted", KEY)).toThrow("Malformed");
  });
});
