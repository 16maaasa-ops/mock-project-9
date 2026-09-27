// DBに触れない純粋なロジックだけをここに置く（server-only を付けない）。
// テストから読み込めるようにするため。

export type LoginAttemptState = {
  failedCount: number;
  lockedUntil: string | null; // ISO文字列
};

/**
 * リクエストから接続元のIPアドレスを取り出す。
 * Vercel など、リバースプロキシ経由の環境では x-forwarded-for の先頭が
 * 実際の接続元になる。取得できない場合は "unknown" にまとめて集計する。
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/** ロック中かどうかを判定する（DBの値と現在時刻だけで決まる、純粋な判定）。 */
export function isLocked(
  state: Pick<LoginAttemptState, "lockedUntil">,
  now: Date = new Date(),
): boolean {
  if (!state.lockedUntil) return false;
  return new Date(state.lockedUntil).getTime() > now.getTime();
}
