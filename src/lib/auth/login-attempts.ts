import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { LoginAttemptState } from "./login-attempts-pure";

export type { LoginAttemptState } from "./login-attempts-pure";
export { getClientIp, isLocked } from "./login-attempts-pure";

export async function checkLoginLock(ip: string): Promise<LoginAttemptState> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_login_attempts")
    .select("failed_count, locked_until")
    .eq("ip", ip)
    .maybeSingle();
  if (error) throw error;
  return {
    failedCount: data?.failed_count ?? 0,
    lockedUntil: data?.locked_until ?? null,
  };
}

/**
 * ログイン失敗を記録する。加算とロック判定は DB 関数の中で
 * 1回のUPSERTとして行われるため、同時に何度も失敗させても
 * カウントがずれない（IPごとに段階的にロック時間を延ばす）。
 */
export async function recordLoginFailure(
  ip: string,
): Promise<LoginAttemptState> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("record_admin_login_failure", {
    ip_in: ip,
  });
  if (error) throw error;
  const row = data?.[0] as
    { failed_count: number; locked_until: string | null } | undefined;
  return {
    failedCount: row?.failed_count ?? 0,
    lockedUntil: row?.locked_until ?? null,
  };
}

export async function resetLoginAttempts(ip: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("reset_admin_login_attempts", {
    ip_in: ip,
  });
  if (error) throw error;
}
