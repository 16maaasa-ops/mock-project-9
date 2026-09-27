import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  checkLoginLock,
  getClientIp,
  isLocked,
  recordLoginFailure,
  resetLoginAttempts,
} from "@/lib/auth/login-attempts";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = getClientIp(request);

  const lockState = await checkLoginLock(ip);
  if (isLocked(lockState)) {
    return NextResponse.json(
      {
        error:
          "失敗が続いたため、しばらく時間をおいてからもう一度お試しください。",
      },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const adminId = process.env.ADMIN_ID;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminId || !adminPasswordHash) {
    console.error("ADMIN_ID または ADMIN_PASSWORD_HASH が未設定です。");
    return NextResponse.json(
      { error: "サーバー側の設定が未完了です。管理者に確認してください。" },
      { status: 500 },
    );
  }

  // ID/パスワードのどちらが誤りかは区別せず、常に同じ応答時間・同じ文言にする。
  // bcrypt.compare は id の一致に関わらず必ず実行し、処理時間からの推測を防ぐ。
  const passwordMatches =
    password.length > 0 && (await bcrypt.compare(password, adminPasswordHash));
  const idMatches = id.length > 0 && id === adminId;

  if (!idMatches || !passwordMatches) {
    await recordLoginFailure(ip);
    return NextResponse.json(
      { error: "IDまたはパスワードが正しくありません。" },
      { status: 401 },
    );
  }

  await resetLoginAttempts(ip);

  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE.maxAgeSeconds,
  });

  return NextResponse.json({ ok: true });
}
