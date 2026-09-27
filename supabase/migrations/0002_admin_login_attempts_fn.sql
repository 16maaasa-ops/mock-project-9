-- 案件9: 管理画面ログインの失敗回数を、IP単位でアトミックに記録するDB関数
--
-- 「読んで書く」の2回に分けると、同時に何度も失敗させたときにカウントが
-- ずれる（後勝ちで1回分の加算が消える）ため、1回のUPSERTで加算まで行う。
-- 5回目の失敗からロックし、失敗が続くほどロック時間を倍々に延ばす
-- （60秒 → 120秒 → 240秒 …、上限30分）。管理者は1人なので、
-- アカウント単位ではなくIP単位でロックする（第三者が管理者を締め出せないように）。
--
-- 実行方法: 0001と同じSupabaseプロジェクトのSQL Editorに貼り付けて実行する。

CREATE OR REPLACE FUNCTION case9.record_admin_login_failure(ip_in TEXT)
RETURNS TABLE(failed_count INT, locked_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = case9, pg_temp
AS $$
DECLARE
  v_failed_count INT;
  v_lock_seconds INT;
BEGIN
  INSERT INTO case9.admin_login_attempts (ip, failed_count)
    VALUES (ip_in, 1)
    ON CONFLICT (ip) DO UPDATE
      SET failed_count = case9.admin_login_attempts.failed_count + 1
    RETURNING case9.admin_login_attempts.failed_count INTO v_failed_count;

  IF v_failed_count >= 5 THEN
    v_lock_seconds := LEAST(1800, (60 * power(2, v_failed_count - 5))::INT);
    UPDATE case9.admin_login_attempts
      SET locked_until = now() + make_interval(secs => v_lock_seconds)
      WHERE ip = ip_in;
  END IF;

  RETURN QUERY
    SELECT a.failed_count, a.locked_until
    FROM case9.admin_login_attempts a
    WHERE a.ip = ip_in;
END;
$$;

REVOKE ALL ON FUNCTION case9.record_admin_login_failure(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION case9.record_admin_login_failure(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION case9.reset_admin_login_attempts(ip_in TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = case9, pg_temp
AS $$
  INSERT INTO case9.admin_login_attempts (ip, failed_count, locked_until)
    VALUES (ip_in, 0, NULL)
    ON CONFLICT (ip) DO UPDATE SET failed_count = 0, locked_until = NULL;
$$;

REVOKE ALL ON FUNCTION case9.reset_admin_login_attempts(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION case9.reset_admin_login_attempts(TEXT) TO service_role;
