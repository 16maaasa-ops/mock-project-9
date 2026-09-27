import "server-only";
import { SignJWT, jwtVerify } from "jose";

/** 管理画面のログイン状態を保持する Cookie の設定。 */
export const SESSION_COOKIE = {
  name: "admin_session",
  maxAgeSeconds: 60 * 60 * 24 * 30, // 30日
} as const;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET が設定されていません。openssl rand -base64 32 などで作り、.env.local に設定してください。",
    );
  }
  return new TextEncoder().encode(secret);
}

/** ログイン成功時に発行する、署名付きのセッショントークン。 */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE.maxAgeSeconds}s`)
    .sign(getSecretKey());
}

/** Cookie のトークンが有効な管理者セッションかを確認する。 */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
