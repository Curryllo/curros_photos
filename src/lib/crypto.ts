import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase, "utf8").digest();
}

/** Encrypts with AES-256-GCM. Output format: v1.<iv-b64>.<tag-b64>.<data-b64> */
export function encrypt(plaintext: string, passphrase: string): string {
  if (!passphrase) throw new Error("Missing encryption passphrase");
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decrypt(payload: string, passphrase: string): string {
  if (!passphrase) throw new Error("Missing encryption passphrase");
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
