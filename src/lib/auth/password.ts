import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function makeSalt(): string {
  return randomBytes(16).toString("base64url");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return derived.toString("base64url");
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, salt), "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
