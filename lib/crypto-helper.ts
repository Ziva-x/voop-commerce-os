import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from environment secret
 */
function getDerivedKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.DATABASE_URL ||
    "voop-master-encryption-key-production-32bytes";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string or object using AES-256-GCM
 */
export function encryptData(data: string | Record<string, any>): string {
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getDerivedKey(), iv);

    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted (all in hex)
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  } catch (err) {
    console.error("Encryption error:", err);
    throw new Error("Failed to encrypt credentials");
  }
}

/**
 * Decrypt AES-256-GCM encrypted string into original string or parsed JSON object
 */
export function decryptData<T = any>(encryptedText: string | null | undefined): T | null {
  if (!encryptedText) return null;

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      // If data is already plaintext JSON string (e.g. legacy), parse directly
      try {
        return JSON.parse(encryptedText) as T;
      } catch {
        return encryptedText as unknown as T;
      }
    }

    const [ivHex, tagHex, contentHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const content = Buffer.from(contentHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedKey(), iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");

    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return decrypted as unknown as T;
    }
  } catch (err) {
    console.error("Decryption error:", err);
    return null;
  }
}

/**
 * Masks a secret token or key so only the last 4 characters are visible
 * e.g. "9f18a287c4" -> "••••••••87c4"
 */
export function maskSecret(value?: string | null): string {
  if (!value) return "";
  const str = String(value).trim();
  if (str.length <= 4) {
    return "••••••••";
  }
  const visible = str.slice(-4);
  return `••••••••••••${visible}`;
}
