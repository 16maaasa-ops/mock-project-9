import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 案件9専用のスキーマ名。他案件（case7, case8）と同じ Supabase プロジェクトに同居させている。 */
export const SUPABASE_SCHEMA = "case9";

// この案件では Supabase の型生成（supabase gen types）をまだ導入していないため、
// テーブル定義の型引数は any にしている。スキーマ名だけを固定して db.schema の
// 指定漏れをコンパイル時に防ぐのが目的。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, "case9", "case9">;

let cached: ServiceClient | null = null;

/**
 * service_role キーで接続する、サーバー専用のクライアント。RLS を素通りする。
 * ブラウザ用のクライアントは作らない（project9 は Supabase Auth を使わず、
 * 全アクセスをこのクライアント経由のサーバー処理に限定する設計のため）。
 */
export function createServiceClient(): ServiceClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません（.env.local を確認してください）。",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached = createClient<any, "case9", "case9">(url, serviceRoleKey, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { persistSession: false },
  });
  return cached;
}
