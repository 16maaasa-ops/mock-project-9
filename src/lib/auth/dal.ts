import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * ログイン済みであることを確認する。未ログインなら /admin/login へ飛ばす。
 * (authenticated) レイアウトと、すべての Server Action の先頭で必ず呼ぶこと。
 * 同じリクエスト内で何度呼んでも Cookie の検証は1回だけになるよう cache() で包む。
 */
export const verifySession = cache(async (): Promise<void> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE.name)?.value;
  const valid = token ? await verifySessionToken(token) : false;
  if (!valid) {
    redirect("/admin/login");
  }
});
