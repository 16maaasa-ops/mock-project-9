import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const config = {
  matcher: ["/admin/:path*"],
};

/**
 * /admin 配下を守る。ログイン画面自体は素通しにする。
 * ここでは Cookie の署名検証だけを行い（DBは見ない）、実際の認可チェックは
 * 各ページ・Server Action の先頭で verifySession() が行う（多層防御）。
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const valid = token ? await verifySessionToken(token) : false;
  if (!valid) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}
